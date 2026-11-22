/* Battle royale graphics (22 Nov; approved mock 2): the in-game HUD in three layouts (rail, grid, strip) and the
   between-match full screens. They read the lobby (`state.br`, from Air), the observer's live data
   (`state.brLive`, from the observer feed) and the game pack's pictures (`state.airPack`). They never draw what
   the observer client already shows (killfeed, compass, minimap and zone, observed player and team, name tags):
   the HUD stays in the space the client leaves free. Pictures from the official kit sit in picture slots, so
   Graphics studio can swap any of them; without a pack a slot stays empty (nothing is drawn to look official).
   Load after hud.js; modules start once the page has loaded. */
(function () {
  const HUD = window.HUD, M = HUD.modules, E = HUD.el;
  const Q = new URLSearchParams(location.search);
  const PREVIEW = Q.get('preview') === '1';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const PIC = /^\/(packs\/[a-z0-9]{2,16}\/[0-9a-f]{64}\.(png|jpg|webp)|air-assets\/[0-9a-f-]{36})$/;
  const pic = v => (typeof v === 'string' && PIC.test(v) ? v : '');
  const logoOk = v => typeof v === 'string' && /^(\/air-assets\/[0-9a-f-]{36}|https:\/\/[^\s"'<>]+)$/i.test(v);

  /** The lobby, its live match and the pack: the room's, or the made-up sample on preview pages. */
  function data(s) {
    const S = window.BR_SAMPLE || {};
    const real = s.br && Array.isArray(s.br.teams) && s.br.teams.length;
    const br = real ? s.br : PREVIEW ? S.br : null;
    const live = s.brLive && s.brLive.teams ? s.brLive : PREVIEW && !real ? S.brLive : null;
    return { br, live, pack: s.airPack || {}, word: (br && br.game === 'freefire') ? { win: 'BOOYAH', elims: 'KILLS', game: 'MATCH' } : { win: 'WWCD', elims: 'ELIMS', game: 'MATCH' } };
  }
  const team = (br, id) => br.teams.find(t => t.id === id) || { name: '—', tag: '—', color: '#555', logo: '', players: [] };
  const tag = (t, cls) => logoOk(t.logo) ? `<img class="br-tl ${cls || ''}" src="${esc(t.logo)}" alt="">` : `<span class="br-tl ${cls || ''}" style="--c:${esc(t.color || '#555')}">${esc(t.tag)}</span>`;
  const placePts = (br, place) => (place ? br.scoring.placement[place - 1] || 0 : 0);
  const elimPts = (br, n) => Math.min((n || 0) * (br.scoring.perElim ?? 1), br.scoring.elimCap ?? Infinity);
  /** Overall points so far plus this match's live points; teams still in first, then by place. */
  function liveRows(br, live) {
    const base = new Map((br.standings || []).map(r => [r.team, r]));
    return br.teams.map(t => {
      const l = live && live.teams && live.teams[t.id] || null;
      const now = l ? placePts(br, l.place) + elimPts(br, l.elims) : 0;
      const b = base.get(t.id);
      return { t, total: (b ? b.total : 0) + now, players: l ? l.players : '', elims: l ? l.elims : 0, out: !!(l && l.place), place: l && l.place, mp: !!(br.scoring.matchPoint && b && b.total >= br.scoring.matchPoint) };
    }).sort((a, b) => (a.out - b.out) || (a.out ? a.place - b.place : b.total - a.total));
  }
  const pips = p => `<span class="br-pips">${String(p || '').split('').map(c => `<i class="${c === 'k' ? 'k' : c === 'd' ? 'd' : ''}"></i>`).join('')}</span>`;
  /** A picture slot: the pack's picture when there is one, an empty frame otherwise. */
  const slot = (cls, src, extra) => `<i class="br-slot ${cls}"${pic(src) ? ` style="--pic:url('${esc(src)}')"` : ''}${extra || ''}></i>`;
  const packOf = (pack, kind, i) => { const list = pack && pack[kind]; return Array.isArray(list) ? list[i % Math.max(1, list.length)] || '' : ''; };
  const mapPic = (pack, name) => (pack && pack.maps && pack.maps[String(name || '').toLowerCase()]) || '';

  /** A layer that rebuilds only when its data changes; it enters once, then morphs in place. */
  function layer(root, cls, render, keyOf) {
    const m = E('div', 'mod on br-layer', root), panel = E('div', 'br ' + cls, m);
    let sig = '';
    return { update(s) {
      const k = JSON.stringify(keyOf(s));
      if (k === sig) return;
      const first = !sig;
      sig = k;
      const html = render(s);
      if (first) { panel.innerHTML = html; panel.classList.remove('br-show'); void panel.offsetWidth; panel.classList.add('br-show'); }
      else HUD.morph(panel, html);
    }, tick(s) { this.update(s); }, play() { sig = ''; } };
  }
  const elimOn = d => !!(d.live && d.live.lastOut && (PREVIEW || HUD.now() - (d.live.lastOut.at || 0) < 6000));
  const key = s => { const d = data(s); return [d.br, d.live, d.pack, s.layout && s.layout.brHud, s.event && [s.event.name, s.event.stage], s.brEvent, s.brPopup, elimOn(d)]; };

  // ── In-game HUD ──
  M.brhud = root => layer(root, 'br-hud', s => {
    const d = data(s); if (!d.br) return '';
    const br = d.br, rows = liveRows(br, d.live), game = br.games.find(g => g.n === (d.live ? d.live.game : br.current)) || br.games[0] || { n: 1, map: '' };
    const v = PREVIEW && /^(rail|grid|strip)$/.test(Q.get('mode') || '') ? Q.get('mode') : (s.layout && s.layout.brHud) || 'rail';
    const out = d.live && d.live.lastOut;
    const showOut = elimOn(d) ? out : null;
    const elim = showOut ? (() => { const t = team(br, showOut.team); return `<div class="brh-elim"><span class="place">#${esc(showOut.place)}</span><span class="tm">${tag(t)}<b>${esc(t.name)}</b><em>ELIMINATED</em></span><span class="pts"><b>+${placePts(br, showOut.place) + elimPts(br, (d.live.teams[showOut.team] || {}).elims)}</b><span>PTS</span></span></div>`; })() : '';
    const chip = `<div class="brh-chip"><span class="m"><b>M${esc(game.n)}</b><span>OF ${br.games.length}</span></span><span class="e"><b>${esc(game.map)}</b><span>${esc([s.brEvent || (s.event && s.event.name), br.title].filter(Boolean).join(' · '))}</span></span>${slot('ci', d.pack.ci)}</div>`;
    const counts = d.live ? `${d.live.teamsAlive ?? rows.filter(r => !r.out).length} TEAMS · ${d.live.playersAlive ?? ''} ALIVE` : `${br.teams.length} TEAMS`;
    if (v === 'grid') {
      return `<div class="brh v-grid"><div class="brh-gridbox"><div class="brh-ghead"><b class="t">LIVE POINTS</b><span class="c">${esc(counts)}</span></div><div class="brh-tiles">${rows.map((r, i) => `<div class="brh-tile ${i === 0 && !r.out ? 'lead' : ''} ${r.out ? 'out' : ''} ${/k/.test(r.players) ? 'knock' : ''}" style="--i:${i}"><span class="rk">${r.out ? r.place : i + 1}</span><span class="nm">${esc(r.t.tag)}</span><span class="pt">${r.total}</span>${pips(r.players)}</div>`).join('')}</div></div>${chip}${elim}</div>`;
    }
    if (v === 'strip') {
      const top = rows.filter(r => !r.out).slice(0, 3);
      const pop = s.brPopup || (PREVIEW && Q.get('mode') === 'strip') ? `<div class="brh-pop"><div class="brh-phead"><span class="a">STANDINGS</span><span class="b"><b>LIVE · ${d.word.game} ${esc(game.n)} OF ${br.games.length}</b>${br.scoring.matchPoint ? `MATCH POINT ${br.scoring.matchPoint}` : ''}</span></div><div class="brh-pbody">${rows.map((r, i) => `<div class="brh-pr ${i < 3 && !r.out ? 'top' : ''} ${r.out ? 'out' : ''}" style="--i:${i}"><span class="rk">${r.out ? '#' + r.place : i + 1}</span>${tag(r.t)}<span class="nm">${esc(r.t.name)}</span>${pips(r.players)}<span class="pt">${r.total}</span></div>`).join('')}</div></div>` : '';
      return `<div class="brh v-strip"><div class="brh-strip"><span class="m">${esc(d.word.game)} ${esc(game.n)} · ${esc(game.map)}</span>${top.map((r, i) => `<span class="t"><span class="rk">${i + 1}</span>${tag(r.t)}<span class="nm">${esc(r.t.tag)}</span><span class="pt">${r.total}</span></span>`).join('')}</div>${pop}${slot('ci solo', d.pack.ci)}${elim}</div>`;
    }
    return `<div class="brh v-rail"><div class="brh-rail"><div class="brh-head"><b class="t">POINTS</b><span class="c">${esc(d.word.game)} ${esc(game.n)} · LIVE</span></div>${rows.map((r, i) => `<div class="brh-row ${r.out ? 'out' : ''} ${r.mp && !r.out ? 'mp' : ''}" style="--i:${i}"><span class="rk">${r.out ? '#' + r.place : i + 1}</span>${tag(r.t)}<span class="nm">${esc(r.t.tag)}${r.mp && !r.out ? '<span class="mpt">MP</span>' : ''}</span>${pips(r.players)}<span class="pt">${r.total}</span></div>`).join('')}<div class="brh-key"><span>ALIVE</span><span class="k">KNOCKED</span><span class="d">OUT</span></div></div>${chip}${elim}</div>`;
  }, key);

  // ── Full screens: shared frame (kit wallpaper, Esports logo top left, CI bottom left, event top right) ──
  const frame = (s, d, cls, body, opts) => `<div class="brf ${cls}">${slot('bg', opts && opts.bg !== undefined ? opts.bg : packOf(d.pack, 'wallpaper', 0))}<i class="brf-shade"></i>${slot('logo', d.pack.esports)}<div class="brf-ev"><b>${esc(s.brEvent || (s.event && s.event.name) || '')}</b><span>${esc([d.br.title, d.br.stage].filter(Boolean).join(' · '))}</span></div>${body}${slot('ci', d.pack.ci)}</div>`;
  const title = (a, b, sub) => `<div class="brf-title"><span class="a">${esc(a)}</span> <span class="b">${esc(b)}</span>${sub ? `<div class="brf-sub"><i></i><span>${esc(sub)}</span></div>` : ''}</div>`;
  const full = (name, render, keyOf) => { M[name] = root => layer(root, 'br-full ' + name, s => { const d = data(s); return d.br ? render(s, d) : ''; }, keyOf || key); };
  const lastDone = br => br.games.filter(g => g.done || (g.results && g.results.length)).slice(-1)[0] || null;
  const podium = (rows, labels) => `<div class="brf-pod">${[1, 0, 2].filter(k => rows[k]).map(k => { const r = rows[k]; return `<div class="brf-pc ${['first', 'second', 'third'][k]}"><div class="p">#${k + 1}</div><div class="n">${esc(r.t.name)}</div><div class="s">${labels.map(([l, v]) => `<span><b>${v(r)}</b>${esc(l)}</span>`).join('')}</div></div>`; }).join('')}</div>`;

  full('brlobby', (s, d) => {
    const next = d.br.games.find(g => !g.done && !(g.results && g.results.length)) || d.br.games[0];
    const cd = (() => { const m = /^(\d{1,2}):(\d{2})$/.exec(next && next.startsAt || ''); if (!m) return 'SOON'; const t = new Date(); t.setHours(+m[1], +m[2], 0, 0); const left = Math.max(0, Math.round((t - HUD.now()) / 1000)); return left > 5999 ? next.startsAt : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; })();
    return frame(s, d, 'brf-lobby', `<i class="brf-slash"></i>${slot('char', packOf(d.pack, 'character', 0))}<div class="brl-head">WE GO LIVE IN</div><div class="brl-cd">${esc(cd)}</div><div class="brl-next"><span class="a">NEXT</span><span class="b">${slot('mapthumb', mapPic(d.pack, next && next.map))}${esc(d.word.game)} ${esc(next ? next.n : 1)} · ${esc(next ? next.map : '')}</span></div>`);
  }, s => [key(s), Math.floor(HUD.now() / 1000)]);
  full('brtoday', (s, d) => frame(s, d, 'brf-today', `${title("TODAY'S", 'MATCHES', [d.br.title, d.br.stage].filter(Boolean).join(' · '))}<div class="brt-cards">${d.br.games.map((g, i) => { const done = g.done || (g.results && g.results.length), next = !done && d.br.games.slice(0, i).every(x => x.done || (x.results && x.results.length)); return `<div class="brt-card ${done ? 'done' : ''} ${next ? 'next' : ''}" style="--i:${i}">${slot('map', mapPic(d.pack, g.map))}<span class="tag">${done ? 'PLAYED' : next ? `NEXT${g.startsAt ? ' · ' + esc(g.startsAt) : ''}` : esc(g.startsAt || '')}</span><b class="lab">${esc(g.map || '—')}</b><span class="mn">${esc(d.word.game)} ${g.n}</span></div>`; }).join('')}</div>`));
  full('brrankings', (s, d) => {
    const g = lastDone(d.br); if (!g) return frame(s, d, 'brf-rank', title(d.word.game, 'RANKINGS', 'No results yet'));
    const rows = g.results.slice().sort((a, b) => a.place - b.place).map(r => ({ t: team(d.br, r.team), place: r.place, pp: placePts(d.br, r.place), e: r.elims, tot: placePts(d.br, r.place) + elimPts(d.br, r.elims) }));
    return frame(s, d, 'brf-rank', `${slot('char side', packOf(d.pack, 'character', 1))}${title(`${d.word.game} ${g.n}`, 'RANKINGS', g.map)}${podium(rows, [['PLACE', r => r.pp], [d.word.elims, r => r.e], ['TOTAL', r => r.tot]])}<div class="brf-rest" style="--rows:${Math.max(1, Math.ceil((Math.min(rows.length, 25) - 3) / 2))}">${rows.slice(3, 25).map((r, i) => `<div class="brf-rw" style="--i:${i}"><span class="r">#${r.place}</span>${tag(r.t)}<span class="nm">${esc(r.t.name)}</span><span class="c">${r.pp}</span><span class="c">${r.e}</span><span class="t">${r.tot}</span></div>`).join('')}</div>`);
  });
  full('broverall', (s, d) => {
    const mp = d.br.scoring.matchPoint;
    const rows = (d.br.standings || []).map(r => ({ t: team(d.br, r.team), tot: r.total, w: r.wins, e: r.elims, go: mp ? Math.max(0, mp - r.total) : null, mp: r.matchPoint }));
    const onMp = rows.filter(r => r.mp).length;
    return frame(s, d, 'brf-overall', `${title('OVERALL', 'STANDINGS', mp ? `Match point ${mp} · win a match after reaching it` : `After ${d.br.played} of ${d.br.games.length}`)}${onMp ? `<div class="brf-mpbar">${onMp} ${onMp === 1 ? 'TEAM' : 'TEAMS'} ON MATCH POINT</div>` : ''}${podium(rows, [['POINTS', r => r.tot], [d.word.win, r => r.w], [mp ? 'TO GO' : d.word.elims, r => (mp ? (r.go || 'MP') : r.e)]])}<div class="brf-rest" style="--rows:${Math.max(1, Math.ceil((Math.min(rows.length, 25) - 3) / 2))}">${rows.slice(3, 25).map((r, i) => `<div class="brf-rw" style="--i:${i}"><span class="r">#${i + 4}</span>${tag(r.t)}<span class="nm">${esc(r.t.name)}</span><span class="c">${r.w}</span><span class="c">${mp ? (r.go || 'MP') : r.e}</span><span class="t">${r.tot}</span></div>`).join('')}</div>`);
  });
  full('brwwcd', (s, d) => {
    const g = lastDone(d.br), win = g && g.results.find(r => r.place === 1);
    const t = win ? team(d.br, win.team) : null;
    const pts = win ? placePts(d.br, 1) + elimPts(d.br, win.elims) : 0;
    return frame(s, d, 'brf-wwcd', `<i class="brw-band"></i>${slot('char l', packOf(d.pack, 'character', 0))}${slot('char r', packOf(d.pack, 'character', 1))}<div class="brw-team"><span class="a">${esc(d.word.game)} ${esc(g ? g.n : '')}</span><span class="b">${t ? tag(t) : ''}${esc(t ? t.name : '')}</span><span class="c"><b>+${pts}</b><span>PTS</span></span></div><div class="brw-word">${esc(d.word.win)}</div><div class="brw-sub">${d.word.win === 'WWCD' ? 'WINNER WINNER CHICKEN DINNER' : 'BOOYAH!'}</div><div class="brw-pl">${(t ? t.players : []).slice(0, 4).map(p => `<div><b>${esc(p)}</b></div>`).join('')}</div>`, { bg: packOf(d.pack, 'wallpaper', 1) });
  });
  full('brmvp', (s, d) => {
    const list = (d.live && d.live.mvp) || [];
    const fmt = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    return frame(s, d, 'brf-mvp', `${title('MVP', 'RANKINGS', `After ${d.word.game.toLowerCase()} ${(lastDone(d.br) || { n: '' }).n}`)}<div class="brm-cards">${list.slice(0, 4).map((p, i) => `<div class="brm-card ${i === 0 ? 'first' : ''}" style="--i:${i}">${slot('char', packOf(d.pack, 'character', i))}<span class="no">${i + 1}</span><div class="info"><div class="nm">${esc(p.name)}</div><div class="tm">${esc(team(d.br, p.team).name)}</div><div class="stats"><div><b>${p.elims}</b>${esc(d.word.elims)}</div><div><b>${p.damage}</b>DAMAGE</div><div><b>${fmt(p.survived || 0)}</b>SURVIVED</div></div></div></div>`).join('') || '<p class="brm-none">MVP numbers arrive when the match ends.</p>'}</div>`);
  });
  full('brchampion', (s, d) => {
    const c = d.br.champion, lead = (d.br.standings || [])[0];
    const id = c ? c.team : lead && lead.team, row = (d.br.standings || []).find(r => r.team === id) || {};
    const t = id ? team(d.br, id) : null;
    return frame(s, d, 'brf-champ', `<div class="brc-word">CHAMPIONS</div>${slot('char l', packOf(d.pack, 'character', 0))}${slot('char r', packOf(d.pack, 'character', 1))}<div class="brc-team"><span class="a">${esc(d.br.title || '')}</span><span class="b">${t ? tag(t) : ''}${esc(t ? t.name : '')}</span></div><div class="brc-stats"><div><b>${row.total || 0}</b>POINTS</div><div><b>${row.wins || 0}</b>${esc(d.word.win)}</div><div><b>${row.elims || 0}</b>${esc(d.word.elims)}</div></div>`, { bg: packOf(d.pack, 'wallpaper', 2) });
  });
})();
