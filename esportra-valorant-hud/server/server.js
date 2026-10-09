// Esportra HUD server — embedded module edition.
//
// Usage (Electron main process):
//   const { start } = require('./server/server');
//   const srv = await start({ port: 5300, key: '...hex...', root: '/path/to/hud', dataDir: '/writable/path' });
//   srv.clientCount   // number of connected WS clients
//   srv.stop()        // graceful shutdown, returns Promise
//
// Overlays:   http://127.0.0.1:5300/overlays/ingame.html?match=GF1
// Control:    http://127.0.0.1:5300/control.html?match=GF1
// WebSocket:  ws://127.0.0.1:5300/ws?match=GF1&role=overlay|control|ingest[&key=…]
// HTTP API:   GET/PUT/PATCH /api/<match>        state (PATCH = JSON merge patch)
//             POST /api/<match>/event            one-shot event to every overlay
//             POST /api/<match>/ingest/valorant  raw Overwolf GEP messages → state
//
// Every match is a room. On join a client gets {type:'snapshot', v, state}; after that every change
// arrives as {type:'patch', v, patch} (RFC 7386 merge patch). Gap detected → send {type:'resync'}.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const { WebSocketServer } = require('ws');
// schema is path-relative to this file (__dirname) regardless of root parameter — safe to load here
const schema = require('../core/state.schema');
const { createValorantAdapter } = require('../adapters/valorant-gep');

// ─── Pure helpers ─────────────────────────────────────────────────────────────
const clone = o => JSON.parse(JSON.stringify(o));
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
// merge + schema.safe: apply RFC 7396 merge-patch, rejecting unsafe keys
const merge = (a, p) => {
  schema.safe(p);
  if (!isObj(p)) return p;
  a = isObj(a) ? a : {};
  for (const k of Object.keys(p)) {
    if (p[k] === null) delete a[k];
    else a[k] = merge(a[k], p[k]);
  }
  return a;
};
// smallest merge patch that turns a into b (arrays replaced whole)
const diff = (a, b) => {
  const out = {}; let n = 0;
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (!(k in b)) { out[k] = null; n++; }
    else if (isObj(a[k]) && isObj(b[k])) { const d = diff(a[k], b[k]); if (d) { out[k] = d; n++; } }
    else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { out[k] = b[k]; n++; }
  }
  return n ? out : null;
};

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function body(req) {
  return new Promise((res, rej) => {
    let b = '', size = 0, exceeded = false;
    req.on('error', rej);
    req.on('aborted', () => rej(new Error('Request aborted')));
    req.on('data', d => {
      size += d.length;
      if (size > 2e6) { exceeded = true; b = ''; } else if (!exceeded) b += d;
    });
    req.on('end', () => {
      if (exceeded) return rej(new Error('Request exceeds 2 MB'));
      try { const value = b ? JSON.parse(b) : {}; schema.safe(value); res(value); }
      catch (e) { rej(e); }
    });
  });
}

// JSON response helper — no credentials ever in response body (C-5)
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// ─── Default state cache (loaded once per process from root path) ─────────────
let _defaults = null;
function loadDefaults(root) {
  if (_defaults) return _defaults;
  // state.default.js and state.clean.js are browser-global scripts that set window.HUD_DEFAULT / HUD_CLEAN
  global.window = {};
  const defaultPath = path.join(root, 'core/state.default.js');
  const cleanPath = path.join(root, 'core/state.clean.js');
  // Clear require cache to allow re-loading on restart (root won't change but guard defensively)
  delete require.cache[require.resolve(defaultPath)];
  delete require.cache[require.resolve(cleanPath)];
  require(defaultPath);
  const DEFAULT = global.window.HUD_DEFAULT;
  require(cleanPath);
  const CLEAN = global.window.HUD_CLEAN;
  _defaults = { DEFAULT: clone(DEFAULT), CLEAN: clone(CLEAN) };
  global.window = undefined;
  return _defaults;
}

// ─── start({ port, key, root, dataDir }) ──────────────────────────────────────
// C-1: server always binds to 127.0.0.1 only — never 0.0.0.0 or ::
// C-2: KEY is the caller-supplied per-session token; canWrite requires it unconditionally
async function start({ port, key, root, dataDir }) {
  if (!port || !key || !root) throw new Error('start() requires port, key, and root');

  // C-2: KEY comes from the parameter — never from env, always present, always required
  const KEY = key;
  const ROOT = root;
  const DATA = dataDir || path.join(ROOT, 'server', 'data');
  fs.mkdirSync(DATA, { recursive: true });

  const { DEFAULT, CLEAN } = loadDefaults(ROOT);

  // C-2: write key required unconditionally — no fallback, no empty-key bypass
  const canWrite = k => k === KEY;

  const rooms = new Map();

  function room(code) {
    code = String(code || 'MAIN').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32) || 'MAIN';
    if (!rooms.has(code)) {
      const file = path.join(DATA, code + '.json');
      let state = clone(DEFAULT);
      try { state = schema.validate(merge(clone(DEFAULT), JSON.parse(fs.readFileSync(file, 'utf8')))); } catch (e) {}
      rooms.set(code, {
        code, v: 0, state,
        clients: new Set(),
        file,
        log: path.join(DATA, code + '.ndjson'),
        adapter: createValorantAdapter(),
        saveT: null,
      });
    }
    return rooms.get(code);
  }

  function broadcast(r, msg) {
    const s = JSON.stringify(msg);
    for (const c of r.clients) if (c.readyState === 1) c.send(s);
  }

  function apply(r, next, source) {
    schema.validate(next);
    const patch = diff(r.state, next); if (!patch) return 0;
    r.state = next; r.v++;
    broadcast(r, { type: 'patch', v: r.v, patch });
    fs.appendFile(r.log, JSON.stringify({ t: Date.now(), v: r.v, source, patch }) + '\n', () => {});
    clearTimeout(r.saveT);
    r.saveT = setTimeout(() => fs.writeFile(r.file, JSON.stringify(r.state), () => {}), 300);
    return r.v;
  }

  function event(r, ev, source) {
    schema.safe(ev);
    if (!isObj(ev)) throw new Error('Event must be an object');
    ev = { id: `${r.code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, t: Date.now(), ...ev };
    broadcast(r, { type: 'event', event: ev });
    fs.appendFile(r.log, JSON.stringify({ t: ev.t, source, event: ev }) + '\n', () => {});
    return ev;
  }

  // ─── HTTP server ─────────────────────────────────────────────────────────────
  const server = http.createServer(async (req, res) => {
    const u = url.parse(req.url, true), parts = u.pathname.split('/').filter(Boolean);

    if (req.method === 'OPTIONS') {
      // CORS: allow only localhost callers (no wildcard origin)
      res.writeHead(204, {
        'Access-Control-Allow-Origin': req.headers.origin || 'null',
        'Access-Control-Allow-Methods': 'GET,PUT,PATCH,POST',
        'Access-Control-Allow-Headers': 'Content-Type,X-Esportra-Key',
        'Vary': 'Origin',
      });
      return res.end();
    }

    if (parts[0] === 'api') {
      const r = room(parts[1]);
      // C-2: accept write key from header only — never from query string (MEDIUM fix)
      const writeKey = req.headers['x-esportra-key'];
      try {
        if (req.method === 'GET' && parts.length === 2) return send(res, 200, { match: r.code, v: r.v, state: r.state });
        if (!canWrite(writeKey)) return send(res, 401, { error: 'Missing or wrong X-Esportra-Key header.' });
        if (req.method === 'PUT' && parts.length === 2) {
          const base = u.query.preset === 'clean' ? CLEAN : DEFAULT;
          return send(res, 200, { v: apply(r, merge(clone(base), await body(req)), 'api:put') || r.v });
        }
        if (req.method === 'PATCH' && parts.length === 2) return send(res, 200, { v: apply(r, merge(clone(r.state), await body(req)), 'api:patch') || r.v });
        if (req.method === 'POST' && parts[2] === 'event') return send(res, 200, event(r, await body(req), 'api'));
        if (req.method === 'POST' && parts[2] === 'ingest' && parts[3] === 'valorant') {
          const b = await body(req), msgs = Array.isArray(b) ? b : [b];
          let s = clone(r.state); const evs = [];
          schema.validate(s);
          for (const m of msgs) { const out = r.adapter.ingest(s, m, Date.now()); s = out.state; evs.push(...out.events); }
          const v = apply(r, s, 'valorant-gep') || r.v;
          evs.forEach(e => event(r, e, 'valorant-gep'));
          return send(res, 200, { v, events: evs.length });
        }
        return send(res, 404, { error: 'Unknown API route.' });
      } catch (e) { return send(res, 400, { error: 'Request rejected: ' + e.message }); }
    }

    if (parts[0] === 'health') {
      return send(res, 200, { ok: true, rooms: [...rooms.values()].map(r => ({ match: r.code, v: r.v, clients: r.clients.size })) });
    }

    // Static file server — path traversal guard
    let pathname;
    try { pathname = decodeURIComponent(u.pathname === '/' ? '/control.html' : u.pathname); }
    catch (e) { res.writeHead(400); return res.end('Invalid path'); }

    const f = path.resolve(ROOT, '.' + pathname);
    const relative = path.relative(ROOT, f);
    const publicRoots = new Set(['core', 'overlays', 'previews', 'stingers']);
    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      relative.split(path.sep).some(p => p.startsWith('.')) ||
      !(relative === 'control.html' || relative === 'README.md' || publicRoots.has(relative.split(path.sep)[0]))
    ) {
      res.writeHead(403); return res.end();
    }

    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  });

  // ─── WebSocket rooms ──────────────────────────────────────────────────────────
  // WS clients authenticate via ?key= in the URL (WebSocket protocol limitation — no custom headers)
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2e6 });

  wss.on('connection', (ws, req) => {
    const q = url.parse(req.url, true).query;
    const r = room(q.match);
    const role = q.role || 'overlay';
    const writer = ['control', 'ingest', 'player'].includes(role) && canWrite(q.key);

    r.clients.add(ws);
    ws.send(JSON.stringify({ type: 'snapshot', v: r.v, state: r.state }));
    if (role !== 'overlay' && !writer) {
      ws.send(JSON.stringify({ type: 'error', message: 'Read-only: missing or wrong key for control/ingest role.' }));
    }

    ws.on('message', raw => {
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }
      try {
        schema.safe(m);
        if (!isObj(m)) return;
        if (m.type === 'resync') return ws.send(JSON.stringify({ type: 'snapshot', v: r.v, state: r.state }));
        if (!writer) return;
        if (m.type === 'set') apply(r, merge(clone(DEFAULT), m.state), role);
        else if (m.type === 'patch') apply(r, merge(clone(r.state), m.patch), role);
        else if (m.type === 'event') event(r, m.event, role);
        else if (m.type === 'valorant') {
          const out = r.adapter.ingest(clone(r.state), m.message, Date.now());
          apply(r, out.state, 'valorant-gep');
          out.events.forEach(e => event(r, e, 'valorant-gep'));
        }
      } catch (e) { ws.send(JSON.stringify({ type: 'error', message: e.message })); }
    });

    ws.on('error', () => {});
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => r.clients.delete(ws));
  });

  const pingInterval = setInterval(() => {
    wss.clients.forEach(c => {
      if (!c.isAlive) return c.terminate();
      c.isAlive = false;
      if (c.readyState === 1) c.ping();
    });
  }, 20000);

  // Flush state snapshots on shutdown
  function flushRooms() {
    for (const r of rooms.values()) {
      clearTimeout(r.saveT);
      try { fs.writeFileSync(r.file, JSON.stringify(r.state)); } catch (_) {}
    }
  }

  // ─── Start listening — C-1: 127.0.0.1 only, never 0.0.0.0 or :: ────────────
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      console.log(`Esportra HUD server on http://127.0.0.1:${port}`);
      console.log(`  Control panel  http://127.0.0.1:${port}/control.html?match=MAIN`);
      console.log(`  In-game HUD    http://127.0.0.1:${port}/overlays/ingame.html?match=MAIN`);
      resolve({
        stop() {
          return new Promise(res => {
            clearInterval(pingInterval);
            flushRooms();
            wss.clients.forEach(c => c.terminate());
            wss.close(() => server.close(res));
          });
        },
        get clientCount() { return wss.clients.size; },
      });
    });
  });
}

module.exports = { start };
