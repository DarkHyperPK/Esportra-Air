/* Post-game graphics (approved mock, 15 Nov): Breakdown (scoreboard), Team performance, Victory (map and
   series), Post-game player and Post-game matchup. They read the map record Air kept when a map ended
   (state.airRecord: one map, or the whole series added up), so map 1 can be shown while map 2 is live.
   Only what the game's data has: ACS is never shown; ADR and HS% only when the record has them.
   Load after hud.js; each is a module like the ones in hud.js, shown by the full-screen host or its own page. */
(function () {
  const HUD = window.HUD, M = HUD.modules, E = HUD.el;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const assetOk = v => typeof v === 'string' && /^(\/air-assets\/[0-9a-f-]{36}|\/art\/[^\s"'<>]+|https:\/\/[^\s"'<>]+|\.\.\/[^\s"'<>]+)$/i.test(v);
  const accent = s => (/^#[0-9a-f]{6}$/i.test(s.event && s.event.accent || '') ? s.event.accent : '#8b7cf6');
  const num = v => (v === null || v === undefined || v === '' ? '—' : esc(v));
  const kd = p => (p.d ? (p.k / p.d).toFixed(2) : p.k ? p.k.toFixed(2) : '—');
  const mark = (team, size) => assetOk(team.logo)
    ? `<img class="pg-mark" src="${esc(team.logo)}" alt="" style="width:${size}px;height:${size}px">`
    : `<span class="pg-mark tile" style="width:${size}px;height:${size}px;--c:${esc(team.color || '#888')};font-size:${Math.round(size * .34)}px">${esc(team.tag)}</span>`;
  const mapTitle = r => (r.map ? `MAP ${r.map} · ${esc(r.name)}` : 'THE SERIES');
  /** The sponsor bought for this graphic's space (Air's sponsor spaces), if any. */
  const sponsor = (s, space) => {
    const x = s.airSpaces && s.airSpaces[space];
    if (!x || !x.name) return '';
    return `<span class="pg-spons">PRESENTED BY ${assetOk(x.logo) ? `<img src="${esc(x.logo)}" alt="${esc(x.name)}">` : `<b>${esc(x.name)}</b>`}</span>`;
  };
  const foot = (s, space) => `<div class="pg-foot"><span>${esc([s.event.stage, s.event.name].filter(Boolean).join(' · ').toUpperCase())}</span>${sponsor(s, space)}</div>`;
  const empty = what => `<div class="pg-empty"><b>${what}</b><span>Shows once a map has ended (or is closed in Air).</span></div>`;
  const all = r => r.players.flatMap((ps, t) => ps.map((p, i) => ({ ...p, t, i })));
  const topFrag = r => all(r).sort((a, b) => b.k - a.k || a.d - b.d)[0] || null;
  /** Previews and sample rooms have no map record: a sample one from the room's own players, so the graphic shows. */
  const sampleRecord = s => {
    const [a, b] = s.teams.map(t => Number(t.score) || 0), ts = s.teamStats || [{}, {}];
    const team = t => ({ name: s.teams[t].name, tag: s.teams[t].tag, color: s.teams[t].color, logo: s.teams[t].logo });
    const perf = t => ({ firstKills: Number(ts[t] && ts[t].firstKills) || 0, multi: [3, 2][t], aces: [1, 0][t], clutches: Number(ts[t] && ts[t].clutches) || 0, plants: Number(ts[t] && ts[t].plants) || 0, defuses: Number(ts[t] && ts[t].defuses) || 0, attack: [[7, 12], [5, 12]][t], defence: [[6, 12], [4, 12]][t], pistols: [[2, 2], [0, 2]][t] });
    return { map: s.map.number || 1, name: s.map.name || 'LOTUS', score: [a, b], winner: a === b ? -1 : a > b ? 0 : 1, teams: [team(0), team(1)],
      players: s.players.map(ps => ps.slice(0, 5).map(p => ({ name: p.name, agent: p.agent, gameId: '', k: p.k, d: p.d, a: p.a, fk: p.fk || 0, fd: 1, multi: 1, aces: 0, hsPct: Number(p.hs) || null, adr: Number(p.adr) || null }))),
      perf: [perf(0), perf(1)], how: 'game', closedAt: 0, partial: false };
  };
  const sampleRoom = () => HUD.preview || !HUD.match || /^__ESA_SIM/.test(String(HUD.match));

  /** A full-screen post-game graphic: map art behind, redrawn only when its data changes. */
  function scene(root, cls, render, keyOf) {
    const m = E('div', 'mod on pg ' + cls, root), bg = E('div', 'pg-bg', m), box = E('div', 'pg-box', m);
    let sig = '';
    return { update(s) {
      m.style.setProperty('--ev', accent(s));
      const r = s.airRecord && Array.isArray(s.airRecord.players) ? s.airRecord : sampleRoom() ? sampleRecord(s) : null;
      const k = JSON.stringify([r, keyOf ? keyOf(s) : null, s.event.name, s.event.stage, s.airSpaces]);
      s = { ...s, airRecord: r };
      if (k === sig) return;
      const first = !sig; sig = k;
      const Mm = r && r.map ? HUD.mapA(r.name) : null;
      bg.style.backgroundImage = Mm && Mm.splash ? `url('${Mm.splash}')` : '';
      const html = render(s, r);
      if (first) { box.innerHTML = html; box.classList.remove('pg-in'); void box.offsetWidth; box.classList.add('pg-in'); }
      else HUD.morph(box, html);
    }, play() { sig = ''; } };
  }

  const head = (r, mid) => `<div class="pg-head">${[0, 1].map(t => `<div class="pg-team ${t ? 'r' : ''}">${mark(r.teams[t], 96)}<div><b>${esc(r.teams[t].name)}</b>${r.winner === t ? '<span class="res w">WIN</span>' : r.winner === 1 - t ? '<span class="res l">LOSS</span>' : ''}</div></div>`).join(`<div class="pg-mid">${mid}</div>`)}</div>`;

  // Breakdown · Scoreboard: agents, K / D / A and first kills; ADR only when the record has it.
  M.breakdown = root => scene(root, 'pg-board', (s, r) => {
    if (!r) return empty('BREAKDOWN');
    const adr = all(r).some(p => p.adr !== null);
    const best = topFrag(r);
    const table = t => `<div class="pg-tab" style="--c:${esc(r.teams[t].color)}"><div class="th"><span></span><span>PLAYER</span><span>K</span><span>D</span><span>A</span><span>FK</span>${adr ? '<span>ADR</span>' : ''}</div>${r.players[t].map((p, i) => {
      const A = HUD.agent(p.agent), top = best && best.t === t && best.i === i;
      return `<div class="tr ${top ? 'mvp' : ''}"><span class="ag">${A && A.icon ? `<img src="${A.icon}" alt="">` : ''}</span><span class="nm">${esc(p.name)}<small>${esc(A ? A.name : p.agent)}${top ? ' · TOP FRAG' : ''}</small></span><span>${p.k}</span><span>${p.d}</span><span>${p.a}</span><span>${p.fk}</span>${adr ? `<span>${num(p.adr)}</span>` : ''}</div>`;
    }).join('')}</div>`;
    return head(r, `<b>${r.score[0]} – ${r.score[1]}</b><span>${mapTitle(r)} · BREAKDOWN</span>`) + `<div class="pg-tables" style="--cols:${adr ? 7 : 6}">${table(0)}${table(1)}</div>` + foot(s, 'breakdown');
  });

  // Team performance: first kills, multi-kills, clutches, aces, rounds on attack and defence, pistols, plants and defuses.
  M.performance = root => scene(root, 'pg-perf', (s, r) => {
    if (!r) return empty('TEAM PERFORMANCE');
    const [a, b] = r.perf, frac = x => `${x[0]}/${x[1]}`;
    const rows = [['FIRST KILLS', a.firstKills, b.firstKills], ['MULTI-KILLS', a.multi, b.multi], ['CLUTCHES', a.clutches, b.clutches], ['ACES', a.aces, b.aces],
      ['ATTACK ROUNDS', frac(a.attack), frac(b.attack)], ['DEFENCE ROUNDS', frac(a.defence), frac(b.defence)], ['PISTOL ROUNDS', frac(a.pistols), frac(b.pistols)], ['PLANTS · DEFUSES', `${a.plants} · ${a.defuses}`, `${b.plants} · ${b.defuses}`]];
    const better = (x, y) => { const v = String(x).split('/')[0], w = String(y).split('/')[0]; return +v > +w; };
    return head(r, `<b class="t">TEAM PERFORMANCE</b><span>${mapTitle(r)} · ${r.score[0]} – ${r.score[1]}</span>`) +
      `<div class="pg-rows">${rows.map(([l, x, y]) => `<div class="r"><span class="a ${better(x, y) ? 'hi' : ''}" style="--c:${esc(r.teams[0].color)}">${num(x)}</span><span class="l">${l}</span><span class="b ${better(y, x) ? 'hi' : ''}" style="--c:${esc(r.teams[1].color)}">${num(y)}</span></div>`).join('')}</div>` + foot(s, 'breakdown');
  });

  // Victory: the winner of the map (or of the series) with the score.
  const victory = series => root => scene(root, 'pg-victory', (s, r) => {
    const wins = s.teams.map(t => Number(t.series) || 0), need = Math.ceil((s.event.bestOf || 1) / 2);
    const w = series ? (wins[0] >= need ? 0 : wins[1] >= need ? 1 : wins[0] === wins[1] ? -1 : wins[0] > wins[1] ? 0 : 1) : r ? r.winner : -1;
    if (w !== 0 && w !== 1) return empty(series ? 'SERIES VICTORY' : 'MAP VICTORY');
    const T = series ? s.teams[w] : r.teams[w];
    const line = series ? `SERIES ${wins[0]} – ${wins[1]}` : `${r.score[0]} – ${r.score[1]} · SERIES ${wins[0]} – ${wins[1]}`;
    return `<div class="pg-wash" style="--c:${esc(T.color)}"></div><div class="pg-win">${mark(T, 220)}<div class="k">${series ? 'THE SERIES' : mapTitle(r)}</div><div class="t">${esc(T.name)} win${series && wins[w] >= need ? ' the series' : ''}</div><div class="s">${line}</div></div><div class="pg-foot end">${sponsor(s, 'victory')}</div>`;
  }, s => [s.teams.map(t => t.series), s.event.bestOf]);
  M.victoryMap = victory(false);
  M.victorySeries = victory(true);

  /** A player picked in Air ([team, slot]), or the record's top fragger. */
  const chosen = (r, pick, fallback) => (Array.isArray(pick) && r.players[pick[0]] && r.players[pick[0]][pick[1]] ? { ...r.players[pick[0]][pick[1]], t: pick[0], i: pick[1] } : fallback);
  const card = (r, p, right) => { const A = HUD.agent(p.agent); return `<div class="pg-p ${right ? 'r' : ''}" style="--c:${esc(r.teams[p.t].color)}">${A && A.full ? `<img src="${A.full}" alt="">` : ''}<div class="nm">${esc(p.name)}<small>${esc(r.teams[p.t].name)} · ${esc(A ? A.name : p.agent)}</small></div></div>`; };
  const STATS = { k: ['KILLS', p => p.k], d: ['DEATHS', p => p.d], a: ['ASSISTS', p => p.a], fk: ['FIRST KILLS', p => p.fk], fd: ['FIRST DEATHS', p => p.fd], kd: ['K / D', p => kd(p)], multi: ['MULTI-KILLS', p => p.multi], hs: ['HS%', p => (p.hsPct === null ? null : p.hsPct + '%')], adr: ['ADR', p => p.adr] };
  const statList = s => (Array.isArray(s.airPostStats) && s.airPostStats.length ? s.airPostStats : ['k', 'd', 'a', 'fk', 'kd']).filter(k => STATS[k]).slice(0, 6);

  // Post-game player: one player and the stats ticked in Air.
  M.pgplayer = root => scene(root, 'pg-player', (s, r) => {
    if (!r) return empty('POST-GAME PLAYER');
    const top = topFrag(r), p = chosen(r, s.airPostPlayer, top);
    if (!p) return empty('POST-GAME PLAYER');
    return `<div class="pg-head"><div></div><div class="pg-mid"><b class="t">${p === top ? 'TOP FRAGGER' : 'PLAYER'}</b><span>${mapTitle(r)}</span></div><div></div></div><div class="pg-one">${card(r, p)}<div class="pg-stats">${statList(s).map(k => `<div><b>${num(STATS[k][1](p))}</b><span>${STATS[k][0]}</span></div>`).join('')}</div></div>` + foot(s, 'breakdown');
  }, s => [s.airPostPlayer, s.airPostStats]);

  // Post-game matchup: any two players and the stats ticked in Air; the better number is marked.
  M.matchup = root => scene(root, 'pg-matchup', (s, r) => {
    if (!r) return empty('MATCHUP');
    const tops = [0, 1].map(t => r.players[t].map((p, i) => ({ ...p, t, i })).sort((x, y) => y.k - x.k)[0]);
    const pick = Array.isArray(s.airMatchup) ? s.airMatchup : [];
    const a = chosen(r, pick[0], tops[0]), b = chosen(r, pick[1], tops[1]);
    if (!a || !b) return empty('MATCHUP');
    const lower = { d: 1, fd: 1 };
    const rows = statList(s).map(k => { const x = STATS[k][1](a), y = STATS[k][1](b), nx = parseFloat(x), ny = parseFloat(y);
      const ha = Number.isFinite(nx) && Number.isFinite(ny) && nx !== ny && (lower[k] ? nx < ny : nx > ny), hb = Number.isFinite(nx) && Number.isFinite(ny) && nx !== ny && !ha;
      return `<div><b class="${ha ? 'hi' : ''}">${num(x)}</b><span>${STATS[k][0]}</span><b class="${hb ? 'hi' : ''}">${num(y)}</b></div>`; }).join('');
    return `<div class="pg-head"><div></div><div class="pg-mid"><b class="t">MATCHUP</b><span>${mapTitle(r)}</span></div><div></div></div><div class="pg-mu">${card(r, a)}<div class="pg-vs">${rows}</div>${card(r, b, true)}</div>` + foot(s, 'breakdown');
  }, s => [s.airMatchup, s.airPostStats]);
})();
