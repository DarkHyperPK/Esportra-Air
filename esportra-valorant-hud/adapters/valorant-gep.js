// Valorant adapter: raw Overwolf game-event (GEP) messages → Esportra HUD state.
// Written from Overwolf's public Valorant docs: https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/valorant
// Pure: ingest(state, message, now) returns { state, events } and never does I/O, so it can be unit-tested and replayed.
//
// Accepted message shapes (all three appear in Overwolf's docs):
//   { info: { match_info: { round_number: "3" } }, feature: "match_info" }
//   { feature: "match_info", key: "scoreboard_0", data|value: "{…json…}" }
//   { events: [ { name: "kill_feed", data: "{…json…}" } ] }
// Player-PC (auxiliary) messages add the sender: { playerId: "<riot puuid>", feature: "me", info: { me: { health: "64" } } }
'use strict';

const AGENTS = { Clay: 'RAZE', Pandemic: 'VIPER', Wraith: 'OMEN', Hunter: 'SOVA', Thorne: 'SAGE', Phoenix: 'PHOENIX', Wushu: 'JETT', Gumshoe: 'CYPHER',
  Sarge: 'BRIMSTONE', Breach: 'BREACH', Vampire: 'REYNA', Killjoy: 'KILLJOY', Guide: 'SKYE', Stealth: 'YORU', Rift: 'ASTRA', Grenadier: 'KAY/O',
  Deadeye: 'CHAMBER', Sprinter: 'NEON', BountyHunter: 'FADE', Mage: 'HARBOR', AggroBot: 'GEKKO', Cable: 'DEADLOCK', Sequoia: 'ISO', Smonk: 'CLOVE',
  Nox: 'VYSE', Cashew: 'TEJO', Terra: 'WAYLAY',
  Iris: 'MIKS',
  Pine: 'VETO' };
const _warnedCodenames = new Set();
const MAPS = { Infinity: 'ABYSS', Triad: 'HAVEN', Duality: 'BIND', Bonsai: 'SPLIT', Ascent: 'ASCENT', Port: 'ICEBOX', Foxtrot: 'BREEZE', Canyon: 'FRACTURE',
  Pitt: 'PEARL', Jam: 'LOTUS', Juliett: 'SUNSET', Rook: 'CORRODE', Summit: 'SUMMIT' };
// scoreboard "weapon" (current loadout) codes
const LOADOUT = { TX_Hud_Pistol_Classic: 'CLASSIC', TX_Hud_Pistol_Slim: 'SHORTY', TX_Hud_Pistol_AutoPistol: 'FRENZY', TX_Hud_Pistol_Luger: 'GHOST',
  TX_Hud_Pistol_Sheriff: 'SHERIFF', TX_Hud_Shotguns_Pump: 'BUCKY', TX_Hud_Shotguns_Persuader: 'JUDGE', TX_Hud_SMGs_Vector: 'STINGER', TX_Hud_SMGs_Ninja: 'SPECTRE',
  TX_Hud_Rifles_Burst: 'BULLDOG', TX_Hud_Rifles_DMR: 'GUARDIAN', TX_Hud_Rifles_Ghost: 'PHANTOM', TX_Hud_Rifles_Volcano: 'VANDAL', TX_Hud_Sniper_Bolt: 'MARSHAL',
  TX_Hud_Sniper_Operater: 'OPERATOR', TX_Hud_Sniper_DoubleSniper: 'OUTLAW', TX_Hud_LMG: 'ARES', TX_Hud_HMG: 'ODIN', knife: 'MELEE',
  TX_Hud_Pistol_Bandit: 'BANDIT', TX_Hud_Rifles_Warden: 'WARDEN' };
// kill_feed "weapon" codes (case-insensitive; abilities resolve to their display names).
// Two code families accepted: short internal codes (real GEP kill_feed) and LOADOUT-style codes (simulator / GEP variants).
const KILL = {
  // ── short internal GEP kill_feed codes ───────────────────────────────────
  tx_hud_pistol_glock_s: 'CLASSIC', tx_hud_pistol_sawedoff_s: 'SHORTY', tx_hud_autopistol: 'FRENZY', tx_hud_pistol_luger_s: 'GHOST',
  tx_hud_pistol_revolver_s: 'SHERIFF', tx_hud_pump: 'BUCKY', tx_hud_shotguns_spas12_s: 'JUDGE', tx_hud_vector: 'STINGER', tx_hud_smg_mp5_s: 'SPECTRE',
  tx_hud_burst: 'BULLDOG', tx_hud_dmr: 'GUARDIAN', tx_hud_assault_ar10a2_s: 'PHANTOM', tx_hud_volcano: 'VANDAL', tx_hud_sniper_boltaction_s: 'MARSHAL',
  tx_hud_operator: 'OPERATOR', tx_hud_doublesniper: 'OUTLAW', tx_hud_lmg: 'ARES', tx_hud_hmg: 'ODIN', tx_hud_knife_standard_s: 'MELEE', knife: 'MELEE',
  // ── LOADOUT-style aliases (scoreboard codes reused in kill_feed by some GEP versions / simulator) ─
  tx_hud_pistol_classic: 'CLASSIC', tx_hud_pistol_slim: 'SHORTY', tx_hud_pistol_autopistol: 'FRENZY', tx_hud_pistol_luger: 'GHOST',
  tx_hud_pistol_sheriff: 'SHERIFF', tx_hud_shotguns_pump: 'BUCKY', tx_hud_shotguns_persuader: 'JUDGE', tx_hud_smgs_vector: 'STINGER',
  tx_hud_smgs_ninja: 'SPECTRE', tx_hud_rifles_burst: 'BULLDOG', tx_hud_rifles_dmr: 'GUARDIAN', tx_hud_rifles_ghost: 'PHANTOM',
  tx_hud_rifles_volcano: 'VANDAL', tx_hud_sniper_bolt: 'MARSHAL', tx_hud_sniper_operater: 'OPERATOR', tx_hud_sniper_doublesniper: 'OUTLAW',
  tx_hud_pistol_bandit: 'BANDIT', tx_hud_rifles_warden: 'WARDEN',
  // ── abilities ─────────────────────────────────────────────────────────────
  tx_breach_fusionblast: 'AFTERSHOCK', tx_sarge_molotovlauncher: 'INCENDIARY', tx_sarge_orbitalstrike: 'ORBITAL STRIKE', tx_pheonix_firewall: 'BLAZE',
  tx_pheonix_molotov: 'HOT HANDS', tx_hunter_shockarrow: 'SHOCK BOLT', tx_hunter_bowblast: "HUNTER'S FURY", tx_hud_deadeye_q_pistol: 'HEADHUNTER',
  tx_hud_deadeye_x_giantslayer: 'TOUR DE FORCE', tx_cable_fishinghook: 'ANNIHILATION', tx_hud_wushu_x_dagger: 'BLADE STORM', tx_neon_ult: 'OVERDRIVE',
  tx_gumshoe_tripwire: 'TRAPWIRE', tx_gren_icon: 'FRAG/MENT', tx_aggrobot_bubbles: 'MOSH PIT', tx_kj_bees: 'NANOSWARM', tx_kj_turret: 'TURRET',
  tx_clay_boomba: 'BOOM BOT', tx_clay_clusterbomb: 'PAINT SHELLS', tx_clay_rocketlauncher: 'SHOWSTOPPER', tx_guide4: 'TRAILBLAZER',
  tx_pandemic_acidlauncher: 'SNAKE BITE', tx_ui_cashew_e: 'GUIDED SALVO', tx_ui_cashew_x: 'ARMAGEDDON',
};
const SHIELD = { 0: 0, 1: 25, 2: 50, 4: 25 };              // 3 = enemy shield unknown → keep the last value

const parse = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch (e) { return v; } };
const agentOf = c => { const raw = String(c || '').replace(/_PC_C$/, ''); const r = AGENTS[raw]; if (r === undefined && raw && !_warnedCodenames.has(raw)) { _warnedCodenames.add(raw); console.warn('[agent-codename] Unknown:', raw, '— add to AGENTS map'); } return r || String(c || '').toUpperCase(); };
const nameKey = n => String(n || '').split('#')[0].trim().toLowerCase();
const shortName = n => String(n || '').split('#')[0].trim().toUpperCase();

// Flatten every documented message shape into { infos:[{key,value}], events:[{name,data}], playerId }
function normalize(msg) {
  const infos = [], events = [];
  if (msg.info) for (const cat in msg.info) for (const key in msg.info[cat]) infos.push({ key, value: parse(msg.info[cat][key]) });
  if (msg.key) infos.push({ key: msg.key, value: parse(msg.data !== undefined ? msg.data : msg.value) });
  if (msg.events) for (const e of msg.events) events.push({ name: e.name, data: parse(e.data) });
  if (msg.name && !msg.key && !msg.events) events.push({ name: msg.name, data: parse(msg.data) });
  return { infos, events, playerId: msg.playerId };
}

function createValorantAdapter(opts = {}) {
  const coverage = new (require('./player-coverage'))();
  const teamOf = opts.teamOf || (g => g);                  // game team (0 always starts on attack) → HUD team index
  const ctx = {
    slots: new Map(), byName: new Map(), spike: {}, lastScore: null, pendingKills: [],
    roundKills: new Map(),          // 'team,idx' → kill count this round (for ace)
    teamKillers: [new Set(), new Set()], // team → set of player indices who got a kill (for team ace)
    clutch: null,                   // { tp:[t,j], against:N } — 1vX state set when outnumbered player detected
    roundEcon: null,                // [totalCreditsTeam0, totalCreditsTeam1] snapshot at combat start (for thrifty)
    roundBanner: null,              // banner type already fired this round (ace/teamace) — prevents overwrite
    roundFirstKill: false,
    overtimeFired: false,           // fire overtime banner only once
  };

  function slot(s, pid, gameTeam, name, authoritative) {
    if (ctx.slots.has(pid)) { const cur = ctx.slots.get(pid); if (!authoritative || cur[0] === teamOf(+gameTeam || 0)) return cur; ctx.slots.delete(pid); }
    const t = teamOf(+gameTeam || 0), used = [...ctx.slots.values()].filter(x => x[0] === t).map(x => x[1]);
    const j = [0, 1, 2, 3, 4].find(k => !used.includes(k)); if (j === undefined) return null;
    ctx.slots.set(pid, [t, j]); if (name) ctx.byName.set(nameKey(name), [t, j]);
    s.firstSide = [teamOf(0) === 0 ? 'ATK' : 'DEF', teamOf(0) === 0 ? 'DEF' : 'ATK'];
    return [t, j];
  }
  const P = (s, tp) => tp && s.players[tp[0]] && s.players[tp[0]][tp[1]];
  const side = (s, t, r) => { const f = s.firstSide[t], o = f === 'ATK' ? 'DEF' : 'ATK'; return r <= 12 ? f : r <= 24 ? o : ((r - 25) % 2 ? o : f); };
  const setSides = s => s.teams.forEach((T, t) => { T.side = side(s, t, s.round.number || 1); });
  const mkBanner = (type, team, player, text, method, ts, hold) => ({ type, team, player, text: text || '', method: method || '', ts, hold });
  const HOW_LABEL = { boom: 'SPIKE DETONATED', defuse: 'SPIKE DEFUSED', time: 'TIME EXPIRED', elim: 'ELIMINATION' };
  const attackingTeam = s => s.teams.findIndex(T => T.side === 'ATK');
  function countPlant(s, now, out) {
    if (ctx.spike.planted) return;
    ctx.spike.planted = true;
    s.round.phase = 'planted'; s.round.endsAt = now + 45000;
    const t = attackingTeam(s); if (t >= 0) s.teamStats[t].plants++;
    out.push({ type: 'spike.planted' });
  }
  function countFirstKill(s, killer) {
    if (ctx.roundFirstKill) return;
    ctx.roundFirstKill = true;
    const p = P(s, killer); if (p) p.fk = (+p.fk || 0) + 1;
    s.teamStats[killer[0]].firstKills++;
  }

  function tryReplayKills(s, out, now) {
    if (!ctx.pendingKills.length) return;
    const toProcess = ctx.pendingKills.slice(); ctx.pendingKills = [];
    for (const entry of toProcess) {
      if (now - entry.ts > 5000) { console.warn('[kill-queue] Dropped unresolvable kill:', entry.data.attacker, entry.data.victim); continue; }
      const k = ctx.byName.get(nameKey(entry.data.attacker)), vt = ctx.byName.get(nameKey(entry.data.victim));
      if (!k || !vt) { ctx.pendingKills.push(entry); continue; }
      const d = entry.data;
      const w = KILL[String(d.weapon || d.ult || '').toLowerCase()] || String(d.weapon || 'SPIKE').replace(/^TX_(Hud_)?/i, '').toUpperCase();
      const V = P(s, vt); if (V) { V.alive = false; V.hp = 0; }
      s.killfeed = [...s.killfeed, { killer: k, victim: vt, weapon: w, hs: !!d.headshot, ts: entry.ts }].slice(-12);
      countFirstKill(s, k);
      const kKey = k.join(',');
      ctx.roundKills.set(kKey, (ctx.roundKills.get(kKey) || 0) + 1); ctx.teamKillers[k[0]].add(k[1]);
      if (ctx.roundKills.get(kKey) === 5 && !ctx.roundBanner) {
        s.banner = mkBanner('ace', k[0], k[1], '', '', entry.ts, 5500); ctx.roundBanner = 'ace'; out.push({ type: 'banner.ace', team: k[0], player: k[1] });
      } else if (ctx.teamKillers[k[0]].size === 5 && !ctx.roundBanner) {
        s.banner = mkBanner('teamace', k[0], 0, '', '', entry.ts, 4500); ctx.roundBanner = 'teamace'; out.push({ type: 'banner.teamace', team: k[0] });
      }
      if (s.round.phase === 'live' || s.round.phase === 'planted') {
        for (let t = 0; t < 2; t++) {
          const myAlive = s.players[t].filter(p => p.alive).length, oppAlive = s.players[1 - t].filter(p => p.alive).length;
          if (myAlive === 1 && oppAlive >= 1 && (!ctx.clutch || ctx.clutch.tp[0] !== t))
            ctx.clutch = { tp: [t, s.players[t].findIndex(p => p.alive)], against: oppAlive };
        }
      }
      out.push({ type: 'kill', killer: k, victim: vt, weapon: w, hs: !!d.headshot });
    }
  }

  function ingest(state, msg, now = Date.now()) {
    const s = state, out = []; const { infos, events, playerId } = normalize(msg || {});
    coverage.record(playerId, infos, msg?.captureHeartbeat === true, now);
    for (const { key, value: v } of infos) {
      if (/^scoreboard_\d+$/.test(key) && v && v.player_id) {
        const team = [0, 1, '0', '1'].includes(v.team) ? Number(v.team) : v.teammate === false || v.teammate === 'false' ? 1 : 0;
        const tp = slot(s, v.player_id, team, v.name, true), p = P(s, tp); if (!p) continue;
        ctx.byName.set(nameKey(v.name), tp);
        Object.assign(p, { inGameName: typeof v.name === 'string' ? v.name.slice(0,128) : '', name: shortName(v.name) || p.name, agent: agentOf(v.character) || p.agent, alive: !!v.alive, ult: +v.ult_points || 0, ultMax: +v.ult_max || p.ultMax,
          k: +v.kills || 0, d: +v.deaths || 0, a: +v.assists || 0, credits: +v.money || 0, spike: !!v.spike, puuid: v.player_id });
        if (p.acs === 0) p.acs = null;
        if (p.adr === 0) p.adr = null;
        if (p.hs === 0) p.hs = null;
        if (v.weapon && LOADOUT[v.weapon]) p.weapon = LOADOUT[v.weapon];
        if (v.shield in SHIELD) p.armor = SHIELD[v.shield];
        if (!p.alive) p.hp = 0; else if (!p.hp) p.hp = 100;

        // Spike planted inference: every player receives exactly +300 credits when spike plants.
        // Guard on combat phase to avoid false positives from end-of-round economy bonuses.
        if (s.round.phase === 'live' && !ctx.spike.planted) {
          const prev = ctx._prevMoney?.get(v.player_id);
          if (prev !== undefined && (+v.money - prev) === 300) countPlant(s, now, out);
        }
        if (!ctx._prevMoney) ctx._prevMoney = new Map();
        ctx._prevMoney.set(v.player_id, +v.money || 0);
        tryReplayKills(s, out, now);

      } else if (/^roster_\d+$/.test(key) && v && v.player_id) {
        const team = [0, 1, '0', '1'].includes(v.team) ? Number(v.team) : v.teammate === false || v.teammate === 'false' ? 1 : 0;
        const tp = slot(s, v.player_id, team, v.name), p = P(s, tp); if (!p) continue;
        p.inGameName = typeof v.name === 'string' ? v.name.slice(0,128) : ''; p.name = shortName(v.name) || p.name; p.agent = agentOf(v.character); p.locked = !!v.locked; p.puuid = v.player_id; ctx.byName.set(nameKey(v.name), tp);
        tryReplayKills(s, out, now);
      } else if (key === 'ui_team_order_allies' || key === 'ui_team_order_enemies') {
        const t = key === 'ui_team_order_allies' ? 0 : 1;
        const picks = v && typeof v === 'object' ? Object.values(v) : [...String(v).matchAll(/\d+\s*:\s*"([^"]+)"/g)].map(match => match[1]);
        picks.slice(0, 5).forEach((pick, j) => { const p = s.players[t][j]; if (p && !p.puuid) p.agent = agentOf(pick); });
      } else if (key === 'round_number') { s.round.number = +v || s.round.number; setSides(s); }
      else if (key === 'round_phase') {
        const r = s.round;
        if (v === 'shopping') {
          s.prevCredits = s.players.map(team => team.map(p => +p.credits || 0));
          Object.assign(r, { phase: 'buy', endsAt: now + 30000 });
          s.killfeed = []; ctx.spike = {};
          ctx.roundKills.clear(); ctx.teamKillers[0].clear(); ctx.teamKillers[1].clear();
          ctx.clutch = null; ctx.roundEcon = null; ctx.roundBanner = null; ctx.roundFirstKill = false;
          if (ctx._prevMoney) ctx._prevMoney.clear();
          s.players.forEach(t => t.forEach(p => { p.alive = true; p.hp = 100; }));
        }
        else if (v === 'combat') {
          Object.assign(r, { phase: 'live', endsAt: now + 100000 });
          ctx.roundEcon = s.players.map(t => t.reduce((sum, p) => sum + (+p.credits || 0), 0));
        }
        else if (v === 'end' || v === 'game_end') Object.assign(r, { phase: 'end', endsAt: 0, remaining: 0 });
        out.push({ type: 'round.phase', phase: r.phase, round: r.number });
      } else if (key === 'match_score' && v) {
        const sc = [v.team_0, v.team_1].map(Number), mapped = [0, 1].map(t => sc[[0, 1].find(g => teamOf(g) === t)]);
        if (ctx.lastScore) [0, 1].forEach(t => { if (mapped[t] > ctx.lastScore[t]) {
          const l = 1 - t;
          const atkAlive = s.players[[0, 1].find(x => side(s, x, s.round.number) === 'ATK')].some(p => p.alive);
          const how = ctx.spike.detonated ? 'boom' : ctx.spike.defused ? 'defuse' : side(s, t, s.round.number) === 'DEF' && atkAlive ? 'time' : 'elim';
          s.rounds = [...(s.rounds || []), { w: t, how }];
          s.teams[t].lossStreak = 0; s.teams[l].lossStreak = Math.min(4, (s.teams[l].lossStreak || 0) + 1);
          const clutchWon = ctx.clutch && ctx.clutch.tp[0] === t && ctx.clutch.against > 1 && P(s, ctx.clutch.tp)?.alive;
          const ecoWon = ctx.roundEcon && ctx.roundEcon[t] < ctx.roundEcon[l] * 0.55 && ctx.roundEcon[t] < 12000;
          if (clutchWon) s.teamStats[t].clutches++;
          if (ecoWon) s.teamStats[t].ecoWins++;

          // ── Banner priority ───────────────────────────────────────────────
          // The banner's kind is also the round's moment on the round.won event (autopilot rules).
          let moment = null, momentPlayer = null;
          // Overtime: both teams hit 12+ — fire once, then OT rounds get normal banners
          if (!ctx.overtimeFired && mapped[0] >= 12 && mapped[1] >= 12) {
            ctx.overtimeFired = true;
            s.banner = mkBanner('overtime', t, 0, '', '', now, 5000);
            moment = 'overtime';
          }
          // Match point: this team hits 12, the other has not (otherwise it would be overtime)
          else if (!ctx.roundBanner && mapped[t] === 12 && mapped[l] < 12) {
            s.banner = mkBanner('matchpoint', t, 0, '', '', now, 4200);
            moment = 'matchpoint';
          }
          // Ace or team ace already fired from kill event — don't overwrite
          else if (ctx.roundBanner === 'ace' || ctx.roundBanner === 'teamace') {
            // banner already set; nothing to do
          }
          // Flawless: winning team has all 5 players alive at round end
          else if (s.players[t].every(p => p.alive)) {
            s.banner = mkBanner('flawless', t, 0, '', '', now, 4200);
            moment = 'flawless';
          }
          // Clutch: a solo player won against multiple opponents
          else if (clutchWon) {
            const cp = ctx.clutch;
            s.banner = mkBanner('clutch', cp.tp[0], cp.tp[1], String(cp.against), '', now, 4800);
            moment = 'clutch';
            momentPlayer = cp.tp[1];
          }
          // Thrifty: winning team had significantly less economy at combat start
          else if (ecoWon) {
            s.banner = mkBanner('thrifty', t, 0, '', '', now, 4200);
            moment = 'thrifty';
          }
          // Default: round win
          else {
            s.banner = mkBanner('round', t, 0, '', HOW_LABEL[how], now, 4200);
            moment = 'round';
          }

          out.push({ type: 'round.won', team: t, how, round: s.rounds.length, moment, player: momentPlayer });
        } });
        ctx.lastScore = mapped; s.teams[0].score = mapped[0]; s.teams[1].score = mapped[1];
      } else if (key === 'map' && MAPS[v]) s.map.name = MAPS[v];
      else if (key === 'observing') { const tp = ctx.byName.get(nameKey(v)); if (tp) s.observed = tp; }
      else if (key === 'kill_feed' || key === 'planted_location' || key === 'match_start' || key === 'match_end') events.push({ name: key, data: v });
    }
    for (const { name, data: d } of events) {
      if (name === 'kill_feed' && d) {
        const k = ctx.byName.get(nameKey(d.attacker)), vt = ctx.byName.get(nameKey(d.victim));
        if (!k || !vt) { ctx.pendingKills = [...ctx.pendingKills, { data: d, ts: now }].slice(-10); continue; }
        const w = KILL[String(d.weapon || d.ult || '').toLowerCase()] || String(d.weapon || 'SPIKE').replace(/^TX_(Hud_)?/i, '').toUpperCase();
        const V = P(s, vt); V.alive = false; V.hp = 0;
        s.killfeed = [...s.killfeed, { killer: k, victim: vt, weapon: w, hs: !!d.headshot, ts: now }].slice(-12);
        countFirstKill(s, k);

        // ── Per-round kill tracking ───────────────────────────────────────
        const kKey = k.join(',');
        ctx.roundKills.set(kKey, (ctx.roundKills.get(kKey) || 0) + 1);
        ctx.teamKillers[k[0]].add(k[1]);

        // Ace: one player eliminates all 5 opponents in a single round
        if (ctx.roundKills.get(kKey) === 5 && !ctx.roundBanner) {
          s.banner = mkBanner('ace', k[0], k[1], '', '', now, 5500);
          ctx.roundBanner = 'ace';
          out.push({ type: 'banner.ace', team: k[0], player: k[1] });
        }
        // Team ace: 5 different players each got a kill (check after each kill)
        else if (ctx.teamKillers[k[0]].size === 5 && !ctx.roundBanner) {
          s.banner = mkBanner('teamace', k[0], 0, '', '', now, 4500);
          ctx.roundBanner = 'teamace';
          out.push({ type: 'banner.teamace', team: k[0] });
        }

        // ── Clutch detection ─────────────────────────────────────────────
        // Record the first time a player is outnumbered (1vX) during live/planted phase
        if (s.round.phase === 'live' || s.round.phase === 'planted') {
          for (let t = 0; t < 2; t++) {
            const myAlive = s.players[t].filter(p => p.alive).length;
            const oppAlive = s.players[1 - t].filter(p => p.alive).length;
            if (myAlive === 1 && oppAlive >= 1 && (!ctx.clutch || ctx.clutch.tp[0] !== t)) {
              ctx.clutch = { tp: [t, s.players[t].findIndex(p => p.alive)], against: oppAlive };
            }
          }
        }

        out.push({ type: 'kill', killer: k, victim: vt, weapon: w, hs: !!d.headshot });
      } else if (name === 'spike_defused') { if (!ctx.spike.defused) { const t = 1 - attackingTeam(s); if (t >= 0 && t < 2) s.teamStats[t].defuses++; } ctx.spike.defused = true; out.push({ type: 'spike.defused' }); }
      else if (name === 'spike_detonated') { ctx.spike.detonated = true; out.push({ type: 'spike.detonated' }); }
      else if (name === 'planted_location') { countPlant(s, now, out); out.push({ type: 'spike.site', site: d }); }
      else if (name === 'match_start') { s.rounds = []; ctx.lastScore = [0, 0]; ctx.overtimeFired = false; ctx.roundFirstKill = false; s.teams.forEach(T => { T.score = 0; T.lossStreak = 0; }); s.teamStats.forEach(T => { T.plants = 0; T.defuses = 0; T.clutches = 0; T.ecoWins = 0; T.firstKills = 0; }); s.players.flat().forEach(p => { p.fk = 0; p.acs = null; p.adr = null; p.hs = null; }); out.push({ type: 'match.start' }); }
      else if (name === 'match_end') out.push({ type: 'match.end' });
    }
    coverage.apply(s, now);
    return { state: s, events: out };
  }
  return { ingest, ctx };
}
module.exports = { createValorantAdapter, AGENTS, MAPS, LOADOUT, KILL };
