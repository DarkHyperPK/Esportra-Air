/* Over-the-game graphics (approved mock, 13 Nov): translucent panels that sit over the game feed, the desk
   or a stage camera instead of covering the screen. Each is a module like the ones in hud.js and is
   shown by the full-screen host when state.airFullscreenStyle is 'band', or by its own page
   (overlays/<name>-band.html). Load after hud.js; the HUD starts its modules once the page has loaded. */
(function () {
  const HUD = window.HUD, M = HUD.modules, E = HUD.el;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const assetOk = v => typeof v === 'string' && /^(\/air-assets\/[0-9a-f-]{36}|https:\/\/[^\s"'<>]+|\.\.\/[^\s"'<>]+)$/i.test(v);
  const accent = s => (/^#[0-9a-f]{6}$/i.test(s.event && s.event.accent || '') ? s.event.accent : '#8b7cf6');
  const need = s => Math.ceil((s.event.bestOf || 1) / 2);
  const splash = name => { const m = HUD.mapA(name); return m && m.splash ? m.splash : ''; };
  const portrait = name => { const a = HUD.agent(name); return a && a.full ? a.full : ''; };
  const initials = name => String(name || '').split(/\s+/).filter(w => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '·';

  /** A team's logo, or its tag on its colour. */
  const mark = (team, size) => assetOk(team.logo)
    ? `<img class="bd-mark" src="${esc(team.logo)}" alt="" style="width:${size}px;height:${size}px">`
    : `<span class="bd-mark tile" style="width:${size}px;height:${size}px;--c:${esc(team.color || '#888')};font-size:${Math.round(size * .36)}px">${esc(team.tag || initials(team.name))}</span>`;
  /** The event's logo, or its initials on the event colour. */
  const eventMark = (s, size) => assetOk(s.event.logo)
    ? `<img class="bd-mark" src="${esc(s.event.logo)}" alt="" style="width:${size}px;height:${size}px">`
    : `<span class="bd-mark acc" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .34)}px">${esc(initials(s.event.name))}</span>`;
  const mapTile = (name, cls, inner) => `<div class="bd-map ${cls || ''}" style="${splash(name) ? `--img:url('${esc(splash(name))}')` : ''}"><span class="mn">${esc(name)}</span>${inner || ''}</div>`;

  /** A panel that rebuilds only when its data changes, so entrances do not replay on every tick. */
  function band(root, cls, render, keyOf) {
    const m = E('div', 'mod on bd-layer', root), panel = E('div', 'bd ' + cls, m);
    let sig = '';
    return { update(s) {
      m.style.setProperty('--ev', accent(s));
      const k = JSON.stringify(keyOf(s));
      if (k === sig) return;
      // The band enters once when it comes on air; later changes (a pick, a lock-in) update in place.
      const first = !sig;
      sig = k;
      if (first) { panel.innerHTML = render(s); panel.classList.remove('bd-show'); void panel.offsetWidth; panel.classList.add('bd-show'); }
      else HUD.morph(panel, render(s));
    }, play() { sig = ''; } };
  }

  // 1 · Map veto: every ban, pick (with the side the other team chose) and the decider.
  M.vetoBand = root => band(root, 'bd-veto', s => {
    const T = s.teams;
    const tiles = s.veto.map(v => {
      const team = v.team >= 0 ? T[v.team] : null, other = v.team >= 0 ? T[1 - v.team] : null;
      const top = v.action === 'pick' && v.side ? `<span class="bd-cap top">${esc(other.tag)} PICKS ${esc(v.side)}</span>` : v.action === 'decider' && v.side ? `<span class="bd-cap top">${esc(v.side)} FIRST</span>` : '';
      const label = v.action === 'decider' ? '<b class="acc">DECIDER</b><span>MAP</span>' : `<b>${esc(team ? team.tag : '')}</b><span>${v.action === 'ban' ? 'BAN' : 'PICK'} MAP</span>`;
      return `<div class="bd-vcol">${mapTile(v.map, v.action === 'ban' ? 'ban' : v.action === 'pick' ? 'pick' : 'dec', top)}<div class="bd-vlab ${v.action === 'decider' ? 'dec' : ''}" style="${team && v.action === 'pick' ? `--c:${esc(team.color)}` : ''}">${label}</div></div>`;
    }).join('');
    return `<div class="bd-head"><span class="bd-title">MAP VETO</span><span class="bd-cap">${esc([s.event.name, s.event.stage, `BO${s.event.bestOf}`].filter(Boolean).join(' · '))}</span><span class="bd-row">${mark(T[0], 40)}<span class="bd-vs">VS</span>${mark(T[1], 40)}</span></div><div class="bd-vgrid" style="--n:${Math.max(1, s.veto.length)}">${tiles}</div>`;
  }, s => [s.veto, s.teams.map(t => [t.tag, t.color, t.logo]), s.event]);

  // 2 · Agent select: both lineups with their agents, the map in the middle.
  const agentCard = (p, color) => {
    const url = portrait(p.agent), a = HUD.agent(p.agent);
    return `<div class="bd-ag ${p.agent ? '' : 'picking'}" style="--c:${esc(color)};${url ? `--p:url('${esc(url)}')` : ''}"><div class="who"><b>${esc(p.name)}</b><span>${esc(a ? a.name : 'Picking…')}</span></div><i class="ul"></i></div>`;
  };
  M.lineupsBand = root => band(root, 'bd-lineups', s => {
    const T = s.teams, played = s.series.filter(x => x.winner === 0 || x.winner === 1);
    const side = i => T[i].side ? `<span class="bd-side ${T[i].side === 'ATK' ? 'atk' : 'def'}">${esc(T[i].side)}</span>` : '';
    return `<div class="bd-head"><span class="bd-row">${mark(T[0], 44)}<span class="bd-team">${esc(T[0].name)}</span>${side(0)}</span><span class="bd-title acc">AGENT SELECT · MAP ${esc(s.map.number || 1)}</span><span class="bd-row">${side(1)}<span class="bd-team">${esc(T[1].name)}</span>${mark(T[1], 44)}</span></div>
      <div class="bd-lgrid">${s.players[0].slice(0, 5).map(p => agentCard(p, T[0].color)).join('')}
        <div class="bd-lmid">${mapTile(s.map.name, 'mid')}<div class="bd-lser"><span class="bd-cap">SERIES</span><b>${T[0].series || 0} – ${T[1].series || 0}</b><span class="bd-cap small">${esc(played.map(x => `${x.map} ${x.score[0]}–${x.score[1]}`).join(' · '))}</span></div></div>
        ${s.players[1].slice(0, 5).map(p => agentCard(p, T[1].color)).join('')}</div>`;
  }, s => [s.players.map(t => t.map(p => [p.name, p.agent])), s.teams.map(t => [t.name, t.tag, t.color, t.logo, t.side, t.series]), s.map, s.series]);

  // 3 · Match intro: both teams and the format, then each lineup in turn.
  M.introBand = root => {
    const b = band(root, 'bd-intro', s => {
      const T = s.teams, sub = [s.event.stage, `BEST OF ${s.event.bestOf}`].filter(Boolean).join(' · ');
      const lineup = i => `<div class="bd-lineup" data-team="${i}"><span class="bd-lt">${mark(T[i], 34)}<b>${esc(T[i].name)}</b><span class="bd-cap small">TEAM LINEUP</span></span>${s.players[i].slice(0, 5).map(p => {
        const url = HUD.photoOk && HUD.photoOk(p.photo) ? p.photo : portrait(p.agent);
        return `<span class="bd-lp"><span class="bd-face" style="--c:${esc(T[i].color)};${url ? `--p:url('${esc(url)}')` : ''}"></span><b>${esc(p.name)}</b></span>`; }).join('')}</div>`;
      return `<div class="bd-main">${eventMark(s, 96)}<span class="bd-row end"><span class="bd-tname"><b>${esc(T[0].name)}</b><span class="bd-cap">${esc(T[0].tag)}</span></span>${mark(T[0], 84)}</span><span class="bd-mid"><span class="bd-vs big">VS</span><span class="bd-cap acc">${esc(sub)}</span></span><span class="bd-row">${mark(T[1], 84)}<span class="bd-tname"><b>${esc(T[1].name)}</b><span class="bd-cap">${esc(T[1].tag)}</span></span></span></div>${lineup(0)}${lineup(1)}`;
    }, s => [s.teams.map(t => [t.name, t.tag, t.color, t.logo]), s.players.map(t => t.map(p => [p.name, p.agent, p.photo])), s.event]);
    // The lineup row shows team A, then team B, every 6 seconds.
    let shown = 0, timer = null;
    return { update(s) { b.update(s); if (!timer) timer = setInterval(() => { shown = 1 - shown; document.querySelectorAll('.bd-lineup').forEach(el => el.classList.toggle('on', +el.dataset.team === shown)); }, 6000);
      document.querySelectorAll('.bd-lineup').forEach(el => el.classList.toggle('on', +el.dataset.team === shown)); } };
  };

  // 4 · Map result: "FNC TAKE LOTUS 13–10" with the series score.
  const lastResult = s => { const done = s.series.filter(x => x.winner === 0 || x.winner === 1); return done[done.length - 1] || null; };
  M.resultBand = root => band(root, 'bd-result', s => {
    const T = s.teams, r = lastResult(s);
    const line = r ? `${T[r.winner].tag} TAKE ${r.map} ${r.score[r.winner]}–${r.score[1 - r.winner]}` : `${s.map.name} ${T[0].score}–${T[1].score}`;
    const idx = r ? s.series.indexOf(r) + 1 : s.map.number, next = s.series[idx] || null;
    return `<span class="bd-title acc center">${esc([s.event.name, s.event.stage].filter(Boolean).join(' · '))}</span>
      <div class="bd-rrow">${eventMark(s, 100)}<div class="bd-box">${mark(T[0], 56)}<b class="bd-big acc">${T[0].series || 0}–${T[1].series || 0}</b>${mark(T[1], 56)}</div><div class="bd-box wide"><b class="bd-line">${esc(line)}</b></div></div>
      <span class="bd-cap center">${esc(`MAP ${idx} OF ${s.event.bestOf}${next ? ` · NEXT: ${next.map}` : ''}`)}</span>`;
  }, s => [s.series, s.teams.map(t => [t.tag, t.color, t.logo, t.series, t.score]), s.event, s.map]);

  // 5 · Series: every map with who picked it, the score and the winner.
  M.seriesBand = root => band(root, 'bd-series', s => {
    const T = s.teams, cur = (s.map.number || 1) - 1;
    const tiles = s.series.map((x, i) => {
      const done = x.winner === 0 || x.winner === 1, label = `MAP ${i + 1} · ${x.pick === -1 ? 'DECIDER' : esc(T[x.pick] ? T[x.pick].tag + ' PICK' : '')}${i === cur && !done ? ' · NOW' : ''}`;
      const score = done ? `${x.score[0]}–${x.score[1]} <span class="bd-cap" style="color:${esc(T[x.winner].color)}">${esc(T[x.winner].tag)}</span>` : i === cur ? `${T[0].score}–${T[1].score}` : '';
      return mapTile(x.map, i === cur && !done ? 'now' : '', `<span class="bd-cap top left">${label}</span><span class="bd-score">${score}</span>`);
    }).join('');
    return `<div class="bd-head"><span class="bd-title acc">SERIES · BO${esc(s.event.bestOf)}</span><span class="bd-row">${mark(T[0], 36)}<b class="bd-mid-score">${T[0].series || 0} – ${T[1].series || 0}</b>${mark(T[1], 36)}</span></div><div class="bd-sgrid" style="--n:${Math.max(1, s.series.length)}">${tiles}</div>`;
  }, s => [s.series, s.teams.map(t => [t.tag, t.color, t.logo, t.series, t.score]), s.map, s.event.bestOf]);

  // 6 · Halftime: a box at the bottom left with the map and the score.
  const scoreBox = (s, title) => `<span class="bd-title acc center">${esc(title)}</span><div class="bd-rrow tight">${eventMark(s, 84)}<div class="bd-box"><span class="bd-cap">${esc(s.teams[0].tag)}</span>${mark(s.teams[0], 52)}<b class="bd-big acc">${s.teams[0].score}–${s.teams[1].score}</b>${mark(s.teams[1], 52)}<span class="bd-cap">${esc(s.teams[1].tag)}</span></div></div>`;
  M.halftimeBox = root => band(root, 'bd-box-l', s => scoreBox(s, `HALFTIME · MAP ${s.map.number || 1} · ${s.map.name}`), s => [s.teams.map(t => [t.tag, t.color, t.logo, t.score]), s.map, s.event]);

  // 7 · Standings: up to eight teams in a band; the two playing now are lit.
  M.standingsBand = root => band(root, 'bd-standings', s => {
    const playing = s.teams.map(t => String(t.name).toUpperCase());
    const cells = s.standings.slice(0, 8).map((row, i) => {
      const [name, rec] = row, at = playing.indexOf(String(name).toUpperCase()), team = at >= 0 ? s.teams[at] : { name, tag: initials(name), color: '#5b6170', logo: '' };
      return `<div class="bd-st ${at >= 0 ? 'lit' : ''}" style="--c:${esc(team.color)}"><span class="bd-cap">${i + 1}</span>${mark(team, 42)}<span class="bd-cap small">${esc(name)}</span><b>${esc(rec)}</b></div>`;
    }).join('');
    return `<div class="bd-head"><span class="bd-title acc">STANDINGS${s.event.stage ? ' · ' + esc(s.event.stage) : ''}</span><span class="bd-cap">W – L</span></div><div class="bd-stgrid">${cells}</div>`;
  }, s => [s.standings, s.teams.map(t => [t.name, t.color, t.logo]), s.event.stage]);

  // 8 · Player profile: a lower third with the photo (or agent portrait) and five season numbers.
  M.profileBand = root => band(root, 'bd-profile', s => {
    const sp = s.spotlight || {}, T = s.teams[sp.team] || s.teams[0], p = (s.players[sp.team] || [])[sp.player] || {}, z = sp.season || {};
    const url = HUD.photoOk && HUD.photoOk(p.photo) ? p.photo : portrait(p.agent), a = HUD.agent(p.agent);
    const stat = (k, v) => `<span><span class="bd-cap small">${k}</span><b>${esc(v == null ? '—' : v)}</b></span>`;
    return `<div class="bd-pphoto" style="--c:${esc(T.color)};${url ? `--p:url('${esc(url)}')` : ''}"></div><div class="bd-pbody"><span class="bd-row">${mark(T, 30)}<span class="bd-cap acc">${esc(T.name)}${a ? ' · ' + esc(a.role || a.name) : ''}</span></span><b class="bd-pname">${esc(p.name)}</b><div class="bd-pstats">${stat('RATING', z.rating)}${stat('ACS', z.acs)}${stat('KPR', z.kpr)}${stat('HS%', z.hs)}${stat('CLUTCHES', z.clutches)}</div></div>`;
  }, s => [s.spotlight, s.teams.map(t => [t.name, t.color, t.logo]), s.players.map(t => t.map(p => [p.name, p.agent, p.photo]))]);

  // 10 · Today's schedule: the event's matches today, with the score once played.
  M.scheduleBand = root => band(root, 'bd-schedule', s => {
    const team = tag => s.teams.find(t => t.tag === tag) || { tag, name: tag, color: '#5b6170', logo: '' };
    const slots = s.schedule.filter(x => x.a && x.b).slice(0, 3).map(x => `<div class="bd-box">${x.done && x.score ? '' : `<span class="bd-cap">${esc(x.time)}</span>`}${mark(team(x.a), 50)}${x.score ? `<b class="bd-big acc small">${esc(x.score)}</b>` : '<span class="bd-vs">VS</span>'}${mark(team(x.b), 50)}<span class="bd-cap">${esc(x.label || '')}</span></div>`).join('');
    return `<span class="bd-title acc center">TODAY'S SCHEDULE</span><div class="bd-rrow">${eventMark(s, 100)}${slots}</div><span class="bd-cap center">${esc([s.event.name, s.event.stage].filter(Boolean).join(' · '))}</span>`;
  }, s => [s.schedule, s.teams.map(t => [t.tag, t.color, t.logo]), s.event]);

  // 11 · Break frame: countdown and event on top, two see-through windows, the score and what is next.
  M.breakFrame = root => {
    const m = E('div', 'mod on bd-layer', root), f = E('div', 'bd-frame', m);
    f.innerHTML = `<svg class="bd-fbg" viewBox="0 0 1920 1080" aria-hidden="true"><defs><radialGradient id="bdGlow" cx=".85" cy="-.1" r=".55"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs><path fill-rule="evenodd" fill="#0d1015" d="M0 0H1920V1080H0Z M96 300H946V780H96Z M974 300H1824V780H974Z"/><path fill-rule="evenodd" fill="url(#bdGlow)" d="M0 0H1920V1080H0Z M96 300H946V780H96Z M974 300H1824V780H974Z"/></svg><div class="bd-fwin a"></div><div class="bd-fwin b"></div><div class="bd-ftop"><b class="bd-clock"></b><span class="bd-title"></span></div><span class="bd-fmark"></span><div class="bd-fbot"></div><span class="bd-cap bd-fnext"></span>`;
    const clock = f.querySelector('.bd-clock'), title = f.querySelector('.bd-ftop .bd-title'), fmark = f.querySelector('.bd-fmark'), bot = f.querySelector('.bd-fbot'), next = f.querySelector('.bd-fnext');
    let sig = '';
    return { update(s) {
      m.style.setProperty('--ev', accent(s));
      const k = JSON.stringify([s.event, s.teams.map(t => [t.name, t.tag, t.color, t.logo, t.series]), s.schedule]);
      if (k === sig) return; sig = k;
      title.textContent = [s.event.name, s.event.stage].filter(Boolean).join(' · ');
      fmark.innerHTML = eventMark(s, 110);
      const T = s.teams;
      bot.innerHTML = `<span class="bd-row end"><span class="bd-tname r"><b>${esc(T[0].name)}</b><span class="bd-cap">${esc(T[0].tag)}</span></span>${mark(T[0], 64)}</span><b class="bd-big acc">${T[0].series || 0}</b><span class="bd-vs">VS</span><b class="bd-big acc">${T[1].series || 0}</b><span class="bd-row">${mark(T[1], 64)}<span class="bd-tname"><b>${esc(T[1].name)}</b><span class="bd-cap">${esc(T[1].tag)}</span></span></span>`;
      const n = s.schedule.find(x => !x.done && x.a && x.b && !(x.a === T[0].tag && x.b === T[1].tag));
      next.textContent = n ? `NEXT: ${n.a} VS ${n.b} · ${n.time}` : '';
    }, tick(s) { const h = s.holding || {}; const left = h.target ? (h.target - HUD.now()) / 1000 : (h.minutes || 0) * 60; clock.textContent = HUD.fmt(left); } };
  };

  // The full-screen host's over-the-game versions, by screen id.
  HUD.BANDS = { 'match-intro': 'introBand', 'map-veto': 'vetoBand', 'agent-select': 'lineupsBand', 'map-result': 'resultBand', series: 'seriesBand', halftime: 'halftimeBox', standings: 'standingsBand', 'player-profile': 'profileBand', schedule: 'scheduleBand', holding: 'breakFrame' };
})();
