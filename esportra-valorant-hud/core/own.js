/* Your own graphics (approved mock, 14 Nov): the producer's finished design (one 1920×1080 PNG, kept
   exactly as exported) with data boxes on it. Each box shows one field from the room's state: the game,
   Esportra or what the producer keeps in Air. Text is set with textContent and pictures only come from
   the room (team logos, agent art, Air's own assets), so a design can never inject code or markup.
   FIELDS must match OWN_FIELDS in apps/desktop/src/shared/own-graphics.ts (test/own-graphics.test.ts).
   Load after hud.js: the full-screen host shows `own:<id>` (state.airOwn), and overlays/own.html shows
   one graphic by itself (previews, the editor). */
(function () {
  const HUD = window.HUD, M = HUD.modules, E = HUD.el;
  const Q = new URLSearchParams(location.search);
  const ASSET = /^\/air-assets\/[0-9a-f-]{36}$/i;
  const FONT = { 'Barlow Condensed': 'BarlowC', Poppins: 'PSB', Montserrat: 'EsportraMontserrat', Rajdhani: 'EsportraRajdhani', 'JetBrains Mono': 'JB' };

  const players = s => (s.players || []).flatMap((list, t) => (list || []).map((p, i) => ({ ...p, t, i })));
  // The map MVP as the Map result graphic picks it: highest ACS, or kills when ACS is not known.
  const mvp = s => { const all = players(s).filter(p => p && p.name); const acs = all.some(p => +p.acs > 0); return all.sort((a, b) => +(acs ? b.acs : b.k) - +(acs ? a.acs : a.k))[0] || null; };
  const kda = p => p && p.k != null ? `${p.k}/${p.d}/${p.a}` : '';
  const portrait = p => { const a = p && HUD.agent(p.agent); return a && a.full ? a.full : ''; };
  const agentName = p => { const a = p && HUD.agent(p.agent); return a ? a.name : (p && p.agent) || ''; };
  const sponsorNow = s => { const list = s.sponsors || []; if (!list.length) return null; const i = Math.floor(Date.now() / 8000) % list.length; const x = list[i]; return typeof x === 'string' ? { name: x, logo: '' } : x; };
  const nextMatch = s => { const x = (s.schedule || []).find(m => !m.done && m.a && m.b); return x ? `${x.time ? x.time + '  ' : ''}${x.a} vs ${x.b}` : ''; };
  const val = v => (v === undefined || v === null ? '' : String(v));

  /** Every field, with how to read it from the room's state. */
  const FIELDS = {
    'map.label': s => s.map && s.map.name ? `MAP ${s.map.number || 1} · ${s.map.name}` : '',
    'map.name': s => val(s.map && s.map.name),
    'map.number': s => val(s.map && s.map.number),
    'series.score': s => s.teams ? `${s.teams[0].series || 0}–${s.teams[1].series || 0}` : '',
    'round.number': s => val(s.round && s.round.number),
    'mvp.name': s => val((mvp(s) || {}).name),
    'mvp.team': s => { const p = mvp(s); return p ? val(s.teams[p.t].tag) : ''; },
    'mvp.agent': s => agentName(mvp(s)),
    'mvp.kda': s => kda(mvp(s)),
    'mvp.acs': s => val((mvp(s) || {}).acs),
    'mvp.portrait': s => portrait(mvp(s)),
    'event.name': s => val(s.event && s.event.name),
    'event.stage': s => val(s.event && s.event.stage),
    'caster.0.name': s => val(s.casters && s.casters[0] && s.casters[0].name),
    'caster.1.name': s => val(s.casters && s.casters[1] && s.casters[1].name),
    'sponsor.name': s => val((sponsorNow(s) || {}).name),
    'sponsor.logo': s => val((sponsorNow(s) || {}).logo),
    'next.match': nextMatch,
  };
  [0, 1].forEach(t => {
    const team = s => (s.teams || [])[t] || {};
    Object.assign(FIELDS, {
      [`team.${t}.name`]: s => val(team(s).name), [`team.${t}.tag`]: s => val(team(s).tag), [`team.${t}.logo`]: s => val(team(s).logo),
      [`team.${t}.color`]: s => val(team(s).color), [`team.${t}.score`]: s => val(team(s).score), [`team.${t}.series`]: s => val(team(s).series),
    });
    [0, 1, 2, 3, 4].forEach(i => {
      const p = s => ((s.players || [])[t] || [])[i];
      Object.assign(FIELDS, {
        [`player.${t}.${i}.name`]: s => val((p(s) || {}).name), [`player.${t}.${i}.agent`]: s => agentName(p(s)),
        [`player.${t}.${i}.kda`]: s => kda(p(s)), [`player.${t}.${i}.acs`]: s => val((p(s) || {}).acs), [`player.${t}.${i}.portrait`]: s => portrait(p(s)),
      });
    });
  });
  const KIND = id => (/\.(logo|portrait)$/.test(id) ? 'image' : /\.color$/.test(id) ? 'color' : 'text');

  // Uploaded fonts are added with the FontFace API (no stylesheet is written), once per font.
  const loaded = new Set();
  const useFonts = g => (g.fonts || []).forEach(f => {
    if (loaded.has(f.id) || !ASSET.test(f.url) || !window.FontFace) return;
    loaded.add(f.id);
    new FontFace(`own-${f.id}`, `url(${f.url})`).load().then(face => { document.fonts.add(face); HUD.ownRefresh && HUD.ownRefresh(); }).catch(() => {});
  });
  const family = (g, name) => { const f = (g.fonts || []).find(x => x.name === name); return f ? `own-${f.id}, sans-serif` : `${FONT[name] || 'BarlowC'}, sans-serif`; };
  const safeImg = url => typeof url === 'string' && (ASSET.test(url) || /^https:\/\//.test(url) || /^\/art\//.test(url) || /^data:image\/(png|jpeg|webp);/.test(url));

  /** Draws one graphic into `root` and keeps it filled; `get()` returns its definition (state or draft). */
  function own(root, get) {
    const wrap = E('div', '', root);
    Object.assign(wrap.style, { position: 'absolute', inset: '0', overflow: 'hidden' });
    const art = E('img', '', wrap);
    Object.assign(art.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    art.alt = '';
    let boxes = {}, drawn = null, drawnKey = '';
    const build = g => {
      wrap.querySelectorAll('[data-own-box]').forEach(n => n.remove());
      boxes = {};
      (g.boxes || []).forEach(b => {
        const el = E('div', '', wrap);
        el.dataset.ownBox = b.id;
        Object.assign(el.style, { position: 'absolute', left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px', display: 'flex', alignItems: 'center', overflow: 'hidden', borderRadius: (b.radius || 0) + 'px' });
        const kind = KIND(b.field);
        const inner = kind === 'image' ? E('img', '', el) : E('span', '', el);
        if (kind === 'image') { Object.assign(inner.style, { width: '100%', height: '100%', objectFit: 'contain', display: 'block' }); inner.alt = ''; }
        else Object.assign(inner.style, { display: 'block', width: '100%', whiteSpace: 'nowrap', lineHeight: '1.05' });
        boxes[b.id] = { el, inner, kind };
      });
      drawn = g; drawnKey = JSON.stringify(g.boxes || []);
    };
    const fill = (g, s) => {
      if (safeImg(g.image) && art.getAttribute('src') !== g.image) art.src = g.image;
      (g.boxes || []).forEach(b => {
        const x = boxes[b.id]; if (!x) return;
        const read = FIELDS[b.field]; let v = read ? read(s) : '';
        if (x.kind === 'image') { const ok = v && safeImg(v); x.inner.style.visibility = ok ? '' : 'hidden'; if (ok && x.inner.getAttribute('src') !== v) x.inner.src = v; return; }
        if (x.kind === 'color') { x.el.style.background = /^#[0-9a-f]{3,8}$/i.test(v) ? v : 'transparent'; return; }
        if (!v) v = b.empty || '';
        if (b.caps === 'upper') v = v.toUpperCase();
        if (x.inner.textContent !== v) x.inner.textContent = v;
        Object.assign(x.inner.style, { fontFamily: family(g, b.font), fontSize: b.size + 'px', color: b.color, textAlign: b.align, textOverflow: b.fit === 'cut' ? 'ellipsis' : 'clip', overflow: 'hidden' });
        // Shrink to fit: step the size down until the text fits the box (never below a third).
        if (b.fit === 'shrink') { let size = b.size; while (size > b.size / 3 && (x.inner.scrollWidth > b.w + 1 || x.inner.scrollHeight > b.h + 1)) { size -= Math.max(1, Math.round(size * 0.06)); x.inner.style.fontSize = size + 'px'; } }
      });
    };
    const motion = (g, show) => {
      const kind = show ? g.enter : g.exit;
      if (kind === 'cut' || !kind) { wrap.style.transition = 'none'; wrap.style.opacity = show ? '1' : '0'; wrap.style.transform = 'none'; return; }
      const from = { opacity: '0', transform: kind === 'slide' ? 'translateY(40px)' : 'none' }, to = { opacity: '1', transform: 'none' };
      wrap.style.transition = 'none'; Object.assign(wrap.style, show ? from : to);
      void wrap.offsetWidth;
      wrap.style.transition = 'opacity .45s ease, transform .55s cubic-bezier(.2,.8,.2,1)';
      Object.assign(wrap.style, show ? to : from);
    };
    return {
      update(s) {
        const g = get(s); if (!g) { wrap.style.opacity = '0'; return; }
        useFonts(g);
        const first = !drawn;
        if (first || JSON.stringify(g.boxes || []) !== drawnKey) build(g);
        drawn = g;
        if (first) motion(g, true);
        fill(g, s);
      },
      play(s) { const g = get(s); if (g) motion(g, true); },
      leave(s, done) { const g = get(s); if (!g || g.exit === 'cut') return done(); motion(g, false); setTimeout(done, 480); },
    };
  }

  const find = (s, id) => (s.airOwn || []).find(g => g && g.id === id) || null;
  HUD.OWN = { FIELDS, kind: KIND, own, find };

  // The full-screen host: `own:<id>` shows that graphic.
  M.ownslot = (root, id) => own(root, s => find(s, id));

  // overlays/own.html: one graphic by itself (?own=<id>), or the editor's draft (preview pages only).
  let draft = null;
  M.ownpage = root => {
    const part = own(root, s => draft || find(s, Q.get('own')));
    HUD.ownRefresh = () => part.update(HUD.state);
    HUD.ownPlay = () => part.play(HUD.state);
    return part;
  };
  addEventListener('message', e => {
    const d = e.data || {};
    if (e.source !== window.parent || window.parent === window || !/^AIR_OWN_/.test(d.type || '')) return;
    if (Q.get('preview') !== '1' || !Q.get('editorKey') || d.key !== Q.get('editorKey')) return;
    if (d.type === 'AIR_OWN_DRAFT') { draft = d.graphic && typeof d.graphic === 'object' ? d.graphic : null; HUD.ownRefresh && HUD.ownRefresh(); }
    if (d.type === 'AIR_OWN_PLAY') HUD.ownPlay && HUD.ownPlay();
  });
})();
