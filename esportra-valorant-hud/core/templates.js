/* Graphics templates (Air › Graphics › Templates). A template restyles the parts of one graphic:
   position, scale, layer, visibility, opacity, fill, text, border, corners, depth, fixed words and the
   entrance. The graphics keep drawing their own data; this file only sets inline styles on the parts
   listed in GRAPHICS, so a template can never add code or markup to a page.

   State (all set by Air, which validates first):
     airTemplates          [template]   the templates this match uses
     airHudTemplate        id | null    the look for the in-game HUD
     airFullscreenTemplate id | null    the look for the graphic in the full-screen host
     airBrand              { primary, secondary, panel, text, atk, def }  the event's brand kit
   Air's editor previews a draft with postMessage AIR_TEMPLATE_DRAFT (preview pages only). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AirTemplates = api;
})(typeof window === 'object' ? window : globalThis, function () {
  // [id, label, selector, words?] — words: the part is a fixed label whose text a template may replace.
  const FULL = [
    ['background', 'Background', '.scene'], ['glow', 'Glow', '.scene .glow'], ['grain', 'Grain', '.scene .grain'],
    ['lines', 'Lines', '.scene .lines'], ['vignette', 'Vignette', '.scene .vig'], ['corners', 'Corner marks', '.chrome .br'],
    ['crest', 'Crest', '.chrome .clg'], ['topline', 'Top line', '.chrome .l1'], ['toplabel', 'Top label', '.chrome .r1'],
    ['clock', 'Clock', '.chrome .clk'], ['title', 'Title', '.title', 1], ['subtitle', 'Subtitle', '.title-r'],
  ];
  const BAND = [
    ['panel', 'Panel', '.bd'], ['title', 'Title', '.bd-title'], ['captions', 'Small text', '.bd-cap'],
    ['marks', 'Logos', '.bd-mark'], ['vs', 'VS', '.bd-vs'], ['maps', 'Map tiles', '.bd-map'],
    ['mapnames', 'Map names', '.bd-map .mn'], ['boxes', 'Boxes', '.bd-box'], ['scores', 'Scores', '.bd-big, .bd-mid-score, .bd-score, .bd-line'],
  ];
  /** A graphic's parts: the shared ones, with extras added and same-id entries replaced. */
  const withParts = (base, extra) => { const out = base.slice(); extra.forEach(e => { const i = out.findIndex(x => x[0] === e[0]); if (i >= 0) out[i] = e; else out.push(e); }); return out; };
  const GRAPHICS = {
    'map-veto|full': { title: 'Map veto', parts: [...FULL, ['cards', 'Map cards', '.card'], ['stamps', 'Ban stamps', '.stamp', 1], ['decider', 'Decider line', '.cap']] },
    'match-intro|full': { title: 'Match intro', parts: [...FULL, ['sides', 'Team halves', '.side'], ['teamnames', 'Team names', '.side .tn'], ['teamstats', 'Team lines', '.side .ts'], ['logos', 'Logos', '.side .lg'], ['vs', 'VS', '.vs', 1], ['event', 'Event name', '.ev'], ['stage', 'Stage', '.st'], ['maps', 'Map list', '.mp']] },
    'agent-select|full': { title: 'Agent select', parts: [...FULL, ['vs', 'VS', '.vs', 1], ['teamheads', 'Team names', '.th'], ['columns', 'Team columns', '.col'], ['cards', 'Player cards', '.pc']] },
    'map-result|full': { title: 'Map result', parts: [...FULL, ['mapart', 'Map picture', '.bgm'], ['score', 'Score block', '.sc'], ['bignumber', 'Big score', '.sc .big'], ['mvp', 'MVP panel', '.mvp'], ['mvpname', 'MVP name', '.mvp .n'], ['performers', 'Top performers', '.tp']] },
    'series|full': { title: 'Series', parts: [...FULL, ['cards', 'Map cards', '.cd'], ['mapnames', 'Map names', '.cd .mn'], ['results', 'Results', '.cd .res'], ['bars', 'Winner bars', '.cd .bar'], ['live', 'Live tag', '.cd .live', 1]] },
    'halftime|full': { title: 'Halftime', parts: [...FULL, ['score', 'Score', '.score'], ['halves', 'Halves table', '.halves'], ['rounds', 'Round by round', '.tl'], ['note', 'Side switch note', '.note'], ['stats', 'Side stats', '.side']] },
    'standings|full': { title: 'Standings', parts: [...FULL, ['table', 'Table', '.tbl'], ['header', 'Table header', '.tbl .hh'], ['rows', 'Table rows', '.tbl .rw'], ['side', 'MVP race', '.side']] },
    'player-profile|full': { title: 'Player profile', parts: [...FULL, ['wash', 'Colour wash', '.wash'], ['portrait', 'Portrait', '.por'], ['name', 'Name', '.n'], ['info', 'Team line', '.k'], ['stats', 'Stats', '.grid'], ['quote', 'Quote', '.q']] },
    'schedule|full': { title: "Today's schedule", parts: [...FULL, ['list', 'List', '.list'], ['rows', 'Rows', '.list .r'], ['times', 'Times', '.list .tm'], ['labels', 'Labels', '.list .l']] },
    'champion|full': { title: 'Champion', parts: [...FULL, ['kicker', 'Event line', '.k'], ['team', 'Team name', '.t'], ['line', 'Result line', '.s'], ['roster', 'Roster', '.roster']] },
    'cam-grid|full': { title: 'Camera grid', parts: [['wall', 'Camera wall', '.camwall'], ['title', 'Title', '.camwall-title', 1], ['rows', 'Rows', '.camrow'], ['cams', 'Cameras', '.camrow .cam'], ['observed', 'Observed camera', '.cam.observed']] },
    'map-veto|band': { title: 'Map veto', parts: withParts(BAND, [['title', 'Title', '.bd-title', 1], ['labels', 'Action labels', '.bd-vlab'], ['decider', 'Decider label', '.bd-vlab.dec'], ['pickcaps', 'Pick captions', '.bd-cap.top']]) },
    'agent-select|band': { title: 'Agent select', parts: [...BAND, ['teams', 'Team names', '.bd-team'], ['sides', 'Side tags', '.bd-side'], ['agents', 'Agent cards', '.bd-ag'], ['agentnames', 'Player names', '.bd-ag .who'], ['series', 'Series box', '.bd-lser']] },
    'match-intro|band': { title: 'Match intro', parts: [...BAND, ['teamnames', 'Team names', '.bd-tname b'], ['lineup', 'Lineup row', '.bd-lineup'], ['faces', 'Faces', '.bd-face'], ['players', 'Player names', '.bd-lp b']] },
    'map-result|band': { title: 'Map result', parts: [...BAND] },
    'series|band': { title: 'Series', parts: [...BAND] },
    'halftime|band': { title: 'Halftime', parts: [...BAND] },
    'standings|band': { title: 'Standings', parts: [...BAND, ['cells', 'Team cells', '.bd-st']] },
    'player-profile|band': { title: 'Player profile', parts: [...BAND, ['photo', 'Photo', '.bd-pphoto'], ['name', 'Name', '.bd-pname'], ['stats', 'Stats', '.bd-pstats']] },
    'schedule|band': { title: "Today's schedule", parts: withParts(BAND, [['title', 'Title', '.bd-title', 1]]) },
    hud: { title: 'In-game HUD', parts: [
      ['scorebug', 'Scorebug', '.vsb'], ['sbteams', 'Scorebug · teams', '.vsb-team'], ['sbscores', 'Scorebug · scores', '.vsb-score'],
      ['sbround', 'Scorebug · round', '.vsb-round'], ['sbstatus', 'Scorebug · status', '.vsb-status'],
      ['players', 'Player cards', '.pl'], ['playerrows', 'Player card rows', '.pl .pr'], ['playercams', 'Player cameras', '.player-cams'],
      ['killfeed', 'Killfeed', '.kf'], ['killrows', 'Killfeed rows', '.kf .kr'], ['minimap', 'Minimap frame', '.mmf'],
      ['eventbug', 'Event bug', '.eb'], ['seriesmaps', 'Series maps', '.sm'], ['winprob', 'Win probability', '.winp'],
      ['roundhistory', 'Round history', '.rh'], ['ticker', 'Ticker', '.ts'], ['poll', 'Poll', '.pq'], ['observed', 'Observed player', '.ob'],
      ['sponsor', 'Sponsor', '.spn'], ['recap', 'Round recap', '.rr'], ['economy', 'Economy', '.ec'], ['duel', 'Duel', '.du'],
      ['compare', 'Team compare', '.tc'], ['scoreboard', 'Scoreboard', '.st'], ['banner', 'Banners', '.bn'], ['bannerband', 'Banner band', '.bn .band'],
      ['pause', 'Pause box', '.pause'], ['replay', 'Replay tag', '.rp'], ['lowerthird', 'Lower third', '.lt'], ['ltbox', 'Lower third box', '.lt .box'],
    ] },
  };
  const FONTS = { barlow: 'BarlowC', mono: 'JB', montserrat: 'EsportraMontserrat', rajdhani: 'EsportraRajdhani' };
  const POPPINS = { 400: 'PMd', 500: 'PMd', 600: 'PSB', 700: 'PBd', 800: 'PXB', 900: 'PBk' };
  const BRAND = ['primary', 'secondary', 'panel', 'text', 'atk', 'def'];
  const HEX = /^#[0-9a-f]{6}$/i;
  // Entrances animate transform/opacity/clip (not translate), so a part moved by the template keeps its place.
  const DEPTH = { none: 'none', soft: '0 8px 24px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.4)', strong: '0 18px 48px rgba(0,0,0,.65), 0 3px 8px rgba(0,0,0,.5)' };
  const ENTER = {
    rise: [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    slide: [{ transform: 'translateX(-80px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    wipe: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
  };

  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
  /** A colour reference: #rrggbb, brand.<name>, team.a or team.b. */
  function color(v) {
    if (typeof v !== 'string') return null;
    if (HEX.test(v)) return v;
    const m = /^brand\.([a-z]+)$/.exec(v);
    if (m && BRAND.includes(m[1])) return `var(--brand-${m[1]})`;
    if (v === 'team.a' || v === 'team.b') return `var(--team-${v.slice(5)})`;
    return null;
  }
  const withAlpha = (c, a) => (a == null || a >= 1 ? c : `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`);

  /** The inline styles for one part's settings. Anything unknown or out of range is left out. */
  function styles(p) {
    const out = {};
    if (!p || typeof p !== 'object') return out;
    const x = num(p.x, -1920, 1920), y = num(p.y, -1080, 1080), sc = num(p.scale, 0.25, 3);
    if (x || y) out.translate = `${x || 0}px ${y || 0}px`;
    if (sc != null && sc !== 1) out.scale = String(sc);
    const z = num(p.z, -9, 9), op = num(p.opacity, 0, 1), size = num(p.size, 6, 240), sp = num(p.spacing, -0.1, 0.6), rad = num(p.radius, 0, 80);
    if (z != null) out['z-index'] = String(Math.round(z));
    if (p.hidden === true) out.visibility = 'hidden';
    if (op != null) out.opacity = String(op);
    const f = p.fill;
    if (f && typeof f === 'object') {
      const a = color(f.a), b = color(f.b), al = num(f.alpha, 0, 1);
      if (f.kind === 'none') out.background = 'none';
      else if (f.kind === 'solid' && a) out.background = withAlpha(a, al);
      else if (f.kind === 'gradient' && a && b) out.background = `linear-gradient(${num(f.angle, 0, 360) ?? 180}deg, ${withAlpha(a, al)}, ${withAlpha(b, al)})`;
    }
    const c = color(p.color); if (c) { out.color = c; out['-webkit-text-fill-color'] = c; }
    const w = num(p.weight, 400, 900);
    if (p.font === 'poppins') out['font-family'] = POPPINS[w ? Math.round(w / 100) * 100 : 600] + ', sans-serif';
    else if (FONTS[p.font]) out['font-family'] = FONTS[p.font] + ', sans-serif';
    if (w != null) out['font-weight'] = String(Math.round(w / 100) * 100);
    if (size != null) out['font-size'] = size + 'px';
    if (sp != null) out['letter-spacing'] = sp + 'em';
    if (p.caps === 'upper') out['text-transform'] = 'uppercase'; else if (p.caps === 'none') out['text-transform'] = 'none';
    const bd = p.border;
    if (bd && typeof bd === 'object') {
      const bc = color(bd.color), bw = num(bd.width, 0, 16);
      if (bd.sides === 'none') out.border = 'none';
      else if (bc && bw != null && ['all', 'top', 'bottom', 'left', 'right'].includes(bd.sides)) out[bd.sides === 'all' ? 'border' : 'border-' + bd.sides] = `${bw}px solid ${bc}`;
    }
    if (rad != null) out['border-radius'] = rad + 'px';
    if (DEPTH[p.depth]) out['box-shadow'] = DEPTH[p.depth];
    return out;
  }
  const words = v => (typeof v === 'string' && v.length <= 40 && !/[<>]/.test(v) ? v : null);

  function partsOf(graphic) { return (GRAPHICS[graphic] || { parts: [] }).parts; }
  const SET = typeof WeakMap === 'function' ? new WeakMap() : null;

  /** Applies a template's parts inside `root`; parts the template no longer sets go back to their own look. */
  function apply(rootEl, template, graphic) {
    if (!rootEl || !SET) return;
    const parts = template && template.graphic === graphic ? template.parts || {} : {};
    const want = new Map();
    for (const [id, , sel, fixed] of partsOf(graphic)) {
      const p = parts[id]; if (!p) continue;
      const css = styles(p), label = fixed ? words(p.label) : null;
      rootEl.querySelectorAll(sel).forEach(el => { const w = want.get(el) || { css: {}, label: null }; Object.assign(w.css, css); if (label != null) w.label = label; want.set(el, w); });
    }
    // Clear what an earlier template set on parts this one leaves alone.
    rootEl.querySelectorAll('[data-tpl]').forEach(el => { if (!want.has(el)) restore(el); });
    want.forEach((w, el) => {
      const prev = SET.get(el) || { css: [], text: null };
      prev.css.forEach(k => { if (!(k in w.css)) el.style.removeProperty(k); });
      Object.entries(w.css).forEach(([k, v]) => { if (el.style.getPropertyValue(k) !== v || el.style.getPropertyPriority(k) !== 'important') el.style.setProperty(k, v, 'important'); });
      let text = prev.text;
      if (w.label != null) { if (text == null) text = el.textContent; if (el.textContent !== w.label) el.textContent = w.label; }
      else if (text != null) { if (el.textContent !== text) el.textContent = text; text = null; }
      SET.set(el, { css: Object.keys(w.css), text });
      el.setAttribute('data-tpl', '');
    });
  }
  function restore(el) {
    const prev = SET.get(el); if (!prev) { el.removeAttribute('data-tpl'); return; }
    prev.css.forEach(k => el.style.removeProperty(k));
    if (prev.text != null && el.textContent !== prev.text) el.textContent = prev.text;
    SET.delete(el); el.removeAttribute('data-tpl');
  }

  /** Plays each part's entrance (preview Play, and when the full-screen host shows the graphic). */
  function enter(rootEl, template, graphic) {
    if (!rootEl || !template || template.graphic !== graphic || typeof Element === 'undefined' || !Element.prototype.animate) return;
    for (const [id, , sel] of partsOf(graphic)) {
      const e = template.parts && template.parts[id] && template.parts[id].entrance;
      if (!e || !ENTER[e.kind]) continue;
      const ms = num(e.ms, 0, 3000) ?? 600, delay = num(e.delay, 0, 3000) ?? 0;
      rootEl.querySelectorAll(sel).forEach((el, i) => el.animate(ENTER[e.kind], { duration: ms, delay: delay + (e.stagger ? i * 60 : 0), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
    }
  }

  /** The brand kit and team colours as CSS variables on the page. */
  function brand(doc, kit, teams) {
    if (!doc || !doc.documentElement) return;
    const st = doc.documentElement.style, k = kit && typeof kit === 'object' ? kit : {};
    const D = { primary: '#8b7cf6', secondary: '#ffc83d', panel: '#12162f', text: '#ffffff', atk: '#c83452', def: '#169684' };
    BRAND.forEach(n => st.setProperty('--brand-' + n, HEX.test(k[n] || '') ? k[n] : D[n]));
    (teams || []).slice(0, 2).forEach((t, i) => st.setProperty('--team-' + 'ab'[i], HEX.test(t && t.color || '') ? t.color : i ? '#e0364f' : '#22b8c9'));
  }

  /** The graphic a page shows: the full-screen host's current one, or the HUD. */
  const graphicOf = (screen, style) => (screen ? `${screen}|${style === 'band' ? 'band' : 'full'}` : 'hud');

  return { GRAPHICS, FONTS: [...Object.keys(FONTS), 'poppins'], BRAND, ENTRANCES: Object.keys(ENTER), styles, apply, enter, brand, graphicOf, partsOf };
});
