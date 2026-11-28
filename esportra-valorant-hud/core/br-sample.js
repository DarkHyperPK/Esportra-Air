/* A made-up battle royale lobby (22 Nov) for previews, thumbnails, Graphics studio and the parts audit: 16
   teams after match 4 of 6, match 5 live. No real organisations. Shapes match the room's `br` field (Air's
   src/main/br-lobbies.ts) and the live field `brLive` the observer feed will fill (step 6). */
(function () {
  const NAMES = [['NIGHT OWLS', 'NOW', '#22d3ee'], ['CRIMSON FIVE', 'CRF', '#f43f5e'], ['IRON PINE', 'IRP', '#ffb60e'], ['DUNE RUNNERS', 'DUR', '#a78bfa'], ['SILVER FOX', 'SFX', '#94a3b8'], ['NORTH TIDE', 'NTD', '#38bdf8'], ['BLUE HARBOR', 'BLH', '#60a5fa'], ['STONE WOLVES', 'STW', '#a3a3a3'], ['RED KESTREL', 'RKS', '#fb7185'], ['LOW ORBIT', 'LOR', '#34d399'], ['WILD CARD', 'WCD', '#f472b6'], ['GREY MOUNTAIN', 'GRM', '#cbd5e1'], ['FERAL SIX', 'FRX', '#fbbf24'], ['ECHO VALLEY', 'ECV', '#4ade80'], ['QUIET STORM', 'QST', '#818cf8'], ['HIGH GROUND', 'HGD', '#f97316']];
  const teams = NAMES.map(([name, tag, color], i) => ({ id: 's' + i, name, tag, color, logo: '', players: ['ONE', 'TWO', 'THREE', 'FOUR'].map(p => tag + '_' + p), photos: [] }));
  const placement = [10, 6, 5, 4, 3, 2, 1, 1];
  // Four played matches: [team index, place, elims] per row.
  const played = [
    [[2, 1, 9], [0, 2, 7], [5, 3, 5], [1, 4, 4], [3, 5, 3], [7, 6, 2], [9, 7, 2], [6, 8, 1], [11, 9, 2], [10, 10, 1], [13, 11, 1], [8, 12, 2], [12, 13, 1], [4, 14, 3], [15, 15, 0], [14, 16, 0]],
    [[0, 1, 8], [2, 2, 6], [3, 3, 4], [5, 4, 3], [1, 5, 5], [9, 6, 2], [7, 7, 3], [4, 8, 2], [6, 9, 1], [10, 10, 2], [11, 11, 1], [12, 12, 1], [8, 13, 1], [13, 14, 0], [14, 15, 1], [15, 16, 0]],
    [[5, 1, 6], [1, 2, 7], [0, 3, 4], [2, 4, 5], [7, 5, 2], [3, 6, 3], [6, 7, 2], [9, 8, 1], [4, 9, 2], [11, 10, 1], [10, 11, 1], [13, 12, 0], [15, 13, 1], [8, 14, 1], [12, 15, 0], [14, 16, 0]],
    [[2, 1, 7], [3, 2, 5], [1, 3, 6], [0, 4, 3], [7, 5, 4], [6, 6, 2], [5, 7, 3], [9, 8, 2], [4, 9, 1], [8, 10, 2], [12, 11, 1], [10, 12, 0], [11, 13, 1], [15, 14, 1], [13, 15, 0], [14, 16, 0]],
  ];
  const maps = ['Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Miramar', 'Erangel'];
  const games = maps.map((map, i) => ({ n: i + 1, map, startsAt: ['17:00', '17:40', '18:20', '19:00', '19:40', '20:25'][i], done: i < 4, results: i < 4 ? played[i].map(([t, place, elims]) => ({ team: 's' + t, place, elims })) : [] }));
  const totals = teams.map(t => ({ team: t.id, total: 0, placementPts: 0, elims: 0, elimPts: 0, wins: 0, played: 0, bestPlace: null, lastPlace: null, matchPoint: false, rank: 0 }));
  games.filter(g => g.done).forEach(g => g.results.forEach(r => { const row = totals.find(x => x.team === r.team); const p = placement[r.place - 1] || 0; row.total += p + r.elims; row.placementPts += p; row.elims += r.elims; row.elimPts += r.elims; row.played++; if (r.place === 1) row.wins++; row.lastPlace = r.place; row.bestPlace = row.bestPlace == null ? r.place : Math.min(row.bestPlace, r.place); }));
  totals.sort((a, b) => b.total - a.total || b.wins - a.wins).forEach((r, i) => { r.rank = i + 1; r.matchPoint = r.total >= 55; });
  window.BR_SAMPLE = {
    br: { title: 'GROUP A', stage: 'DAY 2', game: 'pubgm', teams, games, scoring: { placement, perElim: 1, matchPoint: 55, tiebreak: ['wins', 'placementPts', 'elims', 'lastGame'] }, standings: totals, current: 5, played: 4, champion: null },
    // Match 5, mid-game: per team the players' states (a alive, k knocked, d out), elims so far, the place once out.
    brLive: {
      game: 5, teamsAlive: 12, playersAlive: 33,
      teams: Object.fromEntries([['s2', 'aaaa', 9], ['s0', 'aaak', 6], ['s5', 'aad', 5], ['s3', 'aaaa', 4], ['s1', 'ak', 3], ['s7', 'akd', 3], ['s9', 'aaa', 2], ['s6', 'aadd', 1], ['s11', 'a', 2], ['s10', 'aaaa', 0], ['s13', 'aa', 1], ['s15', 'aak', 1], ['s12', 'dddd', 1, 13], ['s8', 'dddd', 1, 14], ['s4', 'dddd', 3, 15], ['s14', 'dddd', 0, 16]].map(([id, p, e, place]) => [id, { players: p, elims: e, place: place || null }])),
      lastOut: { team: 's12', place: 13, at: 0 },
      players: [['IRP_ONE', 3, 402], ['IRP_TWO', 2, 355], ['IRP_THREE', 1, 288], ['IRP_FOUR', 1, 190]].map(([name, elims, damage]) => ({ team: 's2', name, elims, damage })),
      mvp: [['s0', 'NOW_RAVEN', 6, 688, 1270], ['s2', 'IRP_ASH', 3, 402, 1421], ['s5', 'NTD_FROST', 4, 617, 1195], ['s1', 'CRF_EMBER', 4, 574, 962]].map(([team, name, elims, damage, survived]) => ({ team, name, elims, damage, survived })),
    },
  };
  // Day standings (28 Nov): matches 1–2 are Day 1, 3–4 Day 2. `?prov=1` leaves match 4 unconfirmed: the standings graphics
  // then show it marked (as the lobby's "mark provisional" switch does). Same shape as Air's room fields `brDay`, `br.provisional`.
  const QD = new URLSearchParams(location.search), PROV = QD.get('prov') === '1';
  const tally = list => {
    const by = new Map(teams.map(t => [t.id, { team: t.id, total: 0, placementPts: 0, elims: 0, elimPts: 0, wins: 0, played: 0, bestPlace: null, lastPlace: null, matchPoint: false, rank: 0, adjusted: 0 }]));
    list.forEach(g => g.results.forEach(r => { const x = by.get(r.team), p = placement[r.place - 1] || 0; x.total += p + r.elims; x.placementPts += p; x.elims += r.elims; x.elimPts += r.elims; x.played++; if (r.place === 1) x.wins++; x.lastPlace = r.place; x.bestPlace = x.bestPlace == null ? r.place : Math.min(x.bestPlace, r.place); }));
    const rows = [...by.values()].sort((a, b) => b.total - a.total || b.wins - a.wins || b.placementPts - a.placementPts || b.elims - a.elims);
    rows.forEach((r, i) => { r.rank = i + 1; r.matchPoint = r.total >= 55; });
    return rows;
  };
  const done = games.filter(g => g.done), dayOne = done.filter(g => g.n <= 2), dayTwo = done.filter(g => g.n > 2);
  const sureDone = PROV ? done.filter(g => g.n < 4) : done;
  const rankBefore = new Map(tally(dayOne).map(r => [r.team, r.rank]));
  const dayRank = tally(done);
  const one = new Map(tally(dayOne).map(r => [r.team, r.total])), two = new Map(tally(dayTwo).map(r => [r.team, r.total])), pv = new Map(tally(PROV ? done.filter(g => g.n === 4) : []).map(r => [r.team, r.total]));
  window.BR_SAMPLE.brDay = { n: 2, id: 'sample-d2', title: 'Day 2', dayCount: 2, matches: 2, confirmed: PROV ? 1 : 2, provisionalGames: PROV ? [4] : [], played: 4,
    rows: dayRank.map(r => ({ team: r.team, rank: r.rank, move: (rankBefore.get(r.team) || r.rank) - r.rank, total: r.total, days: [one.get(r.team) || 0, two.get(r.team) || 0], today: two.get(r.team) || 0, prov: pv.get(r.team) || 0, wins: r.wins, elims: r.elims })) };
  if (PROV) {
    window.BR_SAMPLE.br.provisional = { standings: dayRank, games: [4] };
    window.BR_SAMPLE.br.standings = tally(sureDone);
    window.BR_SAMPLE.br.played = 3;
    window.BR_SAMPLE.br.markProvisional = true;
  }
  // What Air saves from the observer feed for each played match, and the day's totals (room field `brStats`):
  // made-up numbers that add up (each team's player kills equal its elims in the match).
  const hash = (a, b) => { let h = (a * 2654435761 + b * 40503) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  const statGames = games.filter(g => g.done).map(g => {
    const players = [];
    g.results.forEach(r => { const t = teams.find(x => x.id === r.team); let left = r.elims;
      t.players.forEach((name, k) => { const kills = k === 3 ? left : Math.min(left, Math.floor(hash(g.n * 31 + k, r.place) * (left + 1))); left -= kills;
        const surv = Math.round((1 - (r.place - 1) / 16) * 1500 + hash(k, g.n) * 240), dmg = Math.round(kills * 140 + hash(g.n, k * 7 + r.place) * 220);
        players.push({ name, team: t.id, kills, knockouts: kills + Math.floor(hash(k + 3, g.n) * 3), assists: Math.floor(hash(k, r.place + g.n) * 3), damage: dmg, damageTaken: Math.round(dmg * 0.7 + 120), heal: Math.round(200 + hash(g.n + k, 9 + r.place * 13) * 400), headshots: Math.floor(kills / 2), rescues: Math.floor(hash(k, 5 + g.n) * 3), survival: surv, maxKillDistance: Math.round(20 + hash(k, g.n + 11) * 260), games: 1, wins: r.place === 1 ? 1 : 0, rating: 0 }); }); });
    players.forEach(p => { p.rating = Math.round((p.kills * 2 + p.damage / 100 + p.knockouts * 0.5 + p.assists + p.survival / 600) * 10) / 10; });
    players.sort((a, b) => b.rating - a.rating);
    const teamsT = teams.map(t => { const ps = players.filter(p => p.team === t.id); return { team: t.id, games: 1, kills: ps.reduce((n, p) => n + p.kills, 0), knockouts: ps.reduce((n, p) => n + p.knockouts, 0), assists: ps.reduce((n, p) => n + p.assists, 0), damage: ps.reduce((n, p) => n + p.damage, 0), damageTaken: ps.reduce((n, p) => n + p.damageTaken, 0), heal: ps.reduce((n, p) => n + p.heal, 0), rescues: ps.reduce((n, p) => n + p.rescues, 0), survival: ps.reduce((n, p) => n + p.survival, 0), headshots: ps.reduce((n, p) => n + p.headshots, 0) }; }).sort((a, b) => b.damage - a.damage);
    return { n: g.n, map: g.map, players, teams: teamsT, results: g.results.map(r => ({ ...r, pts: (placement[r.place - 1] || 0) + r.elims })) };
  });
  const dayBy = new Map();
  statGames.forEach(g => g.players.forEach(p => { const d = dayBy.get(p.name) || { ...p, kills: 0, knockouts: 0, assists: 0, damage: 0, damageTaken: 0, heal: 0, headshots: 0, rescues: 0, survival: 0, maxKillDistance: 0, games: 0, wins: 0 };
    ['kills', 'knockouts', 'assists', 'damage', 'damageTaken', 'heal', 'headshots', 'rescues', 'survival', 'games', 'wins'].forEach(k => { d[k] += p[k]; }); d.maxKillDistance = Math.max(d.maxKillDistance, p.maxKillDistance); dayBy.set(p.name, d); }));
  const day = [...dayBy.values()].map(p => ({ ...p, rating: Math.round((p.kills * 2 + p.damage / 100 + p.knockouts * 0.5 + p.assists + p.survival / 600) * 10) / 10, avgPlace: 0 })).sort((a, b) => b.rating - a.rating);
  window.BR_SAMPLE.brStats = { day, teams: [], games: statGames };
  // A moment and the live top fraggers band, for previews that ask for them (?moment=…, ?ltf=1).
  const Qs = new URLSearchParams(location.search), mk = Qs.get('moment');
  const MOMENTS = { 'first.blood': { kind: 'first.blood', team: 's2', causer: 'IRP_ONE', victim: 'CRF_FOUR', distance: 46 }, 'kill.leader': { kind: 'kill.leader', team: 's0', name: 'NOW_TWO', kills: 7 }, zone: { kind: 'zone' }, 'final.teams': { kind: 'final.teams', teams: ['s2', 's0', 's5', 's3'] }, 'match.point': { kind: 'match.point', team: 's2' } };
  window.BR_SAMPLE.moments = Object.fromEntries(Object.entries(MOMENTS).map(([k, v]) => [k, { ...v, at: 0, for: 6 }]));
  if (mk && MOMENTS[mk]) window.BR_SAMPLE.brLive.moment = { ...MOMENTS[mk], at: 0, for: 6 };
  window.BR_SAMPLE.brLive.zone = { time: 1248, status: 'move', index: 6, counter: 74, max: 195 };
  if (Qs.get('ltf') === '1') window.BR_SAMPLE.brLtf = true;
})();
