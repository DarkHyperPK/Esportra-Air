/* Battle royale graphics ("Hot Drop", approved mock 23 Nov). The in-game HUD in three layouts (rail, grid, strip) and
   the full screens, built from the game's own language: the tactical map with its grid, the zone rings and the
   plane's flight path; data drawn as tables, bars, dials and a journey line. They read:
   · `state.br`      the lobby (Air): teams with players and photos, games and results, scoring, standings;
   · `state.brLive`  the observer feed (step 6): per team players a/k/d, elims, place; mvp; players' stats;
   · `state.airPack` the game pack's pictures (logos, wallpapers, maps, items);
   · `state.airBrTheme` the event's theme: preset (sky, jungle, inferno) or own colours, background picture,
     emblem, props; `brEvent`, `brEmblem`, `brSponsors` from the event.
   They never draw what the observer client shows (killfeed, compass, minimap and zone timer, observed player, name
   tags). Pictures sit in parts Graphics studio can swap; a player without a photo is a grey shadow, never a game
   character. Motion uses only transform and opacity; numbers count up once when a graphic enters; live changes
   morph in place. Load after hud.js. */
(function () {
  const HUD = window.HUD, M = HUD.modules, E = HUD.el;
  const Q = new URLSearchParams(location.search);
  const PREVIEW = Q.get('preview') === '1';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const PIC = /^\/(packs\/[a-z0-9]{2,16}\/[0-9a-f]{64}\.(png|jpg|webp)|air-assets\/[0-9a-f-]{36})$/;
  const pic = v => (typeof v === 'string' && PIC.test(v) ? v : '');
  const photoOk = v => typeof v === 'string' && /^(\/air-assets\/[0-9a-f-]{36}|https:\/\/[^\s"'<>]+|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(v);
  const logoOk = v => typeof v === 'string' && /^(\/air-assets\/[0-9a-f-]{36}|https:\/\/[^\s"'<>]+)$/i.test(v);
  const hex = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '');
  const col = c => hex(c) || '#5b5b5b';

  // ── Themes: the colour world of the event. Own colours replace a preset's. ──
  const THEMES = {
    sky: { bg1: '#0a58c9', bg2: '#36b4ff', veil: 'rgba(10,88,201,.66)', glow: 'rgba(255,255,255,.5)', line: 'rgba(255,255,255,.18)', panel: '#ffffff', panel2: '#e9f3ff', ink: 'rgba(6,30,74,.86)', text: '#0a2350', muted: '#4f6d99', acc: '#FFB60E', title: '#ffffff', title2: '#dff1ff', hair: 'rgba(255,255,255,.34)', shade: 'rgba(6,30,74,.55)' },
    jungle: { bg1: '#0c241c', bg2: '#1d4a39', veil: 'rgba(12,36,28,.72)', glow: 'rgba(222,186,104,.32)', line: 'rgba(222,186,104,.12)', panel: 'rgba(18,52,40,.96)', panel2: 'rgba(9,30,23,.97)', ink: 'rgba(6,22,16,.88)', text: '#f4ead1', muted: '#a9b8a0', acc: '#E2BC67', title: '#fff4d6', title2: '#d6ad55', hair: 'rgba(222,186,104,.28)', shade: 'rgba(0,0,0,.35)' },
    inferno: { bg1: '#170302', bg2: '#8a1a06', veil: 'rgba(23,3,2,.7)', glow: 'rgba(255,120,20,.5)', line: 'rgba(255,140,60,.12)', panel: 'rgba(40,8,4,.95)', panel2: 'rgba(16,3,2,.96)', ink: 'rgba(18,3,2,.88)', text: '#fff3e6', muted: '#e0a58a', acc: '#FFB60E', title: '#fff6d8', title2: '#ffb02e', hair: 'rgba(255,170,90,.26)', shade: 'rgba(0,0,0,.35)' },
  };
  const OWN_KEYS = ['bg1', 'bg2', 'acc', 'panel', 'text', 'title'];
  function theme(s) {
    const t = s.airBrTheme && typeof s.airBrTheme === 'object' ? s.airBrTheme : {};
    const base = THEMES[t.preset] || THEMES.sky;
    const own = {};
    if (t.colors && typeof t.colors === 'object') OWN_KEYS.forEach(k => { if (hex(t.colors[k])) own[k] = t.colors[k]; });
    const v = { ...base, ...own };
    if (own.bg1) v.veil = own.bg1 + 'b8';
    if (own.panel) v.panel2 = own.panel;
    if (own.text) v.muted = own.text + 'aa';
    if (own.bg1) v.ink = own.bg1 + 'e0';
    const props = t.props && typeof t.props === 'object' ? t.props : {};
    return { name: THEMES[t.preset] ? t.preset : 'sky', vars: v, background: pic(t.background), emblem: pic(t.emblem), crate: props.crate !== false, chutes: props.chutes !== false, side: props.side === 'left' ? 'left' : 'right' };
  }
  const themeStyle = th => Object.entries(th.vars).map(([k, v]) => `--${k}:${v}`).join(';');

  /** The lobby, its live match and the pack: the room's, or the made-up sample on preview pages. */
  function data(s) {
    const S = window.BR_SAMPLE || {};
    const real = s.br && Array.isArray(s.br.teams) && s.br.teams.length;
    const br = real ? s.br : PREVIEW ? S.br : null;
    const live = s.brLive && s.brLive.teams ? s.brLive : PREVIEW && !real ? S.brLive : null;
    const free = br && br.game === 'freefire';
    return { br, live, pack: s.airPack || {}, th: theme(s), word: free ? { win: 'BOOYAH', elims: 'KILLS', game: 'MATCH', line: 'BOOYAH!' } : { win: 'WWCD', elims: 'ELIMS', game: 'MATCH', line: 'WINNER WINNER CHICKEN DINNER' } };
  }
  const team = (br, id) => br.teams.find(t => t.id === id) || { name: '—', tag: '—', color: '#555', logo: '', players: [], photos: [] };
  const tag = (t, cls) => logoOk(t.logo) ? `<img class="br-tl ${cls || ''}" src="${esc(t.logo)}" alt="">` : `<span class="br-tl ${cls || ''}" style="--c:${esc(col(t.color))}">${esc(t.tag)}</span>`;
  const tc = t => `--tc:${esc(col(t.color))}`;
  const placePts = (br, place) => (place ? br.scoring.placement[place - 1] || 0 : 0);
  const elimPts = (br, n) => Math.min((n || 0) * (br.scoring.perElim ?? 1), br.scoring.elimCap ?? Infinity);
  /** Overall points so far plus this match's live points; teams still in first, then by place. */
  function liveRows(br, live) {
    const base = new Map((br.standings || []).map(r => [r.team, r]));
    return br.teams.map(t => {
      const l = live && live.teams && live.teams[t.id] || null;
      const now = l ? placePts(br, l.place) + elimPts(br, l.elims) : 0;
      const b = base.get(t.id);
      return { t, total: (b ? b.total : 0) + now, now, players: l ? l.players : '', elims: l ? l.elims : 0, out: !!(l && l.place), place: l && l.place, mp: !!(br.scoring.matchPoint && b && b.total >= br.scoring.matchPoint) };
    }).sort((a, b) => (a.out - b.out) || (a.out ? a.place - b.place : b.total - a.total));
  }
  const pips = p => `<span class="br-pips">${String(p || '').split('').map(c => `<i class="${c === 'k' ? 'k' : c === 'd' ? 'd' : ''}"></i>`).join('')}</span>`;
  const num = (v, cls) => `<b class="${cls || ''}" data-n="${esc(v)}">${esc(v)}</b>`;
  /** A picture slot: the theme's or pack's picture when there is one, an empty frame otherwise. */
  const slot = (cls, src, extra) => `<i class="br-slot ${cls}"${pic(src) ? ` style="--pic:url('${esc(src)}')"` : ''}${extra || ''}></i>`;
  const packOf = (pack, kind, i) => { const list = pack && pack[kind]; return Array.isArray(list) ? list[i % Math.max(1, list.length)] || '' : ''; };
  const mapPic = (pack, name) => (pack && pack.maps && pack.maps[String(name || '').toLowerCase()]) || '';
  const lastDone = br => br.games.filter(g => g.done || (g.results && g.results.length)).slice(-1)[0] || null;

  /** A player's photo from Teams/Players, or a grey shadow (never a game character). */
  function player(t, i) {
    const src = t.photos && t.photos[i];
    if (photoOk(src)) return `<span class="b6-ph"><img src="${esc(src)}" alt=""></span>`;
    return `<span class="b6-ph none"><svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMax meet"><path d="M34 500 C 38 404 74 334 146 314 C 166 308 172 290 172 270 C 150 254 132 226 130 192 C 126 130 160 96 204 96 C 252 96 278 132 272 192 C 270 226 252 254 228 270 C 228 290 234 308 254 314 C 326 334 362 404 366 500 Z"/></svg></span>`;
  }
  const playerOf = (br, name) => { for (const t of br.teams) { const i = (t.players || []).indexOf(name); if (i >= 0) return { t, i }; } return null; };

  /** Count numbers up from 0 when a graphic enters (never on later updates). */
  function countUp(root) {
    const els = [...root.querySelectorAll('[data-n]')].filter(e => /^\d+$/.test(e.dataset.n));
    if (!els.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now() + 300, dur = 900;
    els.forEach(e => { e.textContent = '0'; });
    const step = now => {
      const k = Math.min(1, Math.max(0, (now - t0) / dur)), ease = 1 - Math.pow(1 - k, 3);
      els.forEach(e => { if (e.isConnected) e.textContent = String(Math.round(+e.dataset.n * ease)); });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** A layer that rebuilds only when its data changes; it enters once, then morphs in place. */
  function layer(root, cls, render, keyOf) {
    const m = E('div', 'mod on br-layer', root), panel = E('div', 'br ' + cls, m);
    let sig = '';
    return { update(s) {
      const k = JSON.stringify(keyOf(s));
      if (k === sig) return;
      const first = !sig;
      sig = k;
      const d = data(s);
      m.setAttribute('style', themeStyle(d.th));
      m.dataset.theme = d.th.name;
      const html = render(s, d);
      if (first) { panel.innerHTML = html; panel.classList.remove('br-show'); void panel.offsetWidth; panel.classList.add('br-show'); countUp(panel); }
      else HUD.morph(panel, html);
    }, tick(s) { this.update(s); }, play() { sig = ''; } };
  }
  const elimOn = d => !!(d.live && d.live.lastOut && (PREVIEW || HUD.now() - (d.live.lastOut.at || 0) < 6000));
  const key = s => { const d = data(s); return [d.br, d.live, d.pack, s.airBrTheme, s.layout && s.layout.brHud, s.brEvent, s.brEmblem, s.brSponsors, s.brPopup, elimOn(d)]; };
  const eventName = s => s.brEvent || (s.event && s.event.name) || '';

  // ═════════════ In-game HUD ═════════════
  M.brhud = root => layer(root, 'br-hud', (s, d) => {
    if (!d.br) return '';
    const br = d.br, rows = liveRows(br, d.live), game = br.games.find(g => g.n === (d.live ? d.live.game : br.current)) || br.games[0] || { n: 1, map: '' };
    const v = PREVIEW && /^(rail|grid|strip)$/.test(Q.get('mode') || '') ? Q.get('mode') : (s.layout && s.layout.brHud) || 'rail';
    const out = d.live && d.live.lastOut, showOut = elimOn(d) ? out : null;
    const alive = rows.filter(r => !r.out).length;
    const left = d.live ? d.live.teamsAlive ?? alive : br.teams.length;
    const elim = showOut ? (() => {
      const t = team(br, showOut.team);
      return `<div class="brh-elim" style="${tc(t)}"><span class="cam">${tag(t)}<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i></span><span class="tx"><em>TEAM ELIMINATED</em><b>${esc(t.name)}</b><span>+${placePts(br, showOut.place) + elimPts(br, (d.live.teams[showOut.team] || {}).elims)} PTS · ${esc(left)} TEAMS LEFT</span></span><span class="place">#${esc(showOut.place)}</span><i class="hz"></i></div>`;
    })() : '';
    const chip = `<div class="brh-chip"><span class="m"><b>M${esc(game.n)}</b><span>OF ${br.games.length}</span></span>${slot('mapthumb', mapPic(d.pack, game.map))}<span class="e"><b>${esc(game.map)}</b><span>${esc([eventName(s), br.title].filter(Boolean).join(' · '))}</span></span></div>`;
    const counts = d.live ? `${left} TEAMS · ${d.live.playersAlive ?? ''} ALIVE` : `${br.teams.length} TEAMS`;
    const max = Math.max(1, br.scoring.matchPoint || 0, ...rows.map(r => r.total)) * 1.15;
    if (v === 'grid') {
      return `<div class="brh v-grid"><div class="brh-gridbox"><div class="brh-ghead"><b class="t">LIVE POINTS</b><span class="m">${esc(d.word.game)} ${esc(game.n)} · ${esc(game.map)}</span><span class="c">${esc(counts)}</span></div><div class="brh-tiles">${rows.map((r, i) => `<div class="brh-tile ${i === 0 && !r.out ? 'lead' : ''} ${r.out ? 'out' : ''} ${/k/.test(r.players) ? 'knock' : ''}" style="--i:${i};${tc(r.t)}"><span class="rk">${r.out ? r.place : i + 1}</span><span class="nm">${esc(r.t.tag)}</span><span class="pt">${r.total}</span>${pips(r.players)}</div>`).join('')}</div></div>${chip}${elim}</div>`;
    }
    if (v === 'strip') {
      const top = rows.filter(r => !r.out).slice(0, 3);
      const pop = s.brPopup || (PREVIEW && Q.get('mode') === 'strip') ? `<div class="brh-pop"><div class="brh-phead"><span class="a">STANDINGS</span><span class="b"><b>LIVE · ${d.word.game} ${esc(game.n)} OF ${br.games.length}</b>${br.scoring.matchPoint ? `MATCH POINT ${br.scoring.matchPoint}` : ''}</span></div><div class="brh-pbody">${rows.map((r, i) => `<div class="brh-pr ${i < 3 && !r.out ? 'top' : ''} ${r.out ? 'out' : ''}" style="--i:${i};${tc(r.t)}"><span class="rk">${r.out ? '#' + r.place : i + 1}</span>${tag(r.t)}<span class="nm">${esc(r.t.name)}</span>${pips(r.players)}<span class="pt">${r.total}</span></div>`).join('')}</div></div>` : '';
      return `<div class="brh v-strip"><div class="brh-strip"><span class="m">${esc(d.word.game)} ${esc(game.n)} · ${esc(game.map)}</span>${top.map((r, i) => `<span class="t ${i === 0 ? 'lead' : ''}" style="${tc(r.t)}"><span class="rk">${i + 1}</span>${tag(r.t)}<span class="nm">${esc(r.t.tag)}</span><span class="pt">${r.total}</span></span>`).join('')}<span class="al"><b>${esc(left)}</b>TEAMS</span></div>${pop}${elim}</div>`;
    }
    return `<div class="brh v-rail"><div class="brh-rail"><div class="brh-head"><b class="t">LIVE POINTS</b><span class="c">${esc(d.word.game)} ${esc(game.n)} · ${esc(game.map)}</span></div><div class="brh-sub"><span>${esc(counts)}</span>${br.scoring.matchPoint ? `<span class="mpx">MATCH POINT ${br.scoring.matchPoint}</span>` : ''}</div>${rows.map((r, i) => `<div class="brh-row ${i === 0 && !r.out ? 'lead' : ''} ${r.out ? 'out' : ''} ${/k/.test(r.players) ? 'knock' : ''}" style="--i:${i};${tc(r.t)};--w:${Math.round(r.total / max * 100)}%;--mpx:${br.scoring.matchPoint ? Math.round(br.scoring.matchPoint / max * 100) : -10}%"><i class="bkx"></i>${r.out || !br.scoring.matchPoint ? '' : '<i class="mpl"></i>'}<span class="rk">${r.out ? '#' + r.place : i + 1}</span>${tag(r.t)}<span class="nm">${esc(r.t.tag)}${r.mp && !r.out ? '<span class="mpt">MP</span>' : ''}</span>${pips(r.players)}<span class="pt">${r.total}</span></div>`).join('')}<div class="brh-key"><span>ALIVE</span><span class="k">KNOCKED</span><span class="d">OUT</span></div></div>${chip}${elim}</div>`;
  }, key);

  // ═════════════ Full screens ═════════════
  /** Shared frame: background picture, one veil layer (tint, grid, texture, vignette), props, header, footer. */
  function frame(s, d, cls, body, o) {
    o = o || {};
    const th = d.th, bg = th.background || o.bg || packOf(d.pack, 'wallpaper', o.wall || 0);
    const props = [];
    if (th.chutes) (th.side === 'left' ? [[250, 330, 130], [120, 600, 86]] : [[1560, 210, 120], [1740, 380, 80], [300, 150, 64]]).forEach(([x, y, w], i) => props.push(`<i class="b6-chute" style="left:${x}px;top:${y}px;width:${w}px;animation-delay:${-i * 1.4}s"><svg viewBox="0 0 120 170"><path class="cn" d="M4 50 Q60 -12 116 50 Q102 40 88 50 Q74 40 60 50 Q46 40 32 50 Q18 40 4 50 Z"/><path class="cs" d="M32 50 Q46 40 60 50 Q60 12 46 8 Q30 20 32 50 Z M88 50 Q74 40 60 50 Q60 12 74 8 Q90 20 88 50 Z"/><path class="ln" d="M6 50 L56 128 M32 50 L58 128 M60 50 L60 128 M88 50 L62 128 M114 50 L64 128"/><rect x="48" y="128" width="24" height="24" rx="2" fill="#7b2a22"/><rect x="48" y="128" width="24" height="7" fill="#2f6fb8"/></svg></i>`));
    const item = pic(packOf(d.pack, 'item', 0));
    const crate = o.crate && th.crate && item ? `<i class="br-slot b6-crate" style="--pic:url('${esc(item)}');${o.crate}"></i>` : '';
    const emblemSrc = th.emblem || pic(s.brEmblem);
    const emblem = emblemSrc ? slot('b6-emblem', emblemSrc) : `<span class="b6-emblem gen"><b>${esc(eventName(s) || d.br.title || '')}</b></span>`;
    return `<div class="brf ${cls}">${slot('bg', bg)}<i class="b6-veil"></i><div class="b6-props">${props.join('')}</div>${crate}${body}${o.header === false ? `${slot('b6-logo solo', d.pack.esports)}` : o.header}${footer(s, d, o.foot)}${o.emblem ? `<div class="b6-emw">${emblem}</div>` : ''}</div>`;
  }
  /** Header: kit logo, a hairline, the event line, the title and its context, then the graphic's own context card. */
  function header(s, d, title, sub, card) {
    const ev = [eventName(s), d.br.title, d.br.stage].filter(Boolean);
    return `<header class="b6-hd">${slot('b6-logo', d.pack.esports)}<i class="b6-rule"></i><div class="b6-ht"><div class="b6-k">${ev.map(esc).join('<i></i>')}</div><h1>${esc(title)}</h1><div class="b6-s">${sub}</div></div>${card ? `<div class="b6-card">${card}</div>` : ''}</header>`;
  }
  function footer(s, d, line) {
    const sp = Array.isArray(s.brSponsors) ? s.brSponsors.slice(0, 3) : [];
    return `<footer class="b6-ft">${slot('b6-ci', d.pack.ci)}<span class="b6-fl">${esc(line || '')}</span>${sp.length ? `<span class="b6-fr"><b>PRESENTED BY</b>${sp.map(x => logoOk(x.logo) ? `<img class="b6-sp" src="${esc(x.logo)}" alt="">` : `<span class="b6-sp txt">${esc(x.name)}</span>`).join('')}</span>` : ''}</footer>`;
  }
  const dot = '<i></i>';
  const progress = (done, total) => `<span class="b6-pips">${Array.from({ length: total }, (_, i) => `<i class="${i < done ? 'on' : i === done ? 'nx' : ''}"></i>`).join('')}</span>`;
  const full = (name, render, keyOf) => { M[name] = root => layer(root, 'br-full ' + name, (s, d) => (d.br ? render(s, d) : ''), keyOf || key); };
  const mapCard = (d, name, label) => `<div class="b6-mapc">${slot('b6-mapimg', mapPic(d.pack, name))}<span>${esc(label)}</span></div>`;

  /** Tactical map: the map with its grid and edge coordinates, the flight path edge to edge with the plane riding it,
      the jump marker, the safe zone and the blue-zone ring, north arrow and scale bar. Decorative before a match. */
  function tactical(d, name) {
    const path = 'M 40 700 L 960 210';
    return `<div class="b6-tac">${slot('b6-tacmap', mapPic(d.pack, name))}
      <svg class="b6-tfx" viewBox="0 0 1000 1000">${Array.from({ length: 7 }, (_, i) => `<line x1="${(i + 1) * 125}" y1="0" x2="${(i + 1) * 125}" y2="1000"/><line x1="0" y1="${(i + 1) * 125}" x2="1000" y2="${(i + 1) * 125}"/>`).join('')}
        <circle class="blue" cx="560" cy="470" r="330"/><circle class="safe" cx="560" cy="470" r="200"/><path class="fp" d="${path}"/><path class="lit" d="${path}"/>
        <g class="jump" transform="translate(395 512)"><circle r="16"/><text y="-26">JUMP</text></g>
        <g class="plane"><path d="M22 0 L-6 -4 L-14 -20 L-20 -20 L-14 -4 L-22 -3 L-26 -9 L-30 -9 L-27 0 L-30 9 L-26 9 L-22 3 L-14 4 L-20 20 L-14 20 L-6 4 Z"/><animateMotion dur="5s" begin="0.4s" fill="freeze" rotate="auto" path="${path}" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".35 0 .4 1"/></g></svg>
      <div class="b6-tx">${'ABCDEFGH'.split('').map(c => `<span>${c}</span>`).join('')}</div><div class="b6-ty">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<span>${n}</span>`).join('')}</div><div class="b6-north"><i></i><b>N</b></div></div>`;
  }

  // Starting soon (waiting lobby)
  full('brlobby', (s, d) => {
    const br = d.br, next = br.games.find(g => !g.done && !(g.results && g.results.length)) || br.games[br.games.length - 1];
    const cd = (() => { const m = /^(\d{1,2}):(\d{2})$/.exec(next && next.startsAt || ''); if (!m) return '--:--'; const t = new Date(); t.setHours(+m[1], +m[2], 0, 0); const left = Math.max(0, Math.round((t - HUD.now()) / 1000)); return left > 5999 ? next.startsAt : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; })();
    const lead = (br.standings || []).slice(0, 3);
    const body = `<div class="b6-lb">
        <div class="b6-k2">${cd.length === 5 && /^\d\d:\d\d$/.test(cd) && next.startsAt !== cd ? 'WHEELS UP IN' : 'DROP AT'}</div>
        <div class="b6-cd">${cd.split('').map(c => c === ':' ? '<span class="col">:</span>' : `<span class="dg">${esc(c)}</span>`).join('')}</div>
        <div class="b6-facts"><div><span>MATCH</span><b>${esc(next.n)}<small>/${br.games.length}</small></b></div><div><span>MAP</span><b>${esc(String(next.map || '—').toUpperCase())}</b></div><div><span>TEAMS</span><b>${br.teams.length}</b></div><div><span>PLAYERS</span><b>${br.teams.reduce((a, t) => a + Math.min(4, (t.players || []).length || 4), 0)}</b></div></div>
        ${lead.length && br.played ? `<div class="b6-lst"><div class="b6-lsh">STANDINGS AFTER ${br.played} ${br.played === 1 ? 'MATCH' : 'MATCHES'}</div>${lead.map((r, i) => { const t = team(br, r.team); return `<div class="b6-lr" style="${tc(t)};--i:${i}"><span class="rk">${i + 1}</span>${tag(t)}<span class="nm">${esc(t.name)}</span><span class="v">${num(r.total)}<small>PTS</small></span></div>`; }).join('')}</div>` : ''}
      </div><div class="b6-mapwrap"><div class="b6-tilt">${tactical(d, next.map)}</div></div>`;
    return frame(s, d, 'brf-lobby', body, { wall: 3, crate: d.th.side === 'left' ? 'left:640px;top:740px' : 'left:1680px;top:760px', emblem: true, header: header(s, d, 'STARTING SOON', `<span>${esc(d.word.game)} ${esc(next.n)} OF ${br.games.length}</span>${dot}<span>${esc(String(next.map || '').toUpperCase())}</span>${next.startsAt ? `${dot}<span>DROP ${esc(next.startsAt)}</span>` : ''}`, ''), foot: `NEXT · ${d.word.game} ${next.n} · ${String(next.map || '').toUpperCase()}` });
  }, s => [key(s), Math.floor(HUD.now() / 1000)]);

  // Today's matches: map discs along the flight path
  full('brtoday', (s, d) => {
    const br = d.br, n = br.games.length;
    const nextIdx = br.games.findIndex(g => !g.done && !(g.results && g.results.length));
    const gap = Math.min(304, 1520 / Math.max(1, n - 1)), x0 = 96 + Math.max(0, (1520 - gap * (n - 1)) / 2);
    const pos = br.games.map((_, i) => [x0 + i * gap, i % 2 ? 560 : 300]);
    const path = 'M 0 520 ' + pos.map(([x, y]) => `L ${Math.round(x + 104)} ${y + 104}`).join(' ') + ' L 1920 560';
    const day = (/DAY\s*(\d+)/i.exec(br.stage || '') || [])[1];
    const body = `<svg class="b6-path" viewBox="0 0 1920 1080"><path class="fp0" d="${path}"/><path class="fp1" d="${path}"/></svg>${br.games.map((g, i) => {
      const done = g.done || (g.results && g.results.length), isNext = i === nextIdx, w = done && g.results ? g.results.find(r => r.place === 1) : null, wt = w ? team(br, w.team) : null;
      return `<div class="b6-stop ${done ? 'done' : ''} ${isNext ? 'next' : ''}" style="left:${Math.round(pos[i][0])}px;top:${pos[i][1]}px;--i:${i}"><div class="b6-disc">${slot('b6-discimg', mapPic(d.pack, g.map))}<i class="ring"></i><span class="no">${String(g.n).padStart(2, '0')}</span></div><div class="b6-dl"><b>${esc(String(g.map || '—').toUpperCase())}</b><span class="ss ${isNext ? 'nx' : ''}">${done ? 'FINAL' : isNext ? 'NEXT' + (g.startsAt ? ' · ' + esc(g.startsAt) : '') : esc(g.startsAt || 'TBC')}</span>${wt ? `<span class="wn" style="${tc(wt)}">${tag(wt)}<em><small>${esc(d.word.win)}</small>${esc(wt.name)}</em></span>` : ''}</div></div>`;
    }).join('')}`;
    const date = new Date(HUD.now()).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
    return frame(s, d, 'brf-today', body, { wall: 5, header: header(s, d, "TODAY'S MATCHES", `<span>${br.played} PLAYED</span>${dot}<span>${n - br.played} TO GO</span>${progress(br.played, n)}`, `<div class="b6-day"><span>${day ? 'DAY' : 'MATCHES'}</span><b>${esc(day ? String(day).padStart(2, '0') : String(n).padStart(2, '0'))}</b><span>${esc(date)}</span></div>`), foot: `ALL TIMES LOCAL · ${br.teams.length} TEAMS · ${n} MATCHES` });
  });

  // Match results: the last match, survival bars by finish (real times with the observer feed)
  full('brrankings', (s, d) => {
    const br = d.br, g = lastDone(br);
    if (!g) return frame(s, d, 'brf-rank', '<p class="b6-none">Results show here once a match is saved.</p>', { header: header(s, d, 'MATCH RESULTS', '<span>NO RESULTS YET</span>', '') });
    const rows = g.results.slice().sort((a, b) => a.place - b.place);
    const w = team(br, rows[0].team), n = br.teams.length || rows.length;
    const surv = p => Math.max(6, Math.round(100 - (p - 1) * (90 / Math.max(1, n - 1))));
    const squad = (w.players || []).slice(0, 4).map((p, i) => `<span class="b6-sq" style="--i:${i}">${player(w, i)}</span>`).join('') || [0, 1, 2, 3].map(i => `<span class="b6-sq" style="--i:${i}">${player(w, i)}</span>`).join('');
    const body = `<div class="b6-win" style="${tc(w)}"><div class="b6-squad">${squad}</div><div class="b6-badge"><span class="p">#1</span><span class="n"><b>${esc(w.name)}</b><span>${esc(d.word.win)} · ${rows[0].elims} ${esc(d.word.elims)} · ${placePts(br, 1) + elimPts(br, rows[0].elims)} PTS</span></span></div></div>
      <div class="b6-tbl b6-res"><div class="b6-th"><span>#</span><span></span><span>TEAM</span><span>SURVIVAL</span><span>PLACE</span><span>${esc(d.word.elims)}</span><span>PTS</span></div>${rows.slice(0, 20).map((r, i) => { const t = team(br, r.team); return `<div class="b6-tr ${i === 0 ? 'w' : ''}" style="${tc(t)};--i:${i}"><span class="rk">${r.place}</span>${tag(t)}<span class="nm">${esc(t.name)}</span><span class="bar"><i style="width:${surv(r.place)}%"></i>${r.elims ? `<em>${'<b></b>'.repeat(Math.min(r.elims, 12))}</em>` : ''}</span><span class="c">${placePts(br, r.place)}</span><span class="c">${r.elims}</span><span class="t">${num(placePts(br, r.place) + elimPts(br, r.elims))}</span></div>`; }).join('')}<div class="b6-key"><span><i class="s"></i>SURVIVAL${d.live && d.live.survival ? '' : ' (BY FINISH UNTIL LIVE DATA)'}</span><span><i class="e"></i>ELIMINATION</span></div></div>`;
    return frame(s, d, 'brf-rank', body, { wall: 4, header: header(s, d, `${d.word.game} ${g.n} RESULTS`, `<span>${esc(String(g.map || '').toUpperCase())}</span>${dot}<span>${rows.length} TEAMS</span>${dot}<span>${rows.reduce((a, r) => a + r.elims, 0)} ${esc(d.word.elims)}</span>`, mapCard(d, g.map, String(g.map || '').toUpperCase())), foot: `${d.word.game} ${g.n} · ${String(g.map || '').toUpperCase()}${g.startsAt ? ' · ' + g.startsAt : ''}` });
  });

  // Overall standings: a table with a bar towards match point
  full('broverall', (s, d) => {
    const br = d.br, mp = br.scoring.matchPoint, st = br.standings || [];
    const max = Math.max(1, mp || 0, ...st.map(r => r.total)) * 1.08;
    const lead = st[0], lt = lead ? team(br, lead.team) : null, gap = lead && st[1] ? lead.total - st[1].total : 0;
    const body = `<div class="b6-tbl b6-ov"><div class="b6-th"><span>#</span><span></span><span>TEAM</span><span>${esc(d.word.win)}</span><span>PLACE</span><span>${esc(d.word.elims)}</span><span class="bh">${mp ? `TO MATCH POINT ${mp}` : ''}</span><span>PTS</span></div>${st.slice(0, 20).map((r, i) => { const t = team(br, r.team); return `<div class="b6-tr ${r.matchPoint ? 'onmp' : ''} ${i < 3 ? 'top' : ''}" style="${tc(t)};--i:${i}"><span class="rk">${i + 1}</span>${tag(t)}<span class="nm">${esc(t.name)}${r.matchPoint ? '<em>MP</em>' : ''}</span><span class="c">${r.wins || '–'}</span><span class="c">${r.placementPts}</span><span class="c">${r.elimPts}</span><span class="bar"><i class="p" style="width:${r.placementPts / max * 100}%"></i><i class="e" style="width:${r.elimPts / max * 100}%"></i>${mp ? `<b class="mpm" style="left:${mp / max * 100}%"></b>` : ''}</span><span class="t">${num(r.total)}</span></div>`; }).join('')}</div>`;
    const tb = (br.scoring.tiebreak || []).map(x => ({ wins: d.word.win, placementPts: 'PLACEMENT POINTS', elims: d.word.elims, lastGame: 'LAST MATCH' })[x] || '').filter(Boolean).join(' · ');
    return frame(s, d, 'brf-overall', body, { wall: 0, header: header(s, d, 'OVERALL STANDINGS', `<span>AFTER ${esc(d.word.game)} ${br.played} OF ${br.games.length}</span>${progress(br.played, br.games.length)}${mp ? `${dot}<span class="mpx">MATCH POINT ${mp}</span>` : ''}`, lt ? `<div class="b6-ldc" style="${tc(lt)}"><span>LEADER</span><b>${esc(lt.name)}</b><em>${lead.total} PTS${gap ? ` · +${gap}` : ''}</em></div>` : ''), foot: tb ? `TIEBREAK: ${tb}` : '' });
  });

  // WWCD / BOOYAH: the winning squad
  full('brwwcd', (s, d) => {
    const br = d.br, g = lastDone(br), win = g && g.results.find(r => r.place === 1);
    const t = win ? team(br, win.team) : null;
    const pts = win ? placePts(br, 1) + elimPts(br, win.elims) : 0;
    const stats = d.live && Array.isArray(d.live.players) ? d.live.players : [];
    const names = t ? (t.players || []).slice(0, 4) : [];
    const shards = Array.from({ length: 12 }, (_, i) => `<i class="b6-shard" style="left:${(i * 157) % 1880}px;animation-duration:${4 + (i % 5)}s;animation-delay:${-(i * .37)}s"></i>`).join('');
    const body = `<i class="b6-flare a"></i><i class="b6-flare b"></i>${shards}
      <div class="b6-ww"><span class="b6-lt"><span class="dp">${esc(d.word.win)}</span><span class="fc">${esc(d.word.win)}</span></span><div class="b6-wl">${esc(d.word.line)}</div></div>
      ${t ? `<div class="b6-wsq" style="${tc(t)}">${[0, 1, 2, 3].map(i => `<span class="b6-sq" style="--i:${i}">${player(t, i)}</span>`).join('')}</div>
      <div class="b6-wteam" style="${tc(t)}"><span class="a">${esc(d.word.game)} ${esc(g.n)} · ${esc(String(g.map || '').toUpperCase())}</span><span class="b">${tag(t)}${esc(t.name)}</span><span class="c">${num('+' + pts)}<span>PTS</span></span></div>
      <div class="b6-wst">${names.map((p, i) => { const x = stats.find(y => y.name === p) || null; return `<div style="${tc(t)};--i:${i}"><b>${esc(p)}</b>${x ? `<span><em>${esc(x.elims)}</em>${esc(d.word.elims)}</span><span><em>${esc(x.damage)}</em>DAMAGE</span>` : ''}</div>`; }).join('')}</div>` : ''}`;
    return frame(s, d, 'brf-wwcd', body, { wall: 1, crate: 'left:1560px;top:600px', header: false, foot: g ? `${d.word.game} ${g.n} · ${String(g.map || '').toUpperCase()} · ${d.word.line}` : '' });
  });

  // MVP: the top player with dials, then 2-4
  full('brmvp', (s, d) => {
    const br = d.br, list = (d.live && d.live.mvp) || [], g = lastDone(br);
    const fmt = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const who = p => { const f = playerOf(br, p.name); return f || { t: team(br, p.team), i: -1 }; };
    const top = list[0];
    const body = top ? (() => {
      const w = who(top), t = w.t;
      return `<div class="b6-hero" style="${tc(t)}"><span class="one">1</span><i class="dial d1" style="--a:${Math.min(100, top.elims / 10 * 100)}%"></i><i class="dial d2" style="--a:${Math.min(100, top.damage / 1000 * 100)}%"></i><i class="dial d3" style="--a:${Math.min(100, (top.survived || 0) / 1800 * 100)}%"></i>
        <span class="b6-hp">${player(t, w.i)}</span><div class="b6-nums"><div>${num(top.elims)}${esc(d.word.elims)}</div><div>${num(top.damage)}DAMAGE</div><div><b>${fmt(top.survived || 0)}</b>SURVIVED</div></div>
        <div class="b6-hn"><b>${esc(top.name)}</b><span>${tag(t)}${esc(t.name)}</span></div></div>
        ${list.slice(1, 4).map((p, i) => { const x = who(p); return `<div class="b6-side" style="${tc(x.t)};top:${300 + i * 230}px;--i:${i}"><span class="rk">${i + 2}</span><span class="b6-sp2">${player(x.t, x.i)}</span><div class="inf"><b>${esc(p.name)}</b><span>${esc(x.t.name)}</span><span class="n3"><em>${esc(p.elims)}</em> ${esc(d.word.elims)} <em>${esc(p.damage)}</em> DMG</span></div></div>`; }).join('')}`;
    })() : '<p class="b6-none">MVP numbers arrive from the observer feed when the match ends.</p>';
    return frame(s, d, 'brf-mvp', body, { wall: 2, header: header(s, d, 'MATCH MVP', g ? `<span>${esc(d.word.game)} ${esc(g.n)}</span>${dot}<span>${esc(String(g.map || '').toUpperCase())}</span>${dot}<span>RANKED BY DAMAGE, ${esc(d.word.elims)}, SURVIVAL</span>` : '', g ? mapCard(d, g.map, `M${g.n}`) : ''), foot: `MVP · ${d.word.elims}, DAMAGE AND SURVIVAL FROM THE OBSERVER FEED` });
  });

  // Champions: the squad, the word, the journey across the day
  full('brchampion', (s, d) => {
    const br = d.br, c = br.champion, st = br.standings || [];
    const id = c ? c.team : st[0] && st[0].team, row = st.find(r => r.team === id) || {};
    const t = id ? team(br, id) : null;
    const played = br.games.filter(g => g.results && g.results.length);
    const after = played.map((_, k) => { const tot = new Map(br.teams.map(x => [x.id, 0])); played.slice(0, k + 1).forEach(g => g.results.forEach(x => tot.set(x.team, (tot.get(x.team) || 0) + placePts(br, x.place) + elimPts(br, x.elims)))); return [...tot.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]); });
    const W = 1360, H = 150, X = k => (played.length > 1 ? k / (played.length - 1) : .5) * W, Y = r => (r / Math.max(1, br.teams.length - 1)) * H;
    const line = tid => after.map((o, k) => `${X(k)},${Y(o.indexOf(tid))}`).join(' ');
    const wins = played.map((g, k) => (g.results.find(x => x.place === 1) || {}).team === id ? k : -1).filter(k => k >= 0);
    const journey = t && played.length ? `<div class="b6-jr"><span class="lab">THE JOURNEY<br><span>RANK AFTER EACH MATCH</span></span><svg viewBox="0 -14 ${W} ${H + 40}">${br.teams.filter(x => x.id !== id).map(x => `<polyline class="o" points="${line(x.id)}"/>`).join('')}<polyline class="c" points="${line(id)}"/>${after.map((o, k) => `<g transform="translate(${X(k)},${Y(o.indexOf(id))})"><circle class="${wins.includes(k) ? 'w' : ''}" r="${wins.includes(k) ? 15 : 9}"/>${wins.includes(k) ? '<text class="wt" y="5">W</text>' : ''}<text class="lb" y="${wins.includes(k) ? 38 : 30}">M${k + 1} · #${o.indexOf(id) + 1}</text></g>`).join('')}</svg></div>` : '';
    const body = `<i class="b6-rays"></i>${t ? `<div class="b6-csq">${[0, 1, 2, 3].map(i => `<span class="b6-sq" style="--i:${i}">${player(t, i)}</span>`).join('')}</div>` : ''}
      <div class="b6-cw"><span class="b6-lt"><span class="dp">CHAMPIONS</span><span class="fc">CHAMPIONS</span></span></div>
      ${t ? `<div class="b6-cn" style="${tc(t)}">${tag(t)}<b>${esc(t.name)}</b></div><div class="b6-cst"><div>${num(row.total || 0)}POINTS</div><div>${num(row.wins || 0)}${esc(d.word.win)}</div><div>${num(row.elims || 0)}${esc(d.word.elims)}</div></div>` : ''}${journey}`;
    return frame(s, d, 'brf-champ', body, { wall: 2, emblem: true, header: false, foot: [eventName(s), br.title, 'FINAL STANDINGS'].filter(Boolean).join(' · ').toUpperCase() });
  });
})();
