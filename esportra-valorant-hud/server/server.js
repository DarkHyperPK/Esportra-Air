// Esportra HUD server: one process serves the overlays + control panel and keeps live match state.
//
//   const { start } = require('./server');
//   const handle = await start({ port, key, root, dataDir });
//   // handle.stop() / handle.clientCount
//
// Overlays:   http://host:PORT/overlays/ingame.html?match=GF1
// Control:    http://host:PORT/control.html?match=GF1
// WebSocket:  ws://host:PORT/ws?match=GF1&role=overlay|control|ingest[&key=…]
// HTTP API:   GET/PUT/PATCH /api/<match>        state (PATCH = JSON merge patch)
//             POST /api/<match>/event            one-shot event to every overlay
//             POST /api/<match>/ingest/valorant  raw Overwolf game-event messages → state (adapters/valorant-gep.js)
//
// Every match is a room. On join a client gets {type:'snapshot', v, state}; after that every change arrives as
// {type:'patch', v, patch} (RFC 7386 merge patch, v increments by one). A client that sees a gap sends {type:'resync'}.
// All accepted changes are appended to data/<match>.ndjson, so a match can be rebuilt or replayed.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const { WebSocketServer } = require('ws');
// Note: require('../adapters/valorant-gep') is __dirname-relative (server/ → ../adapters/), so it resolves
// correctly regardless of the `root` parameter. No change needed here.
const { createValorantAdapter } = require('../adapters/valorant-gep');
const { DisplayFixes } = require('./display-fixes');

// ─── Pure utilities (no config dependency) ────────────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.webm': 'video/webm', '.mov': 'video/quicktime', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const clone = o => JSON.parse(JSON.stringify(o));
const persistentState = state => { const { airPause, ...saved } = state; return saved; };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, p) => { if (!isObj(p)) return p; a = isObj(a) ? a : {}; for (const k in p) { if (p[k] === null) delete a[k]; else a[k] = merge(a[k], p[k]); } return a; };
// smallest merge patch that turns a into b (arrays are replaced whole)
const diff = (a, b) => { const out = {}; let n = 0;
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (!(k in b)) { out[k] = null; n++; }
    else if (isObj(a[k]) && isObj(b[k])) { const d = diff(a[k], b[k]); if (d) { out[k] = d; n++; } }
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { out[k] = b[k]; n++; } }
  return n ? out : null; };
function body(req) { return new Promise((res, rej) => { let b = ''; req.on('data', d => { b += d; if (b.length > 2e6) req.destroy(); }); req.on('end', () => { try { res(b ? JSON.parse(b) : {}); } catch (e) { rej(e); } }); }); }
function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(obj)); }

// ─── Default state cache (loaded once per process; root-relative side-effect modules) ───
// Guard prevents double-loading when start() is called again during crash recovery.
let _DEFAULT = null, _CLEAN = null;
function loadStateDefaults(root) {
  if (_DEFAULT !== null) return;
  global.window = {};
  require(path.join(root, 'core/state.default.js'));
  _DEFAULT = global.window.HUD_DEFAULT;
  require(path.join(root, 'core/state.clean.js'));
  _CLEAN = global.window.HUD_CLEAN;
}

// ─── Factory ──────────────────────────────────────────────────────────────────
// No code runs on require(). Call start() to bring the server up.
async function start({ port, key, root, dataDir, host = '127.0.0.1', onGep, onState, resolveOutput, resolveAsset }) {
  const DATA = dataDir || path.join(root, 'server', 'data');
  const KEY = key;

  fs.mkdirSync(DATA, { recursive: true });

  loadStateDefaults(root);
  const DEFAULT = _DEFAULT, CLEAN = _CLEAN;

  const canWrite = k => typeof KEY === 'string' && KEY.length > 0 && k === KEY;

  const rooms = new Map();
  function notifyGep(r, events, messages, metadata = {}) { if (onGep) { try { onGep(r.code, r.state, events, require('./gep-features').reportedFeatures(messages), { ...metadata, messages }); } catch (_) { console.warn('[hud] Production diagnostics could not receive this update.'); } } }
  function room(code) {
    code = String(code || 'MAIN').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32) || 'MAIN';
    if (!rooms.has(code)) {
      const file = path.join(DATA, code + '.json');
      let state = clone(CLEAN);
      const ephemeral = code.startsWith('__ESA_SIM_');
      if (!ephemeral) { try { state = merge(clone(CLEAN), JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) {} }
      const fixesFile = path.join(DATA, code + '.display-fixes.json');
      let saved = null;
      if (!ephemeral) { try { if (fs.statSync(fixesFile).size <= 131072) saved = JSON.parse(fs.readFileSync(fixesFile, 'utf8')); } catch (_) {} }
      const fixes = new DisplayFixes({ saved, save: data => { if (ephemeral) return; fs.writeFileSync(fixesFile + '.tmp', JSON.stringify(data)); fs.renameSync(fixesFile + '.tmp', fixesFile); } });
      fixes.sync(state, Date.now());
      rooms.set(code, { code, v: 0, state, fixes, ephemeral, clients: new Set(), file, log: path.join(DATA, code + '.ndjson'), adapter: createValorantAdapter(), saveT: null });
    }
    return rooms.get(code);
  }
  function broadcast(r, msg) { const s = JSON.stringify(msg); for (const c of r.clients) if (c.readyState === 1) c.send(s); }
  function apply(r, next, source) {
    const before = r.fixes.view(r.state), patch = diff(r.state, next);
    r.fixes.sync(next, source === 'valorant-gep' ? r.lastGepAt : null);
    const displayPatch = diff(before, r.fixes.view(next));
    if (!patch && !displayPatch) return 0;
    r.state = next; r.v++;
    if (onState) { try { onState(r.code, r.state); } catch (_) { console.warn('[hud] Production could not receive the updated state.'); } }
    broadcast(r, { type: 'patch', v: r.v, patch: displayPatch || {} });
    if (!r.ephemeral) {
      if (patch) fs.appendFile(r.log, JSON.stringify({ t: Date.now(), v: r.v, source, patch }) + '\n', () => {});
      clearTimeout(r.saveT); r.saveT = setTimeout(() => fs.writeFile(r.file, JSON.stringify(persistentState(r.state)), () => {}), 300);
    }
    return r.v;
  }
  function event(r, ev, source) { ev = { id: `${r.code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, t: Date.now(), ...ev };
    broadcast(r, { type: 'event', event: ev }); if (!r.ephemeral) fs.appendFile(r.log, JSON.stringify({ t: ev.t, source, event: ev }) + '\n', () => {}); return ev; }

  function changeDisplayFix(r, input) {
    const before = r.fixes.view(r.state), action = r.fixes.change(input, r.state);
    const patch = diff(before, r.fixes.view(r.state));
    r.v++; broadcast(r, { type: 'patch', v: r.v, patch: patch || {} });
    if (!r.ephemeral) fs.appendFile(r.log, JSON.stringify({ t: action.at, v: r.v, source: 'air:display-fix', action }) + '\n', () => {});
    return action;
  }
  // ───── HTTP: static files + API ─────
  const server = http.createServer(async (req, res) => {
    const u = url.parse(req.url, true), parts = u.pathname.split('/').filter(Boolean);
    if(parts[0]==='air-assets'){
      if(req.method!=='GET' || parts.length!==2 || !/^[0-9a-f-]{36}$/i.test(parts[1])){res.writeHead(404);return res.end();}
      const image=resolveAsset?.(parts[1]);if(!image){res.writeHead(404);return res.end();}
      res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'});return res.end(image);
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,PATCH,POST', 'Access-Control-Allow-Headers': 'Content-Type,X-Esportra-Key' }); return res.end(); }
    if (parts[0] === 'api') {
      const r = room(parts[1]), k = req.headers['x-esportra-key'] || u.query.key;
      try {
        if (req.method === 'GET' && parts.length === 2) return send(res, 200, { match: r.code, v: r.v, state: r.fixes.view(r.state) });
        if (!canWrite(k)) return send(res, 401, { error: 'Missing or wrong X-Esportra-Key header.' });
        if (req.method === 'POST' && parts[2] === 'pause-panel') {
          const input = await body(req), next = clone(r.state);
          if (input.action === 'clear') {
            if (next.airPause?.id === input.id) { delete next.airPause; apply(r, next, 'air:pause-clear'); }
            return send(res, 200, { v: r.v });
          }
          const panel = input.panel;
          if (input.action !== 'show' || !panel || !['technical', 'timeout'].includes(panel.kind) || typeof panel.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(panel.id) || !Number.isFinite(panel.startedAt) || Math.abs(panel.startedAt - Date.now()) > 10000) return send(res, 400, { error: 'Invalid pause panel.' });
          if (panel.scope?.showId !== r.state.airContext?.showId || panel.scope?.matchId !== r.state.airContext?.matchId) return send(res, 409, { error: 'Match context changed.' });
          next.airPause = { id: panel.id, kind: panel.kind, startedAt: panel.startedAt };
          return send(res, 200, { v: apply(r, next, 'air:pause-show') || r.v });
        }
        if (parts[2] === 'display-fixes' && req.method === 'GET') return send(res, 200, r.fixes.status(r.state));
        if (parts[2] === 'display-fixes' && req.method === 'POST') {
          const action = changeDisplayFix(r, await body(req));
          return send(res, 200, { ...r.fixes.status(r.state), action });
        }
        if (req.method === 'POST' && parts[2] === 'config') {
          const patch = await body(req);
          if (!isObj(patch) || !isObj(patch.airContext)) return send(res, 400, { error: 'Show context required.' });
          const changed = r.state.airContext && JSON.stringify(r.state.airContext) !== JSON.stringify(patch.airContext);
          if (patch.sync === true && (!r.state.airContext || changed)) return send(res, 409, { error: 'Match context changed. Sync cannot replace the selected match.' });
          let next = clone(changed ? CLEAN : r.state);
          next.airContext = patch.airContext;
          if (isObj(patch.event)) next.event = merge(next.event || {}, patch.event);
          if (isObj(patch.layout)) next.layout = merge(next.layout || {}, patch.layout);
          if (typeof patch.show?.eventBug === 'boolean') next.show.eventBug = patch.show.eventBug;
          if (Array.isArray(patch.teams) && patch.teams.length === 2) next.teams = patch.teams.map((team, index) => {
            const identity = Object.fromEntries(['name', 'tag', 'color', 'logo'].filter(field => typeof team[field] === 'string').map(field => [field, team[field]]));
            return { ...next.teams[index], ...identity, ...(!r.state.airContext || changed || patch.sync === true ? { series: team.series || 0 } : {}) };
          });
          for (const field of ['casters', 'sponsors', 'veto', 'mapPool', 'schedule', 'registeredRoster']) if (Array.isArray(patch[field])) next[field] = patch[field];
          return send(res, 200, { v: apply(r, next, 'air:config') || r.v });
        }
        if (req.method === 'POST' && parts[2] === 'map-result') {
          const input = await body(req), { mapIndex, teamAScore, teamBScore } = input;
          if (input.airContext && (input.airContext.showId !== r.state.airContext?.showId || input.airContext.matchId !== r.state.airContext?.matchId)) return send(res, 409, { error: 'Match context changed.' });
          if (!Number.isInteger(mapIndex) || mapIndex < 1 || mapIndex > 9 || ![teamAScore, teamBScore].every(score => Number.isInteger(score) && score >= 0 && score <= 2147483647)) return send(res, 400, { error: 'Invalid map result.' });
          changeDisplayFix(r, { action: 'set', field: 'map_result', value: [{ mapIndex, score: teamAScore }, { mapIndex, score: teamBScore }], until: 'next_round', reason: input.reason?.trim() || 'Operator map correction' });
          return send(res, 200, { v: r.v, patch: { series: r.fixes.view(r.state).series } });
        }
        if (req.method === 'PUT' && parts.length === 2) { const base = u.query.preset === 'clean' ? CLEAN : DEFAULT; return send(res, 200, { v: apply(r, merge(clone(base), await body(req)), 'api:put') || r.v }); }
        if (req.method === 'PATCH' && parts.length === 2) return send(res, 200, { v: apply(r, merge(clone(r.state), await body(req)), 'api:patch') || r.v });
        if (req.method === 'POST' && parts[2] === 'event') return send(res, 200, event(r, await body(req), 'api'));
        if (req.method === 'POST' && parts[2] === 'ingest' && parts[3] === 'valorant') {
          const ageMs = u.query.ageMs === undefined ? 0 : Number(u.query.ageMs);
          if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 60000) return send(res, 400, { error: 'Invalid buffered packet age.' });
          const captureAt = Date.now() - ageMs;
          const b = await body(req), msgs = Array.isArray(b) ? b : [b]; let s = clone(r.state); const evs = [];
          for (const m of msgs) { const out = r.adapter.ingest(s, m, captureAt); s = out.state; evs.push(...out.events); }
          if (msgs.length) r.lastGepAt = captureAt;
          const v = apply(r, s, 'valorant-gep') || r.v; evs.forEach(e => event(r, e, 'valorant-gep'));
          notifyGep(r, evs, msgs, { captureAt, recovered: u.query.recovered === '1' });
          return send(res, 200, { v, events: evs.length });
        }
        return send(res, 404, { error: 'Unknown API route.' });
      } catch (e) { return send(res, 400, { error: 'Request body must be valid JSON: ' + e.message }); }
    }
    if (parts[0] === 'health') return send(res, 200, { ok: true, rooms: [...rooms.values()].map(r => ({ match: r.code, v: r.v, clients: r.clients.size })) });
    if (parts[0] === 'o') {
      const output = parts.length === 2 && resolveOutput?.(parts[1]);
      if (!output || !/^[\w-]+$/.test(output.overlay)) { res.writeHead(404); return res.end('Output not found'); }
      return fs.readFile(path.join(root, 'overlays', output.overlay + '.html'), 'utf8', (error, html) => {
        if (error) { res.writeHead(404); return res.end('Overlay not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(html.replace(/<head>/i, '<head><base href="/overlays/">'));
      });
    }
    // static — serve from root, block server/ subdirectory
    let f;
    try { f = path.resolve(root, '.' + decodeURIComponent(u.pathname === '/' ? '/control.html' : u.pathname)); }
    catch { res.writeHead(400); return res.end('Invalid path'); }
    const relative = path.relative(root, f);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep)[0] === 'server') { res.writeHead(403); return res.end(); }
    fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(buf); });
  });

  // ───── WebSocket rooms ─────
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const q = url.parse(req.url, true).query, role = q.role || 'overlay', output = q.output && resolveOutput?.(q.output);
    if (q.output && (!output || role !== 'overlay')) return ws.close(1008, 'Output unavailable');
    let r = room(output ? output.matchCode : q.match);
    const writer = !q.output && role !== 'overlay' && canWrite(q.key);
    ws._outputId = q.output || null; ws._room = r; ws._lastFrameAt = null;
    ws._moveRoom = next => { r.clients.delete(ws); r = next; ws._room = next; ws.send(JSON.stringify({ type: 'snapshot', v: r.v, state: r.fixes.view(r.state) })); r.clients.add(ws); };
    r.clients.add(ws); ws.send(JSON.stringify({ type: 'snapshot', v: r.v, state: r.fixes.view(r.state) }));
    if (role !== 'overlay' && !writer) ws.send(JSON.stringify({ type: 'error', message: 'Read-only: this server needs ?key= for control and ingest clients.' }));
    ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'resync') return ws.send(JSON.stringify({ type: 'snapshot', v: r.v, state: r.fixes.view(r.state) }));
      if (role === 'overlay' && m.type === 'rendered' && Number.isInteger(m.v) && m.v === r.v) { ws._lastFrameAt = Date.now(); return; }
      if (!writer) return;
      if (m.type === 'set') apply(r, merge(clone(DEFAULT), m.state), role);
      else if (m.type === 'patch') apply(r, merge(clone(r.state), m.patch), role);
      else if (m.type === 'event') event(r, m.event, role);
      else if (m.type === 'valorant') {
        const ageMs = m.bufferedAgeMs === undefined ? 0 : Number(m.bufferedAgeMs);
        if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 60000) return;
        const captureAt = Date.now() - ageMs;
        const out = r.adapter.ingest(clone(r.state), m.message, captureAt);
        r.lastGepAt = captureAt; apply(r, out.state, 'valorant-gep');
        out.events.forEach(e => event(r, e, 'valorant-gep'));
        notifyGep(r, out.events, [m.message], { captureAt, recovered: m.recovered === true });
      }
    });
    ws.on('close', () => r.clients.delete(ws));
  });
  const pingInterval = setInterval(() => wss.clients.forEach(c => c.readyState === 1 && c.ping()), 20000);

  // ───── Start listening — bind to loopback only (security C-1) ─────
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      console.log(`Esportra HUD server on http://localhost:${port}`);
      console.log(`  Control panel  http://localhost:${port}/control.html?match=MAIN`);
      console.log(`  In-game HUD    http://localhost:${port}/overlays/ingame.html?match=MAIN`);
      console.log('  Writes require the ESPORTRA_KEY passed at startup.');
      resolve();
    });
  });

  const result = {
    port: server.address().port,
    notifyOutputsChanged() {
      for (const ws of wss.clients) {
        if (!ws._outputId || ws.readyState !== 1) continue;
        const output = resolveOutput?.(ws._outputId);
        if (!output) { ws.close(1008, 'Output removed'); continue; }
        const next = room(output.matchCode);
        if (next !== ws._room) { ws._lastFrameAt = null; ws._moveRoom(next); }
      }
    },
    getOutputHealth(id) {
      const clients = [...wss.clients].filter(ws => ws._outputId === id && ws.readyState === 1);
      const frames = clients.map(ws => ws._lastFrameAt || 0);
      return { connectionCount: clients.length, lastFrameAt: Math.max(0, ...frames) || null };
    },
    getLastGepAt(code) { return rooms.get(String(code || 'MAIN').toUpperCase())?.lastGepAt || null; },
    getDisplayFixSummary(code) {
      const current = rooms.get(String(code || 'MAIN').toUpperCase());
      return { fields: current ? Object.keys(current.fixes.data.entries) : [], storageWarning: current?.fixes.storageWarning || null };
    },
    stop() {
      clearInterval(pingInterval);
      for (const r of rooms.values()) {
        clearTimeout(r.saveT);
        if (r.ephemeral) continue;
        try { fs.writeFileSync(r.file, JSON.stringify(persistentState(r.state))); } catch (error) { console.warn('HUD state could not be saved:', error.code); }
      }
      for (const client of wss.clients) client.terminate();
      server.close();
      wss.close();
    },
  };
  Object.defineProperty(result, 'clientCount', { get: () => wss.clients.size });
  return result;
}

module.exports = { start };
