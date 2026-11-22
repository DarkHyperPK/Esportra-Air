/* A made-up battle royale lobby (22 Nov) for previews, thumbnails, Graphics studio and the parts audit: 16
   teams after match 4 of 6, match 5 live. No real organisations. Shapes match the room's `br` field (Air's
   src/main/br-lobbies.ts) and the live field `brLive` the observer feed will fill (step 6). */
(function () {
  const NAMES = [['NIGHT OWLS', 'NOW', '#22d3ee'], ['CRIMSON FIVE', 'CRF', '#f43f5e'], ['IRON PINE', 'IRP', '#ffb60e'], ['DUNE RUNNERS', 'DUR', '#a78bfa'], ['SILVER FOX', 'SFX', '#94a3b8'], ['NORTH TIDE', 'NTD', '#38bdf8'], ['BLUE HARBOR', 'BLH', '#60a5fa'], ['STONE WOLVES', 'STW', '#a3a3a3'], ['RED KESTREL', 'RKS', '#fb7185'], ['LOW ORBIT', 'LOR', '#34d399'], ['WILD CARD', 'WCD', '#f472b6'], ['GREY MOUNTAIN', 'GRM', '#cbd5e1'], ['FERAL SIX', 'FRX', '#fbbf24'], ['ECHO VALLEY', 'ECV', '#4ade80'], ['QUIET STORM', 'QST', '#818cf8'], ['HIGH GROUND', 'HGD', '#f97316']];
  const teams = NAMES.map(([name, tag, color], i) => ({ id: 's' + i, name, tag, color, logo: '', players: ['ONE', 'TWO', 'THREE', 'FOUR'].map(p => tag + '_' + p) }));
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
      mvp: [['s0', 'NOW_RAVEN', 6, 688, 1270], ['s2', 'IRP_ASH', 3, 402, 1421], ['s5', 'NTD_FROST', 4, 617, 1195], ['s1', 'CRF_EMBER', 4, 574, 962]].map(([team, name, elims, damage, survived]) => ({ team, name, elims, damage, survived })),
    },
  };
})();
