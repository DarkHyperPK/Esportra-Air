// Off-camera setup shared by the reels (dev/showcase.cjs, dev/showcase-calm.cjs), 24–25 Nov. Everything goes through
// Air's own paths on a fresh dev host: a PUBG MOBILE library, event, licence and lobby; a game played into Air by the
// stand-in PCOB and recorded exactly as Air wrote the lobby room (states, the feed's data lines, what autopilot put
// on air); the Valorant Esportra import; and, in the recording browser, a Valorant room seeded with the HUD's own
// sample match plus a replay room for the recorded game.
//   const S = require('./reel-setup.cjs'); const h = S.connect(host, enginePort); const d = await S.prepare(h);
'use strict';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['NIGHT OWLS', 'CRIMSON FIVE', 'IRON PINE', 'DUNE RUNNERS', 'SILVER FOX', 'NORTH TIDE', 'BLUE HARBOR', 'STONE WOLVES', 'RED KESTREL', 'LOW ORBIT', 'WILD CARD', 'GREY MOUNTAIN', 'FERAL SIX', 'ECHO VALLEY', 'QUIET STORM', 'HIGH GROUND'];
const TAGS = ['NOW', 'CF5', 'IRP', 'DUNE', 'SFX', 'NTD', 'BHB', 'STW', 'RKS', 'LOB', 'WCD', 'GRM', 'FR6', 'ECV', 'QST', 'HGD'];
const COLORS = ['#22d3ee', '#f43f5e', '#ffb60e', '#a78bfa', '#34d399', '#fb923c', '#60a5fa', '#e879f9'];
const VAL = 'REELVAL';      // a Valorant room seeded with the HUD's own sample match
const REPLAY = 'REELPUBG';  // the recorded PUBG MOBILE game, replayed

/** Calls to the dev host and its engine. */
function connect(H, ENGINE) {
  const ENG = `http://127.0.0.1:${ENGINE}`;
  const KEY = 'dev-host-key-0123456789abcdef';
  const call = async (m, a = []) => { const r = await fetch(`${H}/call/${m}`, { method: 'POST', body: JSON.stringify(a) }); const j = await r.json(); if (!r.ok) throw new Error(m + ': ' + JSON.stringify(j)); return j; };
  const dev = async (q) => (await fetch(`${H}/dev/pcob?${q}`, { method: 'POST' })).json();
  const engine = (p, method = 'GET', body) => fetch(`${ENG}${p}`, { method, headers: { 'X-Esportra-Key': KEY, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const roomState = async (code) => (await (await engine(`/api/${code}`)).json()).state;
  const patchRoom = async (code, fields) => { const r = await engine(`/api/${code}`, 'PATCH', fields); if (!r.ok) throw new Error('room patch ' + r.status); };
  const action = (room, name, args) => engine('/control/action', 'POST', { match: room, name, args });
  return { H, ENG, call, dev, engine, roomState, patchRoom, action, LOTUS: `${ENG}/art/maps/2fe4ed3a-450a-948b-6d6b-e89a78e680a9/splash.png` };
}

/**
 * The producer's data, a recorded PUBG MOBILE game and the Valorant Esportra import. Ends with Valorant chosen.
 * `opts.logo(i)` and `opts.photo(i, j)` give data URLs for team i's logo and its player j's photo; each is uploaded
 * through Air (`uploadImage`) and saved on the team or player, as the Teams/Players screen does.
 */
async function prepare(h, opts = {}) {
  const { call, dev, roomState } = h;
  await call('chooseGame', ['valorant']); await call('finishOnboarding');
  await call('esportraSignIn', ['producer@example.com', 'correct horse battery']);
  await call('artDownload');
  await call('chooseGame', ['pubgm']); // PUBG MOBILE players have in-game names, not Riot IDs
  const upload = async (url) => (url ? call('uploadImage', [url]) : '');
  const logos = [];
  for (const [i, n] of NAMES.entries()) { logos[i] = await upload(opts.logo?.(i)); await call('saveTeam', [{ name: n, tag: TAGS[i], color: COLORS[i % COLORS.length], logo: logos[i] }]); }
  let snap = await call('snapshot');
  for (const t of snap.library.teams) { const i = NAMES.indexOf(t.name); for (const [j, p] of ['ACE', 'ROOK', 'VEX', 'KAI'].entries()) await call('savePlayer', [{ name: `${TAGS[i]}_${p}`, realName: '', gameId: `${TAGS[i]}_${p}`, photo: await upload(opts.photo?.(i, j)), role: '', teamId: t.id }]); }
  await call('createEvent', ['Air Showcase Cup']);
  snap = await call('snapshot');
  const ev = snap.events.find((e) => e.name === 'Air Showcase Cup');
  await call('eventLicence', [ev.id, 'pubgm', { confirmed: true }]);
  await call('saveSponsor', [ev.id, { name: 'Volt Energy', tier: 'title', logo: '', logoLight: '', line: '' }]);
  await call('lobbyCreate', [{ eventId: ev.id, game: 'pubgm', title: 'Group A · Day 2', games: 6 }]);
  snap = await call('snapshot');
  const lobby = snap.lobbies[0], code = lobby.code;
  await call('lobbyTeams', [lobby.id, NAMES.map((n) => snap.library.teams.find((t) => t.name === n).id)]);
  await call('lobbyUpdate', [lobby.id, { stage: 'Group stage', games: ['Erangel', 'Miramar', 'Sanhok', 'Erangel', 'Vikendi', 'Rondo'].map((map) => ({ map })) }]);
  await call('lobbySelect', [lobby.id]);
  for (let i = 0; i < 120 && !(await call('snapshot')).packs?.some((p) => p.game === 'pubgm' && p.state === 'ready'); i++) await sleep(500);
  for (let i = 0; i < 120 && (await call('snapshot')).art?.have < 279; i++) await sleep(500);

  // A PUBG MOBILE game through Air, recorded as Air writes the lobby room.
  const fake = await dev('do=start&speed=40&length=900');
  await call('pcobConnect', [`127.0.0.1:${fake.port}`, true]);
  await sleep(1500);
  const states = [], lines = [], onAir = [];
  let lastJson = '', recording = true;
  const t0 = Date.now();
  await dev('do=begin');
  const pollRoom = (async () => { while (recording) { const s = await roomState(code); const j = JSON.stringify(s); if (j !== lastJson) { lastJson = j; states.push([Date.now(), s]); } await sleep(100); } })();
  const pollFeed = (async () => {
    const prev = new Map(); let seen = 0;
    while (recording) {
      try {
        const [pl, ki] = await Promise.all(['gettotalplayerlist', 'getkillinfo'].map((r) => fetch(`http://127.0.0.1:${fake.port}/${r}`).then((x) => x.json())));
        for (const p of pl.playerInfoList ?? []) { const o = prev.get(p.playerName); if (o && Number(p.killNum) !== Number(o.killNum)) lines.push(`${p.playerName} killNum ${o.killNum}→${p.killNum}`); if (o && Number(p.liveState) !== Number(o.liveState)) lines.push(`${p.playerName} liveState ${o.liveState}→${p.liveState}`); prev.set(p.playerName, p); }
        for (const k of (ki.killInfo ?? []).slice(seen)) lines.push(`${k.CauserName} ${Number(k.ResultHealthStatus) === 2 ? '✕' : '↓'} ${k.VictimName} t=${k.CurGameTime}`);
        seen = (ki.killInfo ?? []).length;
      } catch { /* between games */ }
      await sleep(250);
    }
  })();
  const pollAir = (async () => { let last = ''; while (recording) { const s = await call('snapshot'); if (s.lobbyOnAir !== last) { last = s.lobbyOnAir; onAir.push([Date.now(), s.lobbyOnAir]); } await sleep(150); } })();
  for (let i = 0; i < 400 && !onAir.some(([, s]) => s === 'br-mvp'); i++) await sleep(250);
  await sleep(2500);
  recording = false; await Promise.all([pollRoom, pollFeed, pollAir]);
  await call('pcobDisconnect');
  const at = (s) => onAir.find(([, x]) => x === s)?.[0];
  const dropAt = at('br-drop'), wwcdAt = at('br-wwcd'), resultsAt = at('br-rankings'), mvpAt = at('br-mvp');
  if (!wwcdAt || !resultsAt) throw new Error('autopilot did not run: ' + JSON.stringify(onAir));
  const fbAt = states.find(([, s]) => s.brLive?.moment?.kind === 'first.blood')?.[0] ?? t0 + 6000;
  console.log(`recorded ${states.length} states, ${lines.length} data lines, game ${((wwcdAt - t0) / 1000).toFixed(1)} s`);
  await call('lobbyTake', [lobby.id, null]);

  // Valorant: the Esportra import (Air's own path).
  await call('chooseGame', ['valorant']);
  for (let i = 0; i < 20 && (await call('snapshot')).esportra.state !== 'online'; i++) { await call('esportraCheck').catch(() => {}); await call('esportraRefresh').catch(() => {}); await sleep(500); }
  snap = await call('snapshot');
  const remote = snap.esportra.matches.find((m) => m.teamA === 'Vanguard Esports') ?? snap.esportra.matches[0];
  await call('useEsportraMatch', [remote.id]);
  for (let i = 0; i < 40 && !(await call('snapshot')).match; i++) await sleep(250);
  snap = await call('snapshot');
  const vmatch = snap.match;
  const players = (vmatch.players ?? []).flat().map((p) => p.gameId || p.name).filter(Boolean);
  const pool = (snap.matchData?.pool?.length ? snap.matchData.pool : ['Ascent', 'Bind', 'Haven', 'Lotus', 'Split', 'Sunset', 'Abyss']);
  await call('vetoReset').catch(() => {});
  return { logos, ev, lobby, code, states, lines, onAir, t0, dropAt, wwcdAt, resultsAt, mvpAt, fbAt, vmatch, players, pool };
}

/**
 * In the recording browser: a clean logo for the fake Esportra's logo address, the Valorant sample room and the
 * replay room. Returns the pack's wallpapers and `seek(wall)`, which patches the replay room to Air's recorded state.
 */
async function dress(h, ctx, d) {
  const lp = await ctx.newPage();
  await lp.setContent(`<html><body style="margin:0;background:transparent"><svg id="l" width="256" height="256" viewBox="0 0 64 64"><path d="M32 3l26 15v28L32 61 6 46V18z" fill="#14b8a6"/><path d="M19 20h8l5 15 5-15h8L35 46h-6z" fill="#fff"/></svg></body></html>`);
  const logo = await lp.locator('#l').screenshot({ omitBackground: true }); await lp.close();
  await ctx.route('https://example.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: logo }));
  // The Valorant sample room: the HUD's own sample state (core/state.default.js), as a sample room gets it.
  const sp = await ctx.newPage(); await sp.goto(`${h.ENG}/overlays/ingame.html?preview=1`);
  await sp.waitForFunction(() => window.HUD_READY === true, null, { timeout: 15000 });
  const sample = await sp.evaluate(() => JSON.parse(JSON.stringify(typeof HUD_DEFAULT !== 'undefined' ? HUD_DEFAULT : window.HUD_DEFAULT)));
  await sp.close();
  await h.patchRoom(VAL, sample);
  await h.patchRoom(REPLAY, d.states[0][1]);
  const walls = d.states[0][1].airPack?.wallpaper ?? [];
  const wall = walls[1] || walls[0] || '';
  // Replay: the room gets Air's recorded state for wall time w; pages' clocks are pinned to w by the caller.
  let patched = -1;
  const seek = async (w) => { let i = patched; while (i + 1 < d.states.length && d.states[i + 1][0] <= w) i++; if (i !== patched && i >= 0) { await h.patchRoom(REPLAY, d.states[i][1]); patched = i; await sleep(60); } };
  const resetReplay = async (w) => { patched = -1; await seek(w); };
  return { logo, sample, wall, walls, seek, resetReplay };
}

module.exports = { NAMES, TAGS, COLORS, VAL, REPLAY, sleep, connect, prepare, dress };
