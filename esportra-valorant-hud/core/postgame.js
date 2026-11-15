/* Post-game player and Post-game matchup. They read the map record Air kept when a map ended
   (state.airRecord: one map, or the whole series added up), so map 1 can be shown while map 2 is live.
   Only what the game's data has: ACS is never shown; ADR and HS% only when the record has them.
   Load after hud.js; each is a module like the ones in hud.js, shown by the full-screen host or its own page.
   They use the same backdrop and frame as the other full-screen scenes (HUD.sceneBg, HUD.chrome). The map's
   result, breakdown and the champion are hud.js's own Map result, Map breakdown and Champion. */
(function () {
  const HUD = window.HUD, M = HUD.modules, E = HUD.el;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const assetOk = v => typeof v === 'string' && /^(\/air-assets\/[0-9a-f-]{36}|\/art\/[^\s"'<>]+|https:\/\/[^\s"'<>]+|\.\.\/[^\s"'<>]+)$/i.test(v);
  const accent = s => (/^#[0-9a-f]{6}$/i.test(s.event && s.event.accent || '') ? s.event.accent : '#8b7cf6');
  const num = v => (v === null || v === undefined || v === '' ? '—' : esc(v));
  const kd = p => (p.d ? (p.k / p.d).toFixed(2) : p.k ? p.k.toFixed(2) : '—');
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

  /** A full-screen post-game scene: the house backdrop and frame with the map's art, redrawn only when its data changes. */
  function scene(root, cls, label, render, keyOf) {
    const m = E('div', 'mod on pg ' + cls, root), sc = HUD.sceneBg(m), bg = E('img', 'pg-map', sc);
    HUD.chrome(m, label); HUD.sceneFx(sc);
    const box = E('div', 'pg-box', m);
    let sig = '';
    return { update(s) {
      m.style.setProperty('--ev', accent(s));
      const r = s.airRecord && Array.isArray(s.airRecord.players) ? s.airRecord : sampleRoom() ? sampleRecord(s) : null;
      const k = JSON.stringify([r, keyOf ? keyOf(s) : null, s.event.name, s.event.stage, s.airSpaces]);
      s = { ...s, airRecord: r };
      if (k === sig) return;
      const first = !sig; sig = k;
      const Mm = r && r.map ? HUD.mapA(r.name) : null;
      if (Mm && Mm.splash) { if (bg.getAttribute('src') !== Mm.splash) bg.src = Mm.splash; bg.style.display = ''; } else bg.style.display = 'none';
      const html = render(s, r);
      if (first) { box.innerHTML = html; box.classList.remove('pg-in'); void box.offsetWidth; box.classList.add('pg-in'); }
      else HUD.morph(box, html);
    }, play() { sig = ''; } };
  }

  /** A player picked in Air ([team, slot]), or the record's top fragger. */
  const chosen = (r, pick, fallback) => (Array.isArray(pick) && r.players[pick[0]] && r.players[pick[0]][pick[1]] ? { ...r.players[pick[0]][pick[1]], t: pick[0], i: pick[1] } : fallback);
  const card = (r, p, right) => { const A = HUD.agent(p.agent); return `<div class="pg-p ${right ? 'r' : ''}" style="--c:${esc(r.teams[p.t].color)}">${A && A.full ? `<img src="${A.full}" alt="">` : ''}<div class="nm">${esc(p.name)}<small>${esc(r.teams[p.t].name)} · ${esc(A ? A.name : p.agent)}</small></div></div>`; };
  const STATS = { k: ['KILLS', p => p.k], d: ['DEATHS', p => p.d], a: ['ASSISTS', p => p.a], fk: ['FIRST KILLS', p => p.fk], fd: ['FIRST DEATHS', p => p.fd], kd: ['K / D', p => kd(p)], multi: ['MULTI-KILLS', p => p.multi], hs: ['HS%', p => (p.hsPct === null ? null : p.hsPct + '%')], adr: ['ADR', p => p.adr] };
  const statList = s => (Array.isArray(s.airPostStats) && s.airPostStats.length ? s.airPostStats : ['k', 'd', 'a', 'fk', 'kd']).filter(k => STATS[k]).slice(0, 6);

  // Post-game player: one player and the stats ticked in Air.
  M.pgplayer = root => scene(root, 'pg-player', 'PLAYER OF THE MAP', (s, r) => {
    if (!r) return empty('POST-GAME PLAYER');
    const top = topFrag(r), p = chosen(r, s.airPostPlayer, top);
    if (!p) return empty('POST-GAME PLAYER');
    return `<div class="pg-head"><div></div><div class="pg-mid"><b class="t disp hl">${p === top ? 'TOP FRAGGER' : 'PLAYER'}</b><span>${mapTitle(r)}</span></div><div></div></div><div class="pg-one">${card(r, p)}<div class="pg-stats">${statList(s).map(k => `<div><b>${num(STATS[k][1](p))}</b><span>${STATS[k][0]}</span></div>`).join('')}</div></div>` + foot(s, 'breakdown');
  }, s => [s.airPostPlayer, s.airPostStats]);

  // Post-game matchup: any two players and the stats ticked in Air; the better number is marked.
  M.matchup = root => scene(root, 'pg-matchup', 'MATCHUP', (s, r) => {
    if (!r) return empty('MATCHUP');
    const tops = [0, 1].map(t => r.players[t].map((p, i) => ({ ...p, t, i })).sort((x, y) => y.k - x.k)[0]);
    const pick = Array.isArray(s.airMatchup) ? s.airMatchup : [];
    const a = chosen(r, pick[0], tops[0]), b = chosen(r, pick[1], tops[1]);
    if (!a || !b) return empty('MATCHUP');
    const lower = { d: 1, fd: 1 };
    const rows = statList(s).map(k => { const x = STATS[k][1](a), y = STATS[k][1](b), nx = parseFloat(x), ny = parseFloat(y);
      const ha = Number.isFinite(nx) && Number.isFinite(ny) && nx !== ny && (lower[k] ? nx < ny : nx > ny), hb = Number.isFinite(nx) && Number.isFinite(ny) && nx !== ny && !ha;
      return `<div><b class="${ha ? 'hi' : ''}">${num(x)}</b><span>${STATS[k][0]}</span><b class="${hb ? 'hi' : ''}">${num(y)}</b></div>`; }).join('');
    return `<div class="pg-head"><div></div><div class="pg-mid"><b class="t disp hl">MATCHUP</b><span>${mapTitle(r)}</span></div><div></div></div><div class="pg-mu">${card(r, a)}<div class="pg-vs">${rows}</div>${card(r, b, true)}</div>` + foot(s, 'breakdown');
  }, s => [s.airMatchup, s.airPostStats]);
})();
