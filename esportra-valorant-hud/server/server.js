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

// ─── Pure utilities (no config dependency) ────────────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.webm': 'video/webm', '.mov': 'video/quicktime', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const clone = o => JSON.parse(JSON.stringify(o));
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
async function start({ port, key, root, dataDir, host = '127.0.0.1' }) {
  const DATA = dataDir || path.join(root, 'server', 'data');
  const KEY = key;

  fs.mkdirSync(DATA, { recursive: true });

  loadStateDefaults(root);
  const DEFAULT = _DEFAULT, CLEAN = _CLEAN;

  const canWrite = k => typeof KEY === 'string' && KEY.length > 0 && k === KEY;

  const rooms = new Map();
  function room(code) {
    code = String(code || 'MAIN').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32) || 'MAIN';
    if (!rooms.has(code)) {
      const file = path.join(DATA, code + '.json');
      let state = clone(CLEAN);
      try { state = merge(clone(CLEAN), JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) {}
      rooms.set(code, { code, v: 0, state, clients: new Set(), file, log: path.join(DATA, code + '.ndjson'), adapter: createValorantAdapter(), saveT: null });
    }
    return rooms.get(code);
  }
  function broadcast(r, msg) { const s = JSON.stringify(msg); for (const c of r.clients) if (c.readyState === 1) c.send(s); }
  function apply(r, next, source) {
    const patch = diff(r.state, next); if (!patch) return 0;
    r.state = next; r.v++;
    broadcast(r, { type: 'patch', v: r.v, patch });
    fs.appendFile(r.log, JSON.stringify({ t: Date.now(), v: r.v, source, patch }) + '\n', () => {});
    clearTimeout(r.saveT); r.saveT = setTimeout(() => fs.writeFile(r.file, JSON.stringify(r.state), () => {}), 300);
    return r.v;
  }
  function event(r, ev, source) { ev = { id: `${r.code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, t: Date.now(), ...ev };
    broadcast(r, { type: 'event', event: ev }); fs.appendFile(r.log, JSON.stringify({ t: ev.t, source, event: ev }) + '\n', () => {}); return ev; }

  // ───── HTTP: static files + API ─────
  const server = http.createServer(async (req, res) => {
    const u = url.parse(req.url, true), parts = u.pathname.split('/').filter(Boolean);
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,PATCH,POST', 'Access-Control-Allow-Headers': 'Content-Type,X-Esportra-Key' }); return res.end(); }
    if (parts[0] === 'api') {
      const r = room(parts[1]), k = req.headers['x-esportra-key'] || u.query.key;
      try {
        if (req.method === 'GET' && parts.length === 2) return send(res, 200, { match: r.code, v: r.v, state: r.state });
        if (!canWrite(k)) return send(res, 401, { error: 'Missing or wrong X-Esportra-Key header.' });
        if (req.method === 'POST' && parts[2] === 'config') {
          const patch = await body(req);
          if (!isObj(patch) || !isObj(patch.airContext)) return send(res, 400, { error: 'Show context required.' });
          const changed = r.state.airContext && JSON.stringify(r.state.airContext) !== JSON.stringify(patch.airContext);
          let next = clone(changed ? CLEAN : r.state);
          next.airContext = patch.airContext;
          if (isObj(patch.event)) next.event = merge(next.event || {}, patch.event);
          if (Array.isArray(patch.teams) && patch.teams.length === 2) next.teams = patch.teams.map((team, index) => {
            const identity = Object.fromEntries(['name', 'tag', 'color', 'logo'].filter(field => typeof team[field] === 'string').map(field => [field, team[field]]));
            return { ...next.teams[index], ...identity, ...(!r.state.airContext || changed ? { series: team.series || 0 } : {}) };
          });
          for (const field of ['casters', 'sponsors', 'veto']) if (Array.isArray(patch[field])) next[field] = patch[field];
          return send(res, 200, { v: apply(r, next, 'air:config') || r.v });
        }
        if (req.method === 'POST' && parts[2] === 'map-result') {
          const input = await body(req), { mapIndex, teamAScore, teamBScore } = input;
          if (!Number.isInteger(mapIndex) || mapIndex < 1 || mapIndex > 9 || ![teamAScore, teamBScore].every(score => Number.isInteger(score) && score >= 0 && score <= 2147483647)) return send(res, 400, { error: 'Invalid map result.' });
          const next = clone(r.state), series = Array.isArray(next.series) ? next.series : [];
          while (series.length < mapIndex) series.push({});
          series[mapIndex - 1] = { ...series[mapIndex - 1], score: [teamAScore, teamBScore], winner: teamAScore > teamBScore ? 0 : teamAScore < teamBScore ? 1 : -1 };
          next.series = series;
          return send(res, 200, { v: apply(r, next, 'air:map-result') || r.v, patch: { series } });
        }
        if (req.method === 'PUT' && parts.length === 2) { const base = u.query.preset === 'clean' ? CLEAN : DEFAULT; return send(res, 200, { v: apply(r, merge(clone(base), await body(req)), 'api:put') || r.v }); }
        if (req.method === 'PATCH' && parts.length === 2) return send(res, 200, { v: apply(r, merge(clone(r.state), await body(req)), 'api:patch') || r.v });
        if (req.method === 'POST' && parts[2] === 'event') return send(res, 200, event(r, await body(req), 'api'));
        if (req.method === 'POST' && parts[2] === 'ingest' && parts[3] === 'valorant') {
          const b = await body(req), msgs = Array.isArray(b) ? b : [b]; let s = clone(r.state); const evs = [];
          if (msgs.length) r.lastGepAt = Date.now();
          for (const m of msgs) { const out = r.adapter.ingest(s, m, Date.now()); s = out.state; evs.push(...out.events); }
          const v = apply(r, s, 'valorant-gep') || r.v; evs.forEach(e => event(r, e, 'valorant-gep'));
          return send(res, 200, { v, events: evs.length });
        }
        return send(res, 404, { error: 'Unknown API route.' });
      } catch (e) { return send(res, 400, { error: 'Request body must be valid JSON: ' + e.message }); }
    }
    if (parts[0] === 'health') return send(res, 200, { ok: true, rooms: [...rooms.values()].map(r => ({ match: r.code, v: r.v, clients: r.clients.size })) });
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
    const q = url.parse(req.url, true).query, r = room(q.match), role = q.role || 'overlay', writer = role !== 'overlay' && canWrite(q.key);
    r.clients.add(ws); ws.send(JSON.stringify({ type: 'snapshot', v: r.v, state: r.state }));
    if (role !== 'overlay' && !writer) ws.send(JSON.stringify({ type: 'error', message: 'Read-only: this server needs ?key= for control and ingest clients.' }));
    ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'resync') return ws.send(JSON.stringify({ type: 'snapshot', v: r.v, state: r.state }));
      if (!writer) return;
      if (m.type === 'set') apply(r, merge(clone(DEFAULT), m.state), role);
      else if (m.type === 'patch') apply(r, merge(clone(r.state), m.patch), role);
      else if (m.type === 'event') event(r, m.event, role);
      else if (m.type === 'valorant') { r.lastGepAt = Date.now(); const out = r.adapter.ingest(clone(r.state), m.message, Date.now()); apply(r, out.state, 'valorant-gep'); out.events.forEach(e => event(r, e, 'valorant-gep')); }
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
    getLastGepAt(code) { return rooms.get(String(code || 'MAIN').toUpperCase())?.lastGepAt || null; },
    stop() {
      clearInterval(pingInterval);
      for (const r of rooms.values()) {
        clearTimeout(r.saveT);
        try { fs.writeFileSync(r.file, JSON.stringify(r.state)); } catch (error) { console.warn('HUD state could not be saved:', error.code); }
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
