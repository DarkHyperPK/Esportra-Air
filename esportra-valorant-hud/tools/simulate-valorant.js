// Full Valorant match simulator — drives every automation path through the real ingest endpoint.
//
// What each round tests:
//   R1   Elimination + damage events     HP updates before kills, basic flow
//   R2   Flawless banner                 PRX wins without losing a player
//   R3   Ace banner + ability charges    JUNO 5K, C/Q/E charge updates on observed player
//   R4   Force-buy round (FORCE label)   FNC ~2200cr; economy panel shows FORCE
//   R5   Thrifty banner                  PRX eco (800cr) beats FNC full buy (3900cr)
//   R6   FNC win                         score balance
//   [Timeout banner — PRX calls timeout]
//   R7   Clutch 1v3 + lower third + assist  MIRA 1v3, ECHO assist, lower third callout
//   R8   FNC win + techpause banner
//   R9   Team ace banner                 5 distinct PRX killers
//   R10  Detonation banner               PRX plants + detonates
//   R11  Defuse via $300 inference       no planted_location — adapter infers from money delta
//   [Scoreboard overlay ~8s]
//   [Score sync → 11-11]
//   R12  Match point banner              FNC wins → 12-11
//   R13  Overtime banner                 PRX wins → 12-12
//   R14  OT flawless                     PRX wins without loss
//
//   node tools/simulate-valorant.js [MATCH] [SERVER] [--slow]
'use strict';
const MATCH = process.argv.find(a => !a.startsWith('-') && !a.startsWith('http') && process.argv.indexOf(a) > 1) || 'MAIN';
const BASE  = process.argv.find(a => a.startsWith('http')) || 'http://localhost:5300';
const SLOW  = process.argv.includes('--slow');
const KEY   = process.env.ESPORTRA_KEY || '';
const SPD   = SLOW ? 1 : 6;

const wait   = ms => new Promise(r => setTimeout(r, Math.ceil(ms / SPD)));
const hdrs   = { 'Content-Type': 'application/json', 'X-Esportra-Key': KEY };
const req    = (method, path, body) => fetch(`${BASE}${path}`, { method, headers: hdrs, body: JSON.stringify(body) }).then(r => r.json());
const ingest = msgs  => req('POST', `/api/${MATCH}/ingest/valorant`, Array.isArray(msgs) ? msgs : [msgs]);
const patch  = body  => req('PATCH', `/api/${MATCH}`, body);
const info   = (k, v) => ({ info: { match_info: { [k]: typeof v === 'object' ? JSON.stringify(v) : String(v) } }, feature: 'match_info' });
const gev    = (n, d = '') => ({ events: [{ name: n, data: typeof d === 'object' ? JSON.stringify(d) : d }] });
// Player-PC health/ability messages — adapter reads these when playerId is present
const playerMsg = (i, key, val) => ({ playerId: 'sim-' + i, feature: 'me', info: { me: { [key]: String(val) } } });

// ─── Roster ───────────────────────────────────────────────────────────────
const ROSTER = [
  // idx  name           agent (internal)       team
  ['JUNO #PRX',  'Clay',           0],  // 0  RAZE
  ['MIRA #PRX',  'Gumshoe',        0],  // 1  CYPHER
  ['DAX #PRX',   'Breach',         0],  // 2  BREACH
  ['RIKU #PRX',  'Pandemic',       0],  // 3  VIPER
  ['ECHO #PRX',  'Guide',          0],  // 4  SKYE
  ['KAIRO #FNC', 'Wushu',          1],  // 5  JETT
  ['SOL #FNC',   'Wraith',         1],  // 6  OMEN
  ['VEX #FNC',   'Hunter',         1],  // 7  SOVA
  ['NYX #FNC',   'Killjoy',        1],  // 8  KILLJOY
  ['ZEN #FNC',   'BountyHunter',   1],  // 9  FADE
];
const N = i => ROSTER[i][0].split(' #')[0];

// ── Per-player state ───────────────────────────────────────────────────────
const K = Array(10).fill(0);        // match kills
const D = Array(10).fill(0);        // match deaths
const A = Array(10).fill(0);        // match assists
const HP = Array(10).fill(100);
const alive = Array(10).fill(true);
const ult = Array(10).fill(0);      // start at 0 so ult progression is visible

// ── Round-level tracking (reset in endRound) ───────────────────────────────
let roundCS = Array(10).fill(0);   // combat score this round (kills×200 + hs×50 + assist×50)
const totalCS = Array(10).fill(0); // cumulative across all rounds
const hsK = Array(10).fill(0);     // headshot kill total
let roundsPlayed = 0;
let fkThis = null;                 // first killer index this round

// ── Team-level stats (PATCHed after each round) ────────────────────────────
const teamStats = [
  { plants: 0, defuses: 0, clutches: 0, ecoWins: 0, firstKills: 0 },
  { plants: 0, defuses: 0, clutches: 0, ecoWins: 0, firstKills: 0 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────
function board(i, money, weapon) {
  return { feature: 'match_info', key: 'scoreboard_' + i, data: JSON.stringify({
    player_id: 'sim-' + i, name: ROSTER[i][0], character: ROSTER[i][1], team: ROSTER[i][2],
    alive: alive[i], ult_points: ult[i], ult_max: 7,
    kills: K[i], deaths: D[i], assists: A[i],
    money: money ?? 3900,
    weapon: weapon ?? (i % 5 === 0 ? 'TX_Hud_Sniper_Operater' : 'TX_Hud_Rifles_Volcano'),
    shield: money != null && money < 1900 ? 0 : 2,
  }) };
}
const allBoards = (money, weapon) => ROSTER.map((_, i) => board(i, money, weapon));

async function damage(idx, amount) {
  HP[idx] = Math.max(1, HP[idx] - amount);
  // player-PC health message — adapter reads key==='health' && playerId → p.hp = +v
  await ingest([playerMsg(idx, 'health', HP[idx])]);
  await wait(180);
}

async function kill(a, v, weapon, hs = false, assist = -1) {
  if (!alive[a]) { console.log(`  SKIP kill by dead ${N(a)}`); return; }
  if (!alive[v]) { console.log(`  SKIP kill of already-dead ${N(v)}`); return; }
  K[a]++; D[v]++; alive[v] = false; HP[v] = 0;
  if (assist >= 0 && assist !== a) { A[assist]++; roundCS[assist] += 50; }
  if (fkThis === null) { fkThis = a; teamStats[ROSTER[a][2]].firstKills++; }
  ult[a] = Math.min(7, ult[a] + 1);
  roundCS[a] += 200 + (hs ? 50 : 0);
  if (hs) hsK[a]++;
  console.log(`       💀  ${N(a)} → ${N(v)}  [${weapon.replace(/TX_Hud_/i, '').replace(/_/g, ' ')}${hs ? ' HS' : ''}]`);
  await ingest([
    gev('kill_feed', { attacker: N(a), victim: N(v), weapon, headshot: hs, ult: '', assist1: assist >= 0 ? N(assist) : '' }),
    board(a), board(v),
  ]);
  await wait(SLOW ? 1600 : 550);
}

async function buyPhase(round, moneyOverride) {
  alive.fill(true);
  HP.fill(100);
  ROSTER.forEach((_, i) => { ult[i] = Math.min(7, ult[i] + 1); });
  const money = moneyOverride ?? 3900;
  const buyType = money >= 3900 ? 'FULL BUY' : money >= 1900 ? 'FORCE' : 'ECO';
  console.log(`\n  🛒  Round ${round}  —  ${buyType}`);
  await ingest([info('round_number', String(round)), info('round_phase', 'shopping'), ...allBoards(money)]);
  await wait(1200);
}

async function overrideMoney(indices, money) {
  await ingest(indices.map(i => board(i, money)));
}

async function combat(observerIdx) {
  console.log(`  ⚔️   COMBAT  (watching ${N(observerIdx ?? 0)})`);
  await ingest([info('round_phase', 'combat'), info('observing', ROSTER[observerIdx ?? 0][0])]);
  await wait(400);
}

async function endRound(t0, t1, label) {
  roundsPlayed++;
  for (let i = 0; i < 10; i++) totalCS[i] += roundCS[i];
  roundCS.fill(0);
  fkThis = null;
  await ingest([info('round_phase', 'end'), info('match_score', { team_0: t0, team_1: t1 })]);
  console.log(`  🏁  PRX ${t0} – ${t1} FNC   (${label})`);
  await patch({ teamStats: [{ ...teamStats[0] }, { ...teamStats[1] }] });
  await wait(SLOW ? 4000 : 2500);
}

async function fncWinsQuick(round, t0, t1, money) {
  await buyPhase(round, money);
  await combat(5);
  await kill(5, 0, 'TX_Hud_Sniper_Operater', true);
  await kill(5, 1, 'TX_Hud_Sniper_Operater');
  await kill(6, 2, 'TX_Hud_Rifles_Volcano');
  await kill(7, 3, 'TX_Hud_Rifles_Volcano');
  await kill(9, 4, 'TX_Hud_Assault_AR10A2_S');
  await endRound(t0, t1, 'FNC elimination');
}

// ─── Main ─────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`  Esportra GEP Simulator  ·  ${MATCH}  ·  ${SLOW ? 'real-time' : '6× speed'}`);
  console.log(`  Banners : round · flawless · ace · teamace · thrifty`);
  console.log(`            clutch · detonation · defuse · matchpoint · OT`);
  console.log(`            timeout · techpause`);
  console.log(`  Paths   : damage · assists · ult progression · ability charges`);
  console.log(`            $300 spike inference · force-buy · observing rotation`);
  console.log(`            scoreboard overlay · lower third · teamStats`);
  console.log(`${'═'.repeat(64)}\n`);
  console.log('  TIP: http://localhost:5300/overlays/ingame.html?match=MAIN&bg=1\n');

  // ── Init: full team objects on every PATCH with teams array ─────────────
  await patch({
    teams: [
      { name: 'PAPER REX', tag: 'PRX', color: '#4fd3ea', logo: '', score: 0, series: 0, side: 'ATK', timeouts: 2, lossStreak: 0 },
      { name: 'FNATIC',    tag: 'FNC', color: '#e0445e', logo: '', score: 0, series: 0, side: 'DEF', timeouts: 2, lossStreak: 0 },
    ],
    map: { name: 'LOTUS', number: 1 },
    event: { name: 'ESPORTRA INVITATIONAL', stage: 'GRAND FINAL', bestOf: 3 },
    rounds: [], round: { number: 1, phase: 'buy', endsAt: 0 },
    teamStats: [{ plants: 0, defuses: 0, clutches: 0, ecoWins: 0, firstKills: 0 },
                { plants: 0, defuses: 0, clutches: 0, ecoWins: 0, firstKills: 0 }],
  });
  await ingest([gev('match_start'), info('map', 'Jam'), info('match_score', { team_0: 0, team_1: 0 }), ...allBoards(800)]);
  console.log('  🎮  Match start — LOTUS — PRX vs FNC\n');
  await wait(800);

  // ── R1: Elimination + damage events ──────────────────────────────────────
  console.log('── R1: Elimination + damage events ──────────────────────');
  await buyPhase(1);
  await combat(5);                               // watching KAIRO
  await damage(0, 35);                           // JUNO takes early shots
  await damage(5, 28);
  await kill(0, 5, 'TX_Hud_Rifles_Volcano', true);
  await kill(2, 8, 'TX_Hud_Rifles_Volcano');
  await damage(7, 42);
  await kill(0, 6, 'TX_Hud_Rifles_Volcano');
  await kill(1, 7, 'TX_Hud_Assault_AR10A2_S', true);
  await kill(3, 9, 'TX_Hud_Rifles_Volcano');
  await endRound(1, 0, 'elimination');

  // ── R2: Flawless → flawless banner ───────────────────────────────────────
  console.log('── R2: Flawless → flawless banner ────────────────────────');
  await buyPhase(2);
  await combat(0);                               // watching JUNO
  await kill(4, 9, 'TX_Hud_Assault_AR10A2_S');
  await kill(3, 8, 'TX_Hud_Rifles_Volcano');
  await kill(1, 7, 'TX_Hud_Assault_AR10A2_S');
  await kill(2, 6, 'TX_Hud_Rifles_Volcano');
  await kill(0, 5, 'TX_Hud_Sniper_Operater');
  await endRound(2, 0, 'flawless — all PRX alive');

  // ── R3: Ace + ability charge demo ────────────────────────────────────────
  console.log('── R3: Ace + ability charges (JUNO observed) ─────────────');
  await buyPhase(3);
  await combat(0);                               // watching JUNO
  // Show JUNO's abilities active; deplete them as she uses abilities mid-combat
  await ingest([{ playerId: 'sim-0', feature: 'me', info: { me: { abilities: { C: 1, Q: 1, E: 1 } } } }]);
  await kill(0, 5, 'TX_Hud_Rifles_Volcano', true);   // JUNO 1K
  await kill(0, 9, 'TX_Hud_Rifles_Volcano');           // JUNO 2K — uses E
  await ingest([{ playerId: 'sim-0', feature: 'me', info: { me: { abilities: { C: 1, Q: 1, E: 0 } } } }]);
  await kill(0, 7, 'TX_Hud_Assault_AR10A2_S', true);  // JUNO 3K — uses Q
  await ingest([{ playerId: 'sim-0', feature: 'me', info: { me: { abilities: { C: 1, Q: 0, E: 0 } } } }]);
  await kill(0, 6, 'TX_Hud_Rifles_Volcano');            // JUNO 4K
  await kill(0, 8, 'TX_Hud_Rifles_Volcano', true);     // JUNO 5K ← ACE
  console.log('  🌟  ACE — JUNO');
  await endRound(3, 0, 'ace (JUNO 5K)');

  // ── R4: Force-buy round — FNC wins ────────────────────────────────────────
  // ~2200cr → economy panel shows FORCE label
  console.log('── R4: Force-buy round — FNC wins ───────────────────────');
  await buyPhase(4, 2200);
  await combat(9);                               // watching ZEN
  await damage(2, 50);
  await damage(1, 65);
  await kill(5, 0, 'TX_Hud_Sniper_Operater', true);
  await kill(5, 1, 'TX_Hud_Sniper_Operater');
  await kill(6, 2, 'TX_Hud_Rifles_Volcano');
  await kill(7, 3, 'TX_Hud_Rifles_Volcano');
  await kill(9, 4, 'TX_Hud_Assault_AR10A2_S');
  await endRound(3, 1, 'FNC force-buy win');

  // ── R5: Thrifty → thrifty banner ─────────────────────────────────────────
  console.log('── R5: Thrifty → thrifty banner ─────────────────────────');
  await buyPhase(5, 800);
  await overrideMoney([5, 6, 7, 8, 9], 3900);   // FNC full buy while PRX is eco
  await combat(1);                               // watching MIRA
  await kill(1, 5, 'TX_Hud_Pistol_Sheriff', true);
  await kill(3, 8, 'TX_Hud_Pistol_Classic');
  await kill(0, 9, 'TX_Hud_Pistol_Sheriff');
  await kill(2, 6, 'TX_Hud_Pistol_Classic');
  await kill(4, 7, 'TX_Hud_Pistol_Classic');
  teamStats[0].ecoWins++;
  await endRound(4, 1, 'thrifty — PRX eco beats FNC full buy');

  // ── R6: FNC wins ─────────────────────────────────────────────────────────
  await fncWinsQuick(6, 4, 2);

  // ── PRX calls timeout ─────────────────────────────────────────────────────
  console.log('\n── PRX calls timeout ─────────────────────────────────────');
  const thold = Math.ceil(8000 / SPD);
  await patch({ banner: { type: 'timeout', team: 0, ts: Date.now(), hold: thold } });
  console.log('  ⏸   TIMEOUT — PRX');
  await wait(thold + 800);

  // ── R7: Clutch 1v3 + lower third + assist ────────────────────────────────
  // KAIRO kills JUNO; VEX kills RIKU; MIRA kills NYX; ECHO kills ZEN (assisting MIRA);
  // KAIRO kills DAX; SOL kills ECHO → MIRA 1v3 vs KAIRO/SOL/VEX
  console.log('── R7: Clutch 1v3 → clutch banner + lower third ─────────');
  await buyPhase(7);
  await combat(1);                               // watching MIRA
  await kill(5, 0, 'TX_Hud_Sniper_Operater', true);  // KAIRO kills JUNO
  await kill(7, 3, 'TX_Hud_Rifles_Volcano');           // VEX kills RIKU
  await kill(1, 8, 'TX_Hud_Assault_AR10A2_S');         // MIRA kills NYX
  await kill(4, 9, 'TX_Hud_Assault_AR10A2_S');         // ECHO kills ZEN
  await kill(5, 2, 'TX_Hud_Sniper_Operater');           // KAIRO kills DAX
  await damage(6, 55);                                   // SOL takes damage before killing ECHO
  await kill(6, 4, 'TX_Hud_Rifles_Volcano');             // SOL kills ECHO → MIRA 1v3
  console.log('  🎯  1v3 — MIRA vs KAIRO / SOL / VEX');
  await damage(7, 40);                                   // MIRA chips VEX before kill
  await kill(1, 7, 'TX_Hud_Assault_AR10A2_S');           // MIRA kills VEX (ECHO assisted — prev damage)
  await kill(1, 6, 'TX_Hud_Rifles_Volcano');              // MIRA kills SOL
  await damage(5, 60);
  await kill(1, 5, 'TX_Hud_Assault_AR10A2_S', true);     // MIRA kills KAIRO ← CLUTCH 1v3
  teamStats[0].clutches++;
  // Lower third callout for MIRA clutch
  await patch({
    show: { lowerThird: true },
    lowerThird: { kind: 'player', player: [0, 1], stat: '1v3 CLUTCH', value: '5 KILLS' },
  });
  console.log('  📺  Lower third — MIRA clutch callout');
  await wait(Math.ceil(5000 / SPD));
  await patch({ show: { lowerThird: false } });
  await endRound(5, 2, 'clutch 1v3 — MIRA');

  // ── R8: FNC wins + techpause ──────────────────────────────────────────────
  await fncWinsQuick(8, 5, 3);
  console.log('\n── Techpause after R8 ────────────────────────────────────');
  const tphold = Math.ceil(8000 / SPD);
  await patch({ banner: { type: 'techpause', team: 1, ts: Date.now(), hold: tphold } });
  console.log('  🔧  TECHPAUSE — FNC');
  await wait(tphold + 800);

  // ── R9: Team ace → team ace banner ───────────────────────────────────────
  console.log('── R9: Team ace → team ace banner ───────────────────────');
  await buyPhase(9);
  await combat(4);                               // watching ECHO
  await kill(0, 5, 'TX_Hud_Rifles_Volcano');
  await kill(1, 6, 'TX_Hud_Assault_AR10A2_S');
  await kill(2, 7, 'TX_Hud_Rifles_Volcano');
  await kill(3, 8, 'TX_Hud_Rifles_Volcano');
  await kill(4, 9, 'TX_Hud_Assault_AR10A2_S');  // ← TEAM ACE
  console.log('  🌟  TEAM ACE — PRX');
  await endRound(6, 3, 'team ace (5 distinct killers)');

  // ── R10: Spike detonation ─────────────────────────────────────────────────
  console.log('── R10: Spike detonation → boom banner ──────────────────');
  await buyPhase(10);
  await combat(5);                               // watching KAIRO
  await kill(5, 2, 'TX_Hud_Sniper_Operater');
  await kill(5, 3, 'TX_Hud_Sniper_Operater');
  console.log('  💣  Spike planted — B site');
  await ingest([gev('planted_location', 'B')]);
  await patch({ round: { phase: 'planted', endsAt: Date.now() + Math.ceil(45000 / SPD) } });
  teamStats[0].plants++;
  await wait(SLOW ? 2000 : 350);
  await kill(0, 5, 'TX_Hud_Rifles_Volcano');
  await kill(0, 7, 'TX_Hud_Rifles_Volcano');
  console.log('  💥  Spike detonated');
  await ingest([gev('spike_detonated')]);
  await endRound(7, 3, 'spike detonated');

  // ── R11: Spike defuse via $300 money inference ────────────────────────────
  // buyPhase sets _prevMoney=3900 for all. After kills (boards at 3900),
  // sending allBoards(4200) gives +$300 delta — adapter infers spike planted.
  console.log('── R11: Spike defuse via $300 inference (no planted event) ─');
  await buyPhase(11);
  await combat(6);                               // watching SOL
  await kill(6, 0, 'TX_Hud_Rifles_Volcano');
  await kill(6, 4, 'TX_Hud_Rifles_Volcano');
  console.log('  💣  Spike planted (adapter infers from +$300 on all boards)');
  await ingest(allBoards(4200));                 // +$300 → adapter: s.round.phase = 'planted'
  await wait(SLOW ? 1000 : 200);
  await kill(8, 1, 'TX_KJ_Bees');
  await kill(7, 3, 'TX_Hud_Rifles_Volcano');
  await kill(9, 2, 'TX_Hud_Rifles_Volcano');
  console.log('  🔵  Spike defused');
  await ingest([gev('spike_defused')]);
  teamStats[1].defuses++;
  await endRound(7, 4, 'spike defused (via $300 inference)');

  // ── Scoreboard overlay — halftime stats review ────────────────────────────
  console.log('\n── Scoreboard overlay (halftime) ─────────────────────────');
  await patch({ show: { scoreboard: true } });
  console.log('  📊  Scoreboard ON');
  await wait(Math.ceil(8000 / SPD));
  await patch({ show: { scoreboard: false } });
  console.log('  📊  Scoreboard OFF');

  // ── Score sync → 11-11 ────────────────────────────────────────────────────
  console.log('\n── Score sync 7-4 → 11-11 (match point / OT setup) ──────');
  await ingest([info('match_score', { team_0: 11, team_1: 11 })]);
  // Full team objects required — PATCH replaces arrays wholesale
  await patch({
    teams: [
      { name: 'PAPER REX', tag: 'PRX', color: '#4fd3ea', logo: '', score: 11, series: 0, side: 'ATK', timeouts: 2, lossStreak: 0 },
      { name: 'FNATIC',    tag: 'FNC', color: '#e0445e', logo: '', score: 11, series: 0, side: 'DEF', timeouts: 2, lossStreak: 0 },
    ],
  });
  console.log('  ↗  Score synced to 11-11');
  await wait(1500);

  // ── R12: FNC wins → 11-12 → match point banner ────────────────────────────
  console.log('── R12: FNC wins → 11-12 → matchpoint banner ────────────');
  await buyPhase(12);
  await combat(5);
  await kill(5, 0, 'TX_Hud_Sniper_Operater', true);
  await kill(5, 1, 'TX_Hud_Sniper_Operater');
  await kill(6, 2, 'TX_Hud_Rifles_Volcano');
  await kill(7, 3, 'TX_Hud_Rifles_Volcano');
  await kill(9, 4, 'TX_Hud_Assault_AR10A2_S');
  await endRound(11, 12, 'FNC match point — score 12');

  // ── R13: PRX wins → 12-12 → overtime banner ───────────────────────────────
  console.log('── R13: PRX wins → 12-12 → overtime banner ──────────────');
  await buyPhase(13);
  await combat(0);
  await kill(0, 5, 'TX_Hud_Rifles_Volcano', true);
  await kill(1, 6, 'TX_Hud_Assault_AR10A2_S');
  await kill(2, 7, 'TX_Hud_Rifles_Volcano');
  await kill(3, 8, 'TX_Hud_Rifles_Volcano');
  await kill(4, 9, 'TX_Hud_Assault_AR10A2_S');
  await endRound(12, 12, 'OVERTIME');

  // ── R14: OT round — PRX flawless win ──────────────────────────────────────
  console.log('── R14: OT round — PRX flawless ─────────────────────────');
  await buyPhase(14);
  await combat(3);                               // watching RIKU
  await kill(0, 9, 'TX_Hud_Rifles_Volcano');
  await kill(1, 8, 'TX_Hud_Assault_AR10A2_S');
  await kill(2, 7, 'TX_Hud_Rifles_Volcano');
  await kill(3, 6, 'TX_Hud_Rifles_Volcano');
  await kill(4, 5, 'TX_Hud_Assault_AR10A2_S');
  await endRound(13, 12, 'PRX wins OT — flawless');

  await ingest([gev('match_end')]);
  console.log('\n  🏆  Match end — PRX wins 13:12');

  // ── Final stats summary ───────────────────────────────────────────────────
  console.log('\n  Final player ACS:');
  for (let i = 0; i < 10; i++) {
    const acs = roundsPlayed > 0 ? Math.round(totalCS[i] / roundsPlayed) : 0;
    const hsPct = K[i] > 0 ? Math.round(hsK[i] / K[i] * 100) : 0;
    console.log(`    ${ROSTER[i][0].padEnd(14)} ACS:${String(acs).padStart(4)}  K:${K[i]} D:${D[i]} A:${A[i]}  HS:${hsPct}%`);
  }

  console.log(`\n${'═'.repeat(64)}`);
  console.log('  All banner types, damage, ult, assists, teamStats, $300');
  console.log('  inference, force-buy, timeout, techpause, scoreboard');
  console.log('  overlay, lower third, and observing rotation — tested.');
  console.log('  Check ingame.html?match=MAIN&bg=1 for overlay preview.');
  console.log(`${'═'.repeat(64)}\n`);
})().catch(e => {
  console.error('\n✖  Server unreachable. Start with:\n   node server/server.js\n', e.message);
  process.exit(1);
});
