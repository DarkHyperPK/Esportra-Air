/* Esportra Valorant broadcast HUD engine.
   Overlays: <body data-modules="scorebug,players,..."> + this script. State comes from, in order:
   ?ws=ws://host:port (live data feed)  >  control panel (BroadcastChannel/localStorage)  >  HUD_DEFAULT.
   ?demo=1 runs a local round simulation. ?bg=1 shows a map backdrop for positioning. */
(function () {
  const CAT = window.VCAT, KEY = 'esportra-hud:v1', Q = new URLSearchParams(location.search);
  const clone = o => JSON.parse(JSON.stringify(o));
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  function merge(a, b) { for (const k in b) { if (isObj(b[k]) && isObj(a[k])) merge(a[k], b[k]); else a[k] = b[k]; } return a; }

  const PREVIEW = Q.get('preview') === '1';
  const EMPTY_PREVIEW = PREVIEW && Q.get('empty') === '1';
  // Match data › Show text (17 Nov): Air's preview of Starting soon / Break / Ending, where the message and the
  // countdown are edited on the graphic itself. Preview pages only, with Air's one-off key; never an output.
  const SHOW_EDIT = PREVIEW && Q.get('showEdit') === '1' && !!Q.get('editorKey');
  const SAMPLE_MOTION = PREVIEW && !EMPTY_PREVIEW && Q.get('sampleMotion') === '1';
  let previewPatch = {};
  // A template being edited or previewed in Air ({ template, brand }); never on an OBS output.
  let tplDraft = null;
  // A moment the template editor asks to see (a banner, the scoreboard, Break…); preview pages only.
  let tplSample = null;
  const SAMPLES = {
    live: v => { v.round = { ...v.round, phase: 'live' }; },
    spike: v => { v.round = { ...v.round, phase: 'planted', endsAt: Date.now() + 26000 }; v.show = { ...v.show, spikeTimer: true }; },
    pause: v => { v.airPause = { kind: 'technical', startedAt: Date.now() - 134000 }; },
    timeout: v => { v.airPause = { kind: 'timeout', team: 0, startedAt: Date.now() - 21000 }; },
    banner: v => { v.banner = { ...v.banner, type: 'ace', team: 1, player: 0, ts: Date.now() - 100, hold: 3600000 }; },
    poll: v => { v.show = { ...v.show, poll: true }; },
    scoreboard: v => { v.show = { ...v.show, scoreboard: true }; },
    economy: v => { v.show = { ...v.show, economy: true }; v.round = { ...v.round, phase: 'buy' }; },
    recap: v => { v.show = { ...v.show, roundRecap: true }; v.round = { ...v.round, phase: 'end' }; },
    duel: v => { v.show = { ...v.show, duel: true }; },
    compare: v => { v.show = { ...v.show, teamCompare: true }; },
    lowerthird: v => { v.show = { ...v.show, lowerThird: true }; v.lowerThird = { ...v.lowerThird, kind: 'caster' }; },
    sponsor: v => { v.show = { ...v.show, lowerThird: true }; v.lowerThird = { kind: 'generic', title: (v.sponsors && v.sponsors[0] && v.sponsors[0].name) || 'SPONSOR', sub: 'Presented by', team: -1, player: 0 }; },
    starting: v => { v.holding = { ...v.holding, mode: 'starting' }; },
    brb: v => { v.holding = { ...v.holding, mode: 'brb' }; },
    ending: v => { v.holding = { ...v.holding, mode: 'ending' }; },
  };
  try { if(Q.has('hudSettings'))previewPatch=window.AirHudSettings.validate(JSON.parse(Q.get('hudSettings'))); } catch (_) { /* Invalid preview settings never enter the match state. */ }
  const previewSettings = state => {
    const view=merge(clone(state),previewPatch),modules=(document.body.dataset.modules||'').split(',').map(name=>name.trim()).filter(Boolean);
    // Dedicated screens are selected by the producer; Match HUD switches only govern the composite HUD.
    if((PREVIEW||OUTPUT||Q.get('screen')==='1')&&modules.length===1&&modules[0]!=='ingame'){
      const gates={scorebug:'scorebug',players:'players',observed:'observed',minimap:'minimap',economy:'economy',scoreboard:'scoreboard',lowerthird:'lowerThird',replay:'replay',ticker:'ticker',roundhistory:'roundHistory',winprob:'winProb',spiketimer:'spikeTimer',moments:'moments',sponsor:'sponsor',eventbug:'eventBug',poll:'poll',duel:'duel',teamcompare:'teamCompare',roundrecap:'roundRecap',playercams:'playerCams',killfeed:'killfeed'};
      const gate=gates[modules[0]];
      if(gate){view.show={...view.show,scoreboard:false,teamCompare:false,duel:false,roundRecap:false,economy:false,[gate]:true};}
    }
    // Air's Adjust preview (never an OBS output): the scorebug and pause looks being edited, and a sample pause.
    if(!OUTPUT&&Q.get('screen')==='1'){
      try{const look=JSON.parse(Q.get('look')||'null');const t=look&&look.timer;const n=(v,lo,hi)=>Number.isFinite(+v)?Math.max(lo,Math.min(hi,+v)):undefined;
        if(t)view.layout={...view.layout,timerWindow:{dx:n(t.dx,-200,200)??0,width:n(t.width,100,240)??160,plate:/^#[0-9a-f]{6}$/i.test(t.plate||'')?t.plate:'#17181e'}};
        if(look&&(look.pause==='box'||look.pause==='panel'||look.pause==='bar'))view.layout={...view.layout,pauseStyle:look.pause};}catch(_){/* ignore a malformed preview look */}
      if(Q.get('samplePause')==='1')view.airPause={kind:'technical',startedAt:Date.now()-134000};
    }
    if(!OUTPUT&&PREVIEW&&tplSample&&SAMPLES[tplSample])SAMPLES[tplSample](view);
    // A HUD template's timer window, while it is previewed.
    const tw=tplDraft&&tplDraft.template&&tplDraft.template.timer;
    if(!OUTPUT&&tw&&typeof tw==='object')view.layout={...view.layout,timerWindow:tw};
    // A brand kit being previewed: its Primary is the event colour the graphics use.
    const pb=tplDraft&&tplDraft.brand&&tplDraft.brand.primary;
    if(!OUTPUT&&/^#[0-9a-f]{6}$/i.test(pb||''))view.event={...view.event,accent:pb};
    return view;
  };
  const OUTPUT = /^\/o\/([0-9a-f-]{36})$/i.exec(location.pathname)?.[1] || null;
  if (!OUTPUT && SAMPLES[Q.get('sample')]) tplSample = Q.get('sample');
  try { if (!OUTPUT && Q.has('template')) tplDraft = { template: JSON.parse(Q.get('template')), brand: JSON.parse(Q.get('brand') || 'null') }; } catch (_) { tplDraft = null; }
  const MATCH = PREVIEW ? null : Q.get('match') || (OUTPUT ? 'MAIN' : null); // previews are isolated from live rooms and browser storage
  const previewNow = Date.now();
  const HUD = window.HUD = { subs: [], mods: [], events: [], now: PREVIEW && !SAMPLE_MOTION ? () => previewNow : () => Date.now(), preview: PREVIEW, demo: !PREVIEW && Q.has('demo'), live: !PREVIEW && !Q.has('demo') && !MATCH, match: MATCH };
  if (!PREVIEW) HUD.now = () => {
    const clock = HUD.state?.simulation;
    return clock && Number.isFinite(clock.epoch) && Number.isFinite(clock.positionMs)
      ? clock.epoch + clock.positionMs + (clock.playing ? Math.max(0, Date.now() - clock.wallAt) * clock.speed : 0)
      : Date.now();
  };
  function readStore() { try { const s = localStorage.getItem(KEY); if (s) return merge(clone(HUD_DEFAULT), JSON.parse(s)); } catch (e) {} return clone(HUD_DEFAULT); }
  const liveBase = () => clone(typeof HUD_CLEAN !== 'undefined' ? HUD_CLEAN : HUD_DEFAULT);
  let sourceState = MATCH || EMPTY_PREVIEW ? liveBase() : PREVIEW || HUD.demo ? clone(HUD_DEFAULT) : readStore();
  HUD.state = previewSettings(sourceState);
  let receivedMatch = false;
  let raw = '', bc = null;
  try { bc = new BroadcastChannel('esportra-hud'); } catch (e) {}
  HUD.commit = function (s, opts = {}) {
    sourceState = s;
    HUD.state = previewSettings(s);
    if (MATCH && !opts.local && !opts.remote) HUD.send({ type: 'set', state: s });
    if (HUD.live && !opts.local) {
      raw = JSON.stringify(s);
      try { localStorage.setItem(KEY, raw); } catch (e) {}
      if (bc) bc.postMessage(s);
    }
    HUD.subs.forEach(f => f(HUD.state));
  };
  HUD.set = function (patch) { HUD.commit(merge(clone(HUD.state), typeof patch === 'function' ? patch(clone(HUD.state)) : patch)); };
  HUD.reset = () => HUD.commit(clone(HUD_DEFAULT));
  HUD.resetClean = () => HUD.commit(clone(typeof HUD_CLEAN !== 'undefined' ? HUD_CLEAN : HUD_DEFAULT));
  HUD.on = f => { HUD.subs.push(f); f(HUD.state); };
  function receive(s, opts = {}) { if(MATCH){receivedMatch=true;document.getElementById('hud')?.style.setProperty('visibility','visible');document.getElementById('waiting-match-data')?.remove();} sourceState = merge(MATCH?liveBase():clone(HUD_DEFAULT), s); HUD.state = previewSettings(sourceState); HUD.subs.forEach(f => f(HUD.state, opts)); }
  if (HUD.live) {
    if (bc) bc.onmessage = e => receive(e.data);
    addEventListener('storage', e => { if (e.key === KEY && e.newValue) { raw = e.newValue; receive(JSON.parse(e.newValue)); } });
    setInterval(() => { try { const s = localStorage.getItem(KEY); if (s && s !== raw) { raw = s; receive(JSON.parse(s)); } } catch (e) {} }, 800);
  }
  // RFC 7386 merge patch: objects merge, arrays replace, null deletes
  const mergePatch = HUD.mergePatch = (a, p) => { if (!isObj(p)) return p; a = isObj(a) ? a : {}; for (const k in p) { if (p[k] === null) delete a[k]; else a[k] = mergePatch(a[k], p[k]); } return a; };
  if (MATCH) (function conn() {
    const base = Q.get('server') || ((location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.host || 'localhost:5300'));
    const role = Q.get('role') || (document.body && document.body.dataset.role) || 'overlay';
    const ws = new WebSocket(`${base}/ws?${OUTPUT ? 'output=' + encodeURIComponent(OUTPUT) : 'match=' + encodeURIComponent(MATCH)}&role=${role}${Q.get('key') ? '&key=' + encodeURIComponent(Q.get('key')) : ''}`);
    let v = 0; HUD.send = m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
    let framePending = false;
    const renderTimer = setInterval(() => {
      if (framePending || ws.readyState !== 1 || !HUD.connected) return;
      framePending = true; requestAnimationFrame(() => { framePending = false; HUD.send({ type: 'rendered', v }); });
    }, 1000);
    ws.onopen = () => { HUD.connected = true; HUD.subs.forEach(f => f(HUD.state)); };
    ws.onmessage = e => { const m = JSON.parse(e.data);
      if (m.type === 'snapshot') { v = m.v; receive(m.state, {snapshot:true}); }
      else if (m.type === 'patch') { if (m.v !== v + 1) return HUD.send({ type: 'resync' }); v = m.v; receive(mergePatch(clone(sourceState), m.patch)); }
      else if (m.type === 'event') HUD.events.forEach(f => f(m.event));
      else if (m.type === 'error') console.warn('Esportra server:', m.message); };
    ws.onclose = () => { clearInterval(renderTimer); HUD.connected = false; HUD.subs.forEach(f => f(HUD.state)); setTimeout(conn, 1500); };
  })();
  if (!PREVIEW && Q.get('ws')) (function conn() {
    const ws = new WebSocket(Q.get('ws'));
    ws.onmessage = e => { try { const m = JSON.parse(e.data); if (m.state) receive(m.state); else if (m.patch) receive(merge(clone(HUD.state), m.patch)); else receive(m); } catch (err) {} };
    ws.onclose = () => setTimeout(conn, 2000);
  })();

  // ───── helpers ─────
  const E = HUD.el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const agent = HUD.agent = n => n && CAT.agents[String(n).toUpperCase()];
  const weapon = HUD.weapon = n => n && CAT.weapons[String(n).toUpperCase()];
  const mapA = HUD.mapA = n => n && CAT.maps[String(n).toUpperCase()];
  const armorIcon = a => a >= 50 ? CAT.gear['HEAVY ARMOR'] : a > 0 ? CAT.gear['LIGHT ARMOR'] : '';
  const ink = HUD.ink = hex => { const h = (hex || '#ffffff').replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return .2126 * r + .7152 * g + .0722 * b > .42 ? '#101014' : '#ffffff'; };
  const tv = HUD.tv = (el, s, i) => { const c = s.teams[i].color; el.style.setProperty('--c', c); el.style.setProperty('--ci', ink(c)); return el; };
  const fmt = HUD.fmt = sec => { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const fmtHundredths = sec => { const value = Math.max(0, Math.ceil(Math.round(sec * 1000) / 10)); return `${String(Math.floor(value / 100)).padStart(2, '0')}:${String(value % 100).padStart(2, '0')}`; };
  const money = n => Number(n || 0).toLocaleString('en-US');
  // A picture that failed to load is not asked for again for a minute, so a missing file is not
  // requested on every redraw (Air serves agent and map art from this PC at /art/).
  const failedArt = new Map();
  document.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.src) failedArt.set(t.src, Date.now()); }, true);
  const artFailed = url => { const at = failedArt.get(new URL(url, location.href).href); return at !== undefined && Date.now() - at < 60000; };
  const setImg = (im, url) => { if (!url || artFailed(url)) { im.style.visibility = 'hidden'; return; } im.style.visibility = ''; if (im.dataset.u !== url) { im.dataset.u = url; im.src = url; } };
  // A player photo from the producer's lineup (served by Air's engine). Only its own asset paths are trusted.
  const photoOk = HUD.photoOk = v => typeof v === 'string' && /^\/air-assets\/[0-9a-f-]{36}$/i.test(v);
  const txt = (e, v) => { v = String(v); if (e.textContent !== v) e.textContent = v; };
  // Updates `parent` to match `html` in place: unchanged nodes (and their pictures and running
  // animations) are kept, only what differs is changed. Graphics that redraw on live data use this so
  // nothing blinks or replays its entrance when an unrelated value changes. A picture that failed and
  // fell back keeps its fallback until its source really changes.
  // A part a template styles (core/templates.js) keeps the template's inline properties, its marker and
  // its words through a redraw: stripping them and letting the template put them back a frame later was
  // the flash on every veto update.
  const tplOwned = el => (el.hasAttribute && el.hasAttribute('data-tpl') && window.AirTemplates && window.AirTemplates.owned ? window.AirTemplates.owned(el) : null);
  const scratch = document.createElement('i');
  const withOwned = (style, own) => {
    scratch.setAttribute('style', style || '');
    Object.entries(own.css).forEach(([k, v]) => scratch.style.setProperty(k, v, 'important'));
    return scratch.getAttribute('style') || '';
  };
  const morphAttrs = (a, b) => {
    if (a.tagName === 'IMG' && a.dataset.failed && a.dataset.failed === b.getAttribute('src')) return;
    const own = tplOwned(a);
    for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && !(own && (name === 'data-tpl' || name === 'style'))) a.removeAttribute(name);
    for (const { name, value } of [...b.attributes]) {
      const want = own && name === 'style' ? withOwned(value, own) : value;
      if (a.getAttribute(name) !== want) a.setAttribute(name, want);
    }
    if (own && !b.hasAttribute('style') && Object.keys(own.css).length) { const want = withOwned('', own); if (a.getAttribute('style') !== want) a.setAttribute('style', want); }
  };
  const morphKids = (a, b) => {
    const an = [...a.childNodes], bn = [...b.childNodes];
    bn.forEach((y, i) => {
      const x = an[i];
      if (!x) { a.appendChild(y); return; }
      if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y, x); return; }
      if (y.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; return; }
      morphAttrs(x, y);
      const own = tplOwned(x);
      if (own && own.text) return;
      if (x.innerHTML !== y.innerHTML) morphKids(x, y);
    });
    for (let i = an.length - 1; i >= bn.length; i--) a.removeChild(an[i]);
  };
  const morph = HUD.morph = (parent, html) => { const t = document.createElement('template'); t.innerHTML = html; morphKids(parent, t.content); };
  /** A picture that fails shows its fallback once; the swap is remembered so a redraw does not retry it. */
  const fallbackOnError = root => root.querySelectorAll('img[data-fallback]').forEach(im => { if (im.onerror) return; im.onerror = () => { im.onerror = null; im.dataset.failed = im.getAttribute('src'); im.src = im.dataset.fallback; im.classList.add('fallback'); }; });
  const escH = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const logoOk = v => typeof v === 'string' && /^(\/air-assets\/[0-9a-f-]{36}|https:\/\/[^\s"'<>]+|\.\.\/[^\s"'<>]+)$/i.test(v);
  /** A team's logo as markup: its picture, or its tag on its colour. */
  const teamMark = (T, size) => logoOk(T.logo) ? `<img class="lg" src="${escH(T.logo)}" alt="" style="width:${size}px;height:${size}px">`
    : `<span class="lg mono-logo" style="width:${size}px;height:${size}px;--c:${escH(T.color)};font-size:${Math.round(size * .34)}px">${escH(T.tag)}</span>`;
  const eventAccent = s => (/^#[0-9a-f]{6}$/i.test(s.event && s.event.accent || '') ? s.event.accent : '#ffb22e');
  /**
   * The veto as the format's steps: done steps from the room's veto, then what comes next. The first
   * open step is "now" while the veto has started and isn't finished. Teams alternate from the team
   * that acted first (team A when nothing has happened yet).
   */
  const VETO_ORDER = { 1: ['ban', 'ban', 'ban', 'ban', 'ban', 'ban', 'decider'], 3: ['ban', 'ban', 'pick', 'pick', 'ban', 'ban', 'decider'], 5: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick', 'decider'] };
  /**
   * The veto's steps in order: done ones, then the ones still to come. `order` is the order this match's veto
   * follows (Esportra's custom order, [{action, team}]); without it, the best-of's usual order. `turn`
   * ({team, action, endsAt}) says whose turn it is; without it the first open step is "now" only mid-veto.
   * While a team chooses the side of a picked map, that pick carries `sideBy`. `first` is the team that acts
   * first in the usual order (Air's Who starts), used until the veto has its first step.
   */
  const vetoSteps = HUD.vetoSteps = (veto, bestOf, order, turn, first0) => {
    const done = Array.isArray(veto) ? veto : [];
    const custom = Array.isArray(order) && order.length >= done.length && order.length > 0 && order.every(o => o && ['ban', 'pick', 'decider'].includes(o.action));
    const seq = custom ? order : (VETO_ORDER[bestOf] || VETO_ORDER[3]).map(action => ({ action }));
    // Esportra's own order names teams relative to the team acting first (T1 = 0, T2 = 1), not as team A/B.
    const first = done[0] && (done[0].team === 0 || done[0].team === 1) ? (custom && seq[0] && seq[0].team === 1 ? 1 - done[0].team : done[0].team) : first0 === 1 ? 1 : 0;
    const choosingSide = turn && turn.action === 'pick_side' && (turn.team === 0 || turn.team === 1);
    const steps = done.map((v, i) => ({ ...v, i, state: 'done' }));
    const last = steps[steps.length - 1];
    if (choosingSide && last && last.action === 'pick' && !last.side) last.sideBy = turn.team;
    // A veto entered in Air has no turn from Esportra: a pick or the decider without its side is still owed it,
    // by the other team after a pick and, on the decider, as Esportra does (best of 1 or 3: the team that went first; best of 5: the other).
    else if (!turn && last && (last.action === 'pick' || last.action === 'decider') && !last.side) last.sideBy = last.action === 'pick' ? 1 - last.team : bestOf === 5 ? 1 - first : first;
    for (let i = done.length; i < seq.length; i++) {
      const o = seq[i], team = o.action === 'decider' ? -1 : (o.team === 0 || o.team === 1 ? (o.team === 0 ? first : 1 - first) : (first + i) % 2);
      const now = i === done.length && (turn ? !(choosingSide && last && last.sideBy !== undefined) : done.length > 0 && !(last && last.sideBy !== undefined));
      steps.push({ i, action: o.action, team, state: now ? 'now' : 'next' });
    }
    return steps;
  };
  /** The veto's caption: the coin toss, the step being made and its time left, or complete. */
  const vetoCaption = HUD.vetoCaption = (s, steps, clock = true) => {
    const toss = s.vetoToss;
    if (toss && toss.pending) return toss.winner === 0 || toss.winner === 1 ? `COIN TOSS   ·   ${s.teams[toss.winner].tag} WON` : 'COIN TOSS';
    const doneN = steps.filter(x => x.state === 'done').length;
    if (doneN >= steps.length) return 'VETO COMPLETE';
    const t = s.vetoTurn, left = clock && t && t.endsAt ? Math.max(0, Math.ceil((t.endsAt - HUD.now()) / 1000)) : null;
    const side = steps.find(x => x.sideBy !== undefined);
    const what = side ? `${s.teams[side.sideBy].tag} CHOOSING SIDE ON ${side.map}` : `STEP ${doneN + 1} OF ${steps.length}`;
    return left === null ? what : `${what}   ·   ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  };
  /** A player in agent select: no agent yet, choosing (hovering an agent), or locked in. Without the game's flag, an agent counts as locked. */
  const lockState = HUD.lockState = p => (!p || !p.agent ? 'empty' : p.locked === false ? 'choosing' : 'locked');
  const timeLeft = HUD.timeLeft = r => r.endsAt ? Math.max(0, (r.endsAt - HUD.now()) / 1000) : (r.remaining || 0);
  // Align CSS motion once per plant; the compositor keeps it smooth between HUD ticks.
  const pulseSpike = (el, round) => {
    const deadline = String(round.endsAt || 'remaining');
    if (el.dataset.spikeDeadline === deadline) return;
    const elapsed = Math.max(0, 45000 - timeLeft(round) * 1000);
    el.style.setProperty('--spike-delay', -(elapsed % 1000) + 'ms');
    el.dataset.spikeDeadline = deadline;
  };
  const need = s => Math.ceil((s.event.bestOf || 1) / 2);
  const P = (s, tp) => s.players[tp[0]] && s.players[tp[0]][tp[1]];
  function logo(team, size, parent, cls = '') {
    if (team.logo) { const im = E('img', 'lg ' + cls, parent); im.src = team.logo; im.style.width = im.style.height = size + 'px'; return im; }
    const d = E('div', 'lg mono-logo ' + cls, parent, team.tag); d.style.width = d.style.height = size + 'px'; d.style.setProperty('--c', team.color); d.style.fontSize = Math.round(size * .34) + 'px'; return d;
  }
  const SPIKE = (c = '#e0445e', w = 24) => `<svg width="${w}" height="${w * 1.15}" viewBox="-13 -15 26 30"><path d="M0 -15 L13 -7.5 L13 7.5 L0 15 L-13 7.5 L-13 -7.5 Z" fill="${c}"/><path d="M0 -7 L6 0 L0 7 L-6 0 Z" fill="#fff"/></svg>`;
  const HS = `<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="2.6" fill="#e0445e"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5" stroke="#fff" stroke-width="2"/></svg>`;
  HUD.status = function (s) {                     // map point / match point / overtime
    const [a, b] = s.teams.map(t => t.score), ot = a >= 12 && b >= 12;
    for (const i of [0, 1]) { const me = i ? b : a, op = i ? a : b;
      if ((me === 12 && op < 12) || (ot && me - op === 1)) return { team: i, text: (s.teams[i].series >= need(s) - 1 ? 'MATCH POINT ' : 'MAP POINT ') + s.teams[i].tag }; }
    return ot ? { team: -1, text: 'OVERTIME' } : null;
  };
  const ABILITY_ICONS = {};
  Object.values(CAT.agents).forEach(ag => { (ag.ab || []).forEach(([name, url]) => { if (name) ABILITY_ICONS[name.toUpperCase()] = url; }); });
  const chargeCount = (p, k) => {
    if (!Array.isArray(p.charges) || (p.puuid && !p.chargesKnown)) return null;
    return Math.max(0, Math.min(16, Math.floor(Number(p.charges[k]) || 0)));
  };
  const chargeDots = count => count === null ? '' : count ? '<i></i>'.repeat(count) : '<i class="e"></i>';
  const abilityDots = (p, k) => p.abilitiesKnown && !p.chargesKnown ? `<span style="font-size:8px" title="Ability availability">${p.abilityAvailability?.[k] ? 'READY' : 'OFF'}</span>` : chargeDots(chargeCount(p, k));
  const knownHealth = p => !p.alive ? 0 : p.puuid && !p.hpKnown ? null : Math.max(0, Math.min(100, Number(p.hp) || 0));
  const vis = HUD.vis = {
    economy: s => s.show.economy === true || (s.show.economy === 'auto' && s.round.phase === 'buy'),
    focused: s => s.show.scoreboard || s.show.teamCompare || s.show.duel,
    players: s => s.show.players && !vis.economy(s) && !vis.focused(s) && !vis.recap(s),
    observed: s => s.show.observed && !vis.economy(s) && !vis.focused(s) && s.round.phase !== 'buy' && !vis.recap(s),
    recap: s => !vis.focused(s) && (s.show.roundRecap === true || (s.show.roundRecap === 'auto' && s.round.phase === 'end')) && s.rounds.length > 0,
    killfeed: s => s.show.killfeed && !vis.focused(s),
  };
  function chrome(root, right) {
    const c = E('div', 'chrome', root);
    [[48, 48, 'left', 'top'], [1836, 48, 'right', 'top'], [48, 996, 'left', 'bottom'], [1836, 996, 'right', 'bottom']].forEach(([x, y, h, v]) => {
      const b = E('div', 'br', c); b.style.cssText = `left:${x}px;top:${y}px;border-${h}-width:2px;border-${v}-width:2px`; });
    const lg = E('img', 'clg', c); lg.src = '../core/brand/mark-44.png';
    const l1 = E('div', 'l1 mono', c), r1 = E('div', 'r1 mono', c, right || ''), clk = E('div', 'clk mono', c);
    HUD.on(s => txt(l1, `ESPORTRA   /   ${s.event.stage}`));
    setInterval(() => { const d = new Date(); clk.textContent = d.toTimeString().slice(0, 8) + '  ' + 'LIVE'; }, 500);
    return { c, r1 };
  }
  let GRAIN = null;
  function sceneBg(root) {
    const sc = E('div', 'scene', root); E('div', 'glow', sc);
    if (!GRAIN) { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), d = g.createImageData(256, 256);
      for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 34; } g.putImageData(d, 0, 0); GRAIN = c.toDataURL(); }
    const gr = E('div', 'grain', sc); gr.style.backgroundImage = `url(${GRAIN})`;
    return sc;
  }
  function sceneFx(sc) { E('div', 'lines', sc); E('div', 'vig', sc); }
  // Shared with core/postgame.js so its scenes use the same backdrop and frame.
  HUD.sceneBg = sceneBg; HUD.chrome = chrome; HUD.sceneFx = sceneFx;
  /** The map record Air sent (state.airRecord: the map the producer picked), applied over the room's live data,
      so Map result and Map breakdown can show map 1 while map 2 is live. Without a record the live data stays. */
  const withRecord = s => {
    const R = s.airRecord;
    if (!R || !Array.isArray(R.players) || !Array.isArray(R.teams) || !(R.map > 0)) return s;
    const v = { ...s, map: { ...s.map, number: R.map, name: R.name || s.map.name },
      teams: s.teams.map((t, i) => ({ ...t, ...(R.teams[i] || {}), score: R.score[i] })),
      players: s.players.map((ps, i) => (R.players[i] || []).map((p, j) => ({ ...(ps[j] || {}), ...p, acs: null, hs: p.hsPct }))),
      teamStats: (R.perf || []).map(x => ({ firstKills: x.firstKills, clutches: x.clutches, plants: x.plants, defuses: x.defuses })) };
    if (Array.isArray(R.rounds)) { v.rounds = R.rounds; if (Array.isArray(R.firstSide)) v.firstSide = R.firstSide; }
    return v;
  };
  /** "Presented by" for a sponsor space (Air's sponsor spaces), bottom right of a full-screen scene. */
  const presented = (root) => { const el = E('div', 'presented mono', root);
    return (s, space) => { const x = s.airSpaces && s.airSpaces[space]; el.style.display = x && x.name ? '' : 'none'; if (!x || !x.name) return;
      el.innerHTML = `PRESENTED BY ${logoOk(x.logo) ? `<img src="${escH(x.logo)}" alt="${escH(x.name)}">` : `<b>${escH(x.name)}</b>`}`; }; };
  function toggle(el, on) { el.classList.toggle('on', !!on); }
  // scenes only rebuild when the data they show changes (score edits etc. don't replay entrances)
  const same = (o, s) => { const k = JSON.stringify([s.event, s.teams, s.players.map(t => t.map(p => [p.name, p.agent, p.k, p.d, p.a, p.acs, p.adr, p.hs])), s.registeredRoster, s.map, s.series, s.veto, s.bracket, s.standings, s.casters, s.schedule, s.holding, s.rounds, s.firstSide, s.teamStats, s.champion, Q.get('mode')]);
    if (o._k === k) return true; o._k = k; return false; };

  // ───── modules ─────
  const M = HUD.modules = {};

  // Scorebug (approved mock, 13 Nov): one flat charcoal plate built around the game's own round timer.
  // The centre is an open window over the timer Valorant draws at the top; while the spike is planted the
  // game blanks its timer and the window shows the beating spike and our countdown. Each half carries its
  // side's colour (teal defence, crimson attack) in a slanted panel behind the score. Map wins are
  // diamonds in small tabs. layout.timerWindow { dx, width, plate } lines the window up with the game.
  const SB_SIDE = { DEF: [22, 150, 132], ATK: [200, 52, 82] };
  const sbRgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const sbShade = (hex, f) => { const h = String(hex || '#17181e').replace('#', ''); const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16) || 0x17181e;
    return '#' + [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f)))).map(v => v.toString(16).padStart(2, '0')).join(''); };
  const sbWindow = s => { const w = (s.layout && s.layout.timerWindow) || {}; const num = (v, lo, hi, d) => Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : d;
    // The side colours come from the event's brand kit (state.airBrand), teal and crimson by default.
    const rgb = v => /^#[0-9a-f]{6}$/i.test(v || '') ? [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16)) : null, kit = s.airBrand || {};
    return { dx: num(w.dx, -200, 200, 0), hw: num(w.width, 100, 240, 160) / 2, plate: /^#[0-9a-f]{6}$/i.test(w.plate || '') ? w.plate : '#17181e', def: rgb(kit.def) || SB_SIDE.DEF, atk: rgb(kit.atk) || SB_SIDE.ATK }; };
  function sbPlate(sl, sr, planted, wins, needed, win) {
    const SIDE = { DEF: win.def, ATK: win.atk }, L = SIDE[sl] || win.def, R = SIDE[sr] || win.atk, cx = 380, l = cx - win.hw, r = cx + win.hw, lb = l + 14, rb = r - 14;
    const top = sbShade(win.plate, 1.1), mid = win.plate, bot = sbShade(win.plate, .86);
    const dia = (x, on) => `<path d="M${x} 77 l5 5 l-5 5 l-5 -5 Z" fill="${on ? '#fff' : 'none'}" stroke="#fff" stroke-width="1.6"/>`;
    const dias = (from, won) => needed > 1 ? Array.from({ length: needed }, (_, i) => dia(from + i * 18 - (needed - 2) * 9, i < won)).join('') : '';
    return `<svg viewBox="0 0 760 112" aria-hidden="true">
      <defs>
        <linearGradient id="vsbGL" x1="0" x2="1"><stop offset="0" stop-color="${sbRgba(L, 0)}"/><stop offset=".45" stop-color="${sbRgba(L, .38)}"/><stop offset="1" stop-color="${sbRgba(L, .92)}"/></linearGradient>
        <linearGradient id="vsbGR" x1="1" x2="0"><stop offset="0" stop-color="${sbRgba(R, 0)}"/><stop offset=".45" stop-color="${sbRgba(R, .38)}"/><stop offset="1" stop-color="${sbRgba(R, .92)}"/></linearGradient>
        <linearGradient id="vsbBL" x1="0" x2="1"><stop offset="0" stop-color="${sbRgba(L, 0)}"/><stop offset="1" stop-color="${sbRgba(L, 1)}"/></linearGradient>
        <linearGradient id="vsbBR" x1="1" x2="0"><stop offset="0" stop-color="${sbRgba(R, 0)}"/><stop offset="1" stop-color="${sbRgba(R, 1)}"/></linearGradient>
        <linearGradient id="vsbPL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${bot}"/></linearGradient>
        <linearGradient id="vsbLIT" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,255,255,.20)"/><stop offset=".42" stop-color="rgba(255,255,255,0)"/><stop offset="1" stop-color="rgba(0,0,0,.32)"/></linearGradient>
        <linearGradient id="vsbSPK" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e1f35"/><stop offset="1" stop-color="#3a0b16"/></linearGradient>
        <radialGradient id="vsbRL" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="${sbRgba(L, .85)}"/><stop offset="1" stop-color="${sbRgba(L, 0)}"/></radialGradient>
        <radialGradient id="vsbRR" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="${sbRgba(R, .85)}"/><stop offset="1" stop-color="${sbRgba(R, 0)}"/></radialGradient>
        <filter id="vsbDrop" x="-10%" y="-40%" width="120%" height="200%"><feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#000" flood-opacity=".55"/><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity=".5"/></filter>
        <filter id="vsbSoft" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
        <filter id="vsbGlint" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4"/></filter>
        <clipPath id="vsbCL"><path d="M0 0 H${l} L${lb} 74 H18 L0 56 Z"/></clipPath>
        <clipPath id="vsbCR"><path d="M${r} 0 H760 V56 L742 74 H${rb} Z"/></clipPath>
      </defs>
      <g filter="url(#vsbDrop)">
        <path d="M0 0 H${l} L${lb} 74 H18 L0 56 Z" fill="url(#vsbPL)"/>
        <path d="M${r} 0 H760 V56 L742 74 H${rb} Z" fill="url(#vsbPL)"/>
        ${needed > 1 ? `<path d="M${l - 104} 74 H${l - 32} L${l - 40} 92 H${l - 96} Z" fill="url(#vsbPL)"/><path d="M${r + 32} 74 H${r + 104} L${r + 96} 92 H${r + 40} Z" fill="url(#vsbPL)"/>` : ''}
        <path d="M${lb + 8} 74 H${rb - 8} L${rb - 18} 96 H${lb + 18} Z" fill="url(#vsbPL)"/>
        ${planted ? `<path d="M${l} 0 H${r} L${rb} 74 H${lb} Z" fill="url(#vsbSPK)"/>` : ''}
      </g>
      <g clip-path="url(#vsbCL)"><ellipse cx="${l - 68}" cy="38" rx="96" ry="44" fill="url(#vsbRL)" opacity=".7" filter="url(#vsbSoft)"/>
        <path d="M${l - 150} 0 H${l} L${lb} 74 H${l - 136} Z" fill="url(#vsbGL)"/><path d="M${l - 150} 0 H${l} L${lb} 74 H${l - 136} Z" fill="url(#vsbLIT)"/>
        <g stroke="rgba(255,255,255,.10)" fill="none"><path d="M${l - 94} 0 L${l - 62} 74"/><path d="M${l - 64} 74 L${l - 24} 6"/></g>
        <g fill="rgba(255,255,255,.06)"><path d="M${l - 50} 0 H${l - 16} L${l - 32} 26 Z"/><path d="M${l - 102} 74 L${l - 78} 38 L${l - 66} 74 Z"/></g></g>
      <g clip-path="url(#vsbCR)"><ellipse cx="${r + 68}" cy="38" rx="96" ry="44" fill="url(#vsbRR)" opacity=".7" filter="url(#vsbSoft)"/>
        <path d="M${r + 150} 0 H${r} L${rb} 74 H${r + 136} Z" fill="url(#vsbGR)"/><path d="M${r + 150} 0 H${r} L${rb} 74 H${r + 136} Z" fill="url(#vsbLIT)"/>
        <g stroke="rgba(255,255,255,.10)" fill="none"><path d="M${r + 94} 0 L${r + 62} 74"/><path d="M${r + 64} 74 L${r + 24} 6"/></g>
        <g fill="rgba(255,255,255,.06)"><path d="M${r + 50} 0 H${r + 16} L${r + 32} 26 Z"/><path d="M${r + 102} 74 L${r + 78} 38 L${r + 66} 74 Z"/></g></g>
      <g fill="none"><path d="M${l} 0 L${lb} 74" stroke="#05090e" stroke-width="4"/><path d="M${l + 3} 0 L${lb + 3} 74" stroke="rgba(255,255,255,.22)" stroke-width="1"/>
        <path d="M${r} 0 L${rb} 74" stroke="#05090e" stroke-width="4"/><path d="M${r - 3} 0 L${rb - 3} 74" stroke="rgba(255,255,255,.22)" stroke-width="1"/></g>
      <g stroke="#fff" stroke-linecap="round"><path d="M${l + 1} 1 L${l + 4} 16" stroke-width="2.4" filter="url(#vsbGlint)"/><path d="M${l + 1} 1 L${l + 3} 12" stroke-width="1.2"/>
        <path d="M${r - 1} 1 L${r - 4} 16" stroke-width="2.4" filter="url(#vsbGlint)"/><path d="M${r - 1} 1 L${r - 3} 12" stroke-width="1.2"/></g>
      <path d="M1 .8 H${l - 1} M${r + 1} .8 H759" stroke="rgba(255,255,255,.10)"/>
      <path d="M18 73.5 H${lb - 2} M${rb + 2} 73.5 H742" stroke="rgba(0,0,0,.6)"/>
      <g filter="url(#vsbSoft)" opacity=".8"><path d="M${l - 190} 72 H${lb - 2}" stroke="url(#vsbBL)" stroke-width="6"/><path d="M${rb + 2} 72 H${r + 190}" stroke="url(#vsbBR)" stroke-width="6"/></g>
      <path d="M18 72.5 H${lb - 2}" stroke="url(#vsbBL)" stroke-width="2"/><path d="M${rb + 2} 72.5 H742" stroke="url(#vsbBR)" stroke-width="2"/>
      ${dias(l - 77, wins[0])}${dias(r + 59, wins[1])}
    </svg>`;
  }

  M.scorebug = root => {
    const m = E('div', 'mod scorebug-layer', root), sb = E('div', 'vsb fx-wipe', m);
    const plateBox = E('div', 'vsb-plate', sb);
    const team = i => { const t = E('div', 'vsb-team ' + (i ? 'r' : 'l'), sb); const lg = E('div', 'vsb-logo', t); const tx = E('div', 'vsb-tx', t); return { t, lg, tag: E('div', 'vsb-tag', tx), sub: E('div', 'vsb-sub', tx) }; };
    const A = team(0), B = team(1), sA = E('div', 'vsb-score l', sb), sB = E('div', 'vsb-score r', sb);
    const spike = E('div', 'vsb-spike', sb), spk = E('i', 'vsb-spk', spike), spkT = E('span', '', spike);
    const round = E('div', 'vsb-round', sb), tag = E('div', 'vsb-status', sb);
    const heads = [E('div', 'vsb-heads l', sb), E('div', 'vsb-heads r', sb)];
    let last = [null, null], sig = '', plateSig = '', headSig = '';
    const sideOf = (s, i) => (s.teams[i].side === 'ATK' || s.teams[i].side === 'DEF') ? s.teams[i].side : (i ? 'ATK' : 'DEF');
    return { update(s) {
      toggle(m, s.show.scorebug);
      const win = sbWindow(s);
      sb.style.setProperty('--vsb-dx', win.dx + 'px'); sb.style.setProperty('--vsb-hw', win.hw + 'px');
      const k = JSON.stringify(s.teams.map(t => [t.name, t.tag, t.color, t.logo]));
      if (k !== sig) { sig = k; [A, B].forEach((o, i) => { o.lg.innerHTML = ''; logo(s.teams[i], 46, o.lg); }); }
      [A, B].forEach((o, i) => { txt(o.tag, s.teams[i].tag || s.teams[i].name); txt(o.sub, s.teams[i].name && s.teams[i].tag ? s.teams[i].name : sideOf(s, i)); });
      [sA, sB].forEach((e, i) => { const v = s.teams[i].score; if (last[i] !== null && last[i] !== v) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); } last[i] = v; txt(e, v); });
      const planted = s.round.phase === 'planted', wins = [0, 1].map(i => s.teams[i].series || 0);
      const ps = JSON.stringify([sideOf(s, 0), sideOf(s, 1), planted, wins, need(s), win]);
      if (ps !== plateSig) { plateSig = ps; plateBox.innerHTML = sbPlate(sideOf(s, 0), sideOf(s, 1), planted, wins, need(s), win); }
      const hs = JSON.stringify(s.players.map(t => t.map(p => p.agent)));
      if (hs !== headSig) { headSig = hs; heads.forEach((h, i) => { h.innerHTML = ''; s.players[i].forEach(p => { const d = E('div', '', h); d.style.setProperty('--c', s.teams[i].color); const im = E('img', '', d); setImg(im, agent(p.agent) && agent(p.agent).icon); }); }); }
      heads.forEach((h, i) => [...h.children].forEach((d, j) => d.classList.toggle('dead', !(s.players[i][j] || {}).alive)));
      heads.forEach(h => h.style.display = vis.players(s) ? 'none' : '');
      const st = HUD.status(s); tag.classList.toggle('show', !!st);
      if (st) { txt(tag, st.text); tag.style.setProperty('--c', st.team >= 0 ? s.teams[st.team].color : 'var(--red)'); }
      this.tick(s);
    }, tick(s) {
      // The game draws the round timer; only the planted spike (when the game's timer is blank) is ours.
      const r = s.round, planted = r.phase === 'planted';
      sb.classList.toggle('planted', planted);
      if (planted) { pulseSpike(spk, r); txt(spkT, fmt(timeLeft(r))); }
      else { spk.style.removeProperty('--spike-delay'); delete spk.dataset.spikeDeadline; }
      txt(round, r.phase === 'paused' ? 'PAUSED' : `ROUND ${r.number || 1}`);
    } };
  };

  function ultRingSVG(cur, max, sz) {
    if (!max) return '';
    const cx = sz / 2, cy = sz / 2, r = sz / 2 - 2.5;
    const paths = [];
    for (let i = 0; i < max; i++) {
      const gapD = 360 / max * 0.18, segD = 360 / max - gapD;
      const s = (i * 360 / max - 90) * Math.PI / 180, e = (i * 360 / max - 90 + segD) * Math.PI / 180;
      const lg = segD > 180 ? 1 : 0, col = i < cur ? 'currentColor' : 'rgba(255,255,255,.15)';
      paths.push(`<path d="M${cx+r*Math.cos(s)},${cy+r*Math.sin(s)} A${r},${r} 0 ${lg} 1 ${cx+r*Math.cos(e)},${cy+r*Math.sin(e)}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round"/>`);
    }
    return `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}">${paths.join('')}</svg>`;
  }

  M.players = root => {
    const m = E('div', 'mod', root); const sides = [0, 1].map(i => { const w = E('div', 'pl fx-' + (i ? 'right' : 'left') + ' ' + (i ? 'r' : 'l'), m); const hd = E('div', 'pl-head mono', w); const htag = E('b', '', hd), hside = E('span', '', hd); const rows = [];
      for (let j = 0; j < 5; j++) {
        const r = E('div', 'pr', w);
        const col = E('div', 'ag-col', r);
        const ai = E('img', 'ag-i', col);
        const ud = E('div', 'ult', col); const uico = E('img', 'ult-ico', ud); const uring = E('div', 'ult-ring', ud);
        const mn = E('div', 'main', r);
        const r1 = E('div', 'r1', mn); const nm = E('div', 'nm', r1); const sh = E('div', 'sh', r1); const hpn = E('div', 'hpn num', r1);
        const hpb = E('div', 'hpb', mn); const hpi = E('i', '', hpb);
        const r2 = E('div', 'r2', mn);
        const abs = [0,1,2].map(() => { const ab = E('div', 'ab', r2); const im = E('img', '', ab); const cp = E('div', 'cp', ab); return { ab, im, cp }; });
        const wp = E('img', 'wp', r2);
        const ec = E('div', 'pc-econ', r2); const cri = E('img', 'cri', ec); const cr = E('span', 'cr num', ec);
        const di = E('div', 'di', r2); const dkda = E('span', '', di); const de = E('span', 'de', di); const dcri = E('img', '', de); const dcr = E('span', 'cr num', de);
        rows.push({ r, ai, ud, uico, uring, nm, sh, hpn, hpb, hpi, abs, wp, ec, cri, cr, di, dkda, dcri, dcr }); }
      return { w, hd, htag, hside, rows }; });
    return { update(s) {
      toggle(m, vis.players(s));
      sides.forEach((sd, i) => { tv(sd.w, s, i); const T = s.teams[i]; txt(sd.htag, T.tag || ''); txt(sd.hside, T.side || '');
        sd.rows.forEach((o, j) => { const p = s.players[i][j]; o.r.style.visibility = p ? '' : 'hidden'; if (!p) return; const A = agent(p.agent);
          setImg(o.ai, A && A.icon);
          setImg(o.uico, A && A.ab[3] && A.ab[3][1]);
          const um = Math.max(1, Math.min(64, Math.floor(Number(p.ultMax) || 7))), u = Math.max(0, Math.min(um, Math.floor(Number(p.ult) || 0))); o.ud.classList.toggle('ready', u >= um);
          const ringKey = `${u}/${um}`; if (o.uring.dataset.k !== ringKey) { o.uring.dataset.k = ringKey; o.uring.innerHTML = ultRingSVG(u, um, 44); }
          txt(o.nm, p.name);
          const armor = p.alive ? +p.armor || 0 : 0; txt(o.sh, armor > 0 ? armor : ''); o.sh.style.display = armor > 0 ? '' : 'none';
          const hp = knownHealth(p); txt(o.hpn, p.alive ? hp === null ? '—' : hp : ''); o.hpn.classList.toggle('low', hp !== null && hp > 0 && hp <= 30);
          o.hpi.style.width = (hp || 0) + '%'; o.hpi.classList.toggle('low', hp > 0 && hp <= 30);
          o.abs.forEach((ab, k) => { const d = A && A.ab[k]; setImg(ab.im, d && d[1]); const c = chargeCount(p, k); ab.ab.classList.toggle('empty', c === 0); ab.cp.classList.toggle('chamber-q', c > 4); if (ab.cp.dataset.c !== `${c}:${p.abilityAvailability?.[k]}`) { ab.cp.dataset.c = `${c}:${p.abilityAvailability?.[k]}`; ab.cp.innerHTML = abilityDots(p, k); } });
          const W = weapon(p.weapon); setImg(o.wp, p.alive && W && W.kill);
          txt(o.cr, money(p.credits)); o.cri.src = s.teams[i].side === 'ATK' ? '../core/assets/misc/ValorantCreditsRed.svg' : '../core/assets/misc/ValorantCreditsGreen.svg';
          txt(o.dkda, `${p.k||0}/${p.d||0}/${p.a||0}`); txt(o.dcr, money(p.credits)); o.dcri.src = o.cri.src;
          o.r.classList.toggle('dead', !p.alive); o.r.classList.toggle('obs', s.observed[0] === i && s.observed[1] === j && p.alive); }); });
    } };
  };

  M.killfeed = root => {
    const m = E('div', 'mod', root), kf = E('div', 'kf', m); const seen = new Set(); let rows = []; let initialized = false;
    const seenKey = k => `${k.killer}|${k.victim}|${k.weapon}|${k.hs ? 1 : 0}`;
    function buildRow(k, s, animate) {
      const a = P(s, k.killer), v = P(s, k.victim); if (!a || !v) return null;
      const W = weapon(k.weapon), Aa = agent(a.agent), Va = agent(v.agent);
      const aurl = !W && ABILITY_ICONS[String(k.weapon || '').toUpperCase()];
      const wHtml = W ? `<img class="w" src="${W.kill}">` : aurl ? `<img class="w" src="${aurl}">` : `<span class="n mono">${k.weapon || ''}</span>`;
      const key = seenKey(k); const r = E('div', 'kr' + (animate ? ' in' : ''), null); r.dataset.key = key; tv(r, s, k.killer[0]);
      r.innerHTML = `${Aa ? `<img class="a" src="${Aa.icon}">` : ''}<span class="n mono" style="color:${s.teams[k.killer[0]].color}">${a.name}</span>${wHtml}${k.hs ? HS : ''}<span class="n v mono">${v.name}</span>${Va ? `<img class="v" src="${Va.icon}">` : ''}`;
      if (animate) E('div', 'fl', r); return r;
    }
    return { update(s) {
      toggle(m, vis.killfeed(s)); m.style.opacity = vis.killfeed(s) ? 1 : 0;
      const current = s.killfeed.slice(-6).reverse();
      if (!initialized) {
        initialized = true;
        current.forEach(k => { const key = seenKey(k); seen.add(key); const r = buildRow(k, s, false); if (!r) return; kf.appendChild(r); rows.push({ r, ts: k.ts, key }); });
        return;
      }
      const currentKeys = new Set(current.map(seenKey));
      rows = rows.filter(o => { if (!currentKeys.has(o.key)) { o.r.remove(); return false; } return true; });
      const newRows = [];
      current.forEach(k => { const key = seenKey(k); if (seen.has(key)) return; const r = buildRow(k, s, true); if (!r) return; seen.add(key); newRows.push({ r, ts: k.ts, key }); });
      for (let i = newRows.length - 1; i >= 0; i--) kf.prepend(newRows[i].r);
      rows.unshift(...newRows);
    }, tick() { const n = HUD.now(); rows.forEach(o => { if (o.ts) { const age = n - o.ts; o.r.style.opacity = age > 7000 ? Math.max(0, 1 - (age - 7000) / 500) : 1; } }); } };
  };

  M.observed = root => {
    const m = E('div', 'mod', root), ob = E('div', 'ob fx-rise', m);
    const pt = E('div', 'pt', ob), pti = E('img', '', pt), info = E('div', 'info', ob), tg = E('div', 'tg mono', info), nm = E('div', 'nm', info), ln = E('div', 'ln', info);
    const wp = E('img', 'wp', ln), cr = E('span', 'cr num', ln), kda = E('span', 'num', ln);
    const hp = E('div', 'hp', ob), hv = E('div', 'v', hp), hl = E('div', 'l mono', hp, 'HEALTH'), ar = E('img', '', hl), hb = E('div', 'bar', hp), hbi = E('i', '', hb);
    const ab = E('div', 'ab', ob), keys = ['C', 'Q', 'E', 'X'];
    const slots = keys.map(k => { const s = E('div', 'slot' + (k === 'X' ? ' ult' : ''), ab); E('div', 'k mono', s, k); const ic = E('div', 'ic', s); const im = E('img', '', ic); const ch = E('div', k === 'X' ? 'pts num' : 'ch', s); return { s, im, ch }; });
    const dd = E('div', 'dead mono', ob, 'ELIMINATED');
    let deadSince = null;
    return { update(s) {
      toggle(m, vis.observed(s)); const cur = P(s, s.observed); if (!cur) return;
      if (cur.alive) { deadSince = null; }
      else {
        if (deadSince === null) { deadSince = Date.now(); }
        else if (s.show.autoObserver !== false && Date.now() - deadSince > 1500) {
          const [t, j] = s.observed;
          let nt = t, ni = s.players[t].findIndex((q, i) => i !== j && q.alive);
          if (ni === -1) { nt = 1 - t; ni = s.players[nt].findIndex(q => q.alive); }
          if (ni !== -1) { s.observed = [nt, ni]; deadSince = null; }
        }
      }
      const p = P(s, s.observed); if (!p) return; tv(ob, s, s.observed[0]); const A = agent(p.agent);
      setImg(pti, A && A.icon); txt(tg, `${s.teams[s.observed[0]].tag}  /  ${A ? A.name : p.agent}`); txt(nm, p.name);
      setImg(wp, weapon(p.weapon) && weapon(p.weapon).kill); txt(cr, money(p.credits)); txt(kda, `${p.k}/${p.d}/${p.a}`);
      const h = knownHealth(p); txt(hv, h === null ? '—' : h); hv.classList.toggle('low', h !== null && h <= 30); hbi.style.width = Math.min(100, h || 0) + '%'; setImg(ar, armorIcon(p.alive ? p.armor : 0));
      slots.forEach((o, k) => { const a = A && A.ab[k]; setImg(o.im, a && a[1]);
        if (k < 3) { const c = chargeCount(p, k); o.s.classList.toggle('empty', c === 0); o.ch.innerHTML = abilityDots(p, k); }
        else { const um = +p.ultMax || 7, u = Math.min(um, +p.ult || 0); o.s.classList.toggle('ready', u >= um); txt(o.ch, u >= um ? 'READY' : `${u}/${um}`); } });
      ob.classList.toggle('isdead', !p.alive);
    } };
  };

  // ── Player cameras ────────────────────────────────────────────────────────────────────────────
  // A camera is a VDO.Ninja view (a push link the player opens) named in state.airCams.slots[team][slot].
  // Nothing is drawn or loaded for a slot with no link, so pages without cameras are unchanged.
  const camFrames = new Set();
  let camBeat = null;
  const camUrl = (id, ms) => 'https://vdo.ninja/?view=' + encodeURIComponent(id) + '&solo&noaudio&cleanoutput&api=esportra-air' + (ms > 0 ? '&buffer=' + ms : '');
  window.addEventListener('message', ev => {
    const d = ev.data; if (!d || typeof d !== 'object') return;
    camFrames.forEach(c => { if (c.iframe && c.iframe.contentWindow === ev.source) c.heard(d); });
  });
  const camReport = c => { if (c.id) HUD.send({ type: 'cam', team: c.team, slot: c.slot, connected: c.connected }); };
  // One camera window: shows the stream for its slot, and tells the engine whether it is connected.
  function camWindow(parent, team, slot) {
    const c = { team, slot, id: '', ms: 0, connected: false, iframe: null, parent };
    c.heard = d => {
      const on = d.action === 'view-connection' ? !!d.value : ['video-loaded', 'track-added', 'peer-connected'].includes(d.action) ? true : ['end-view-connection', 'view-connection-lost', 'peer-disconnected'].includes(d.action) ? false : null;
      if (on !== null && on !== c.connected) { c.connected = on; parent.classList.toggle('live', on); camReport(c); }
    };
    c.set = (id, ms) => {
      id = id || ''; ms = +ms || 0;
      if (id === c.id && ms === c.ms) return;
      c.id = id; c.ms = ms; c.connected = false; parent.classList.remove('live');
      if (c.iframe) { c.iframe.remove(); c.iframe = null; }
      if (id) { const f = document.createElement('iframe'); f.className = 'camview'; f.allow = 'autoplay'; f.setAttribute('scrolling', 'no'); f.src = camUrl(id, ms); parent.insertBefore(f, parent.firstChild); c.iframe = f; }
      if (!camBeat) camBeat = setInterval(() => camFrames.forEach(camReport), 5000);
    };
    camFrames.add(c);
    return c;
  }

  M.playercams = root => {
    const m = E('div', 'mod', root);
    const teams = [0, 1].map(team => {
      const column = E('div', 'player-cams ' + (team ? 'r fx-right' : 'l fx-left'), m);
      const frames = Array.from({length:5}, (_, slot) => {
        const frame = E('div', 'cam', column), name = E('span', 'name mono', frame);
        return {frame, name, cam: camWindow(frame, team, slot)};
      });
      return {column, frames};
    });
    return {update(s) {
      const cams = s.airCams, ingame = !cams || cams.layout === 'ingame';
      toggle(m, s.show.playerCams && vis.players(s) && ingame);
      teams.forEach((team, i) => {
        tv(team.column, s, i);
        team.frames.forEach(({frame, name, cam}, j) => {
          const player = s.players[i][j]; frame.style.visibility = player ? '' : 'hidden';
          txt(name, player?.name || 'PLAYER ' + (j + 1));
          frame.classList.toggle('observed', s.observed[0] === i && s.observed[1] === j);
          cam.set(ingame && cams?.slots?.[i]?.[j], cams?.delayMs);
        });
      });
    }};
  };

  // Full-screen camera wall: the observed team's five (5-up) or both teams' ten (10-up).
  M.camgrid = root => {
    const m = E('div', 'mod', root), wall = E('div', 'camwall fx-rise', m);
    E('div', 'camwall-title mono', wall, 'PLAYER CAMS');
    const rows = [0, 1].map(team => {
      const row = E('div', 'camrow', wall);
      const frames = Array.from({length:5}, (_, slot) => {
        const frame = E('div', 'cam', row), name = E('span', 'name mono', frame);
        return {frame, name, cam: camWindow(frame, team, slot)};
      });
      return {row, frames};
    });
    return {update(s) {
      // Previews (library, editor, rehearsal) show the full wall; on air it follows the producer's layout.
      const cams = s.airCams, layout = cams?.layout || (PREVIEW ? 'grid10' : null), wanted = layout === 'grid5' || layout === 'grid10';
      toggle(m, wanted);
      wall.classList.toggle('one', layout === 'grid5');
      const first = s.observed && s.observed[0] === 1 ? 1 : 0;
      rows.forEach((r, i) => {
        r.row.style.display = layout === 'grid5' && i !== first ? 'none' : '';
        tv(r.row, s, i);
        r.frames.forEach(({frame, name, cam}, j) => {
          const player = s.players[i][j];
          txt(name, player?.name || 'PLAYER ' + (j + 1));
          frame.classList.toggle('observed', s.observed[0] === i && s.observed[1] === j);
          const shown = wanted && (layout === 'grid10' || i === first);
          cam.set(shown && cams?.slots?.[i]?.[j], cams?.delayMs);
        });
      });
    }};
  };

  M.minimap = root => {
    const m = E('div', 'mod', root), f = E('div', 'mmf fx-rise', m);
    const lb = E('div', 'lbl mono', f), a = E('div', 'm', lb), b = E('div', '', lb);
    return { update(s) { toggle(m, s.show.minimap && !s.show.scoreboard); const L = s.layout.minimap; Object.assign(f.style, { left: L.x + 'px', top: L.y + 'px', width: L.size + 'px', height: L.size + 'px' });
      txt(a, s.map.name); txt(b, `ROUND ${s.round.number}`); } };
  };

  const BANNER_THEMES = HUD.bannerThemes = Object.freeze(['broadcast', 'compact', 'monument', 'impact']);
  const bannerTheme = HUD.bannerTheme = value => BANNER_THEMES.includes(value) ? value : value === 'velocity' ? 'compact' : 'broadcast';
  M.banner = root => {
    const m = E('div', 'mod', root), bn = E('div', 'bn', m), band = E('div', 'band', bn), por = E('img', 'por', bn), lg = E('div', 'lgw', bn), t1 = E('div', 't1', bn), t2 = E('div', 't2 mono', bn);
    E('div', 'bn-frame', bn); E('div', 'bn-wing l', bn); E('div', 'bn-wing r', bn);
    const watermark = E('img', 'bn-watermark', band); watermark.src = '../core/brand/mark-512.png'; watermark.alt = '';
    // Game art belongs to the added themes. Broadcast keeps its original composition.
    const scene = E('div', 'bn-scene', bn);
    const lineup = E('div', 'bn-lineup', scene);
    const artImages = Array.from({length:5}, (_, i) => { const slot = E('div', 'bn-agent', lineup); slot.style.setProperty('--i', i); const image = E('img', '', slot); image.alt = ''; return image; });
    const abilities = E('div', 'bn-abilities', scene), abilityImages = Array.from({length:4}, () => E('img', '', abilities));
    const context = E('div', 'bn-context', scene), roundLabel = E('div', 'bn-round-label', scene), teamGhost = E('div', 'bn-team-ghost', scene), sigil = E('div', 'bn-sigil', scene);
    scene.setAttribute('aria-hidden', 'true'); abilityImages.forEach(image => { image.alt = ''; });
    [...artImages, ...abilityImages].forEach(image => { image.onerror = () => { image.removeAttribute('src'); delete image.dataset.u; image.style.visibility = 'hidden'; }; });
    const artImage = (image, url) => { if (!url) { image.removeAttribute('src'); delete image.dataset.u; } setImg(image, url); };
    const kicker = E('div', 'bn-kicker', bn);
    const crest = E('div', 'bn-crest', bn), emblem = E('img', 'bn-emblem', crest);
    const footer = E('div', 'bn-footer', bn), side = E('span', 'bn-side', footer), teamLogo = E('div', 'bn-team-logo', footer), teamName = E('strong', 'bn-team-name', footer), actor = E('span', 'bn-actor', footer);
    const pz = E('div', 'pause', m), pauseCrest = E('div', 'pause-crest', pz), pauseIcon = E('img', 'pause-symbol', pauseCrest), pa = E('div', 'a', pz), pb = E('div', 'b mono', pz);
    E('div', 'pause-wing l', pz); E('div', 'pause-wing r', pz);
    let cur = 0, outAt = 0, content = '';
    const PERSIST = { techpause: 1, timeout: 1 };
    return { update(s, opts = {}) {
      const theme = bannerTheme(s.layout?.bannerTheme), compact = theme !== 'broadcast';
      bn.classList.toggle('compact', compact); pz.classList.toggle('compact', compact);
      ['monument', 'impact', 'velocity'].forEach(variant => { const selected = theme === (variant === 'velocity' ? 'compact' : variant); bn.classList.toggle(variant, selected); pz.classList.toggle(variant, selected); });
      const b = s.banner;
      if (PERSIST[b.type] || !b.type || !b.ts) { bn.classList.remove('on', 'out'); cur = 0; outAt = 0; content = ''; this.tick(s); return; }
      const T = s.teams[b.team] || s.teams[0]; const p = s.players[b.team] && s.players[b.team][b.player]; const A = p && agent(p.agent);
      const signature = JSON.stringify([b, theme, T, p?.name, p?.agent, s.round.number, s.round.phase, ...(compact ? [s.players[b.team]?.map(player => player.agent), s.map.name] : [])]);
      if (signature !== content) {
        content = signature;
        bn.style.setProperty('--c', T.color); bn.style.setProperty('--ci', ink(T.color)); por.style.display = 'none'; lg.innerHTML = '';
        const map = { round: [T.name, `WIN ROUND ${Math.max(1, s.round.number - (s.round.phase === 'end' ? 0 : 1))}${b.method ? '   /   ' + b.method : ''}`],
          ace: ['ACE', `${p ? p.name : ''}   /   ${T.tag}`], teamace: ['TEAM ACE', T.name], clutch: [`CLUTCH 1V${b.text || '?'}`, `${p ? p.name : ''}   /   ${T.tag}`],
          flawless: ['FLAWLESS', `${T.name} TAKE THE ROUND`], thrifty: ['THRIFTY', `${T.name} WIN ON AN ECO`], matchpoint: ['MATCH POINT', T.name], overtime: ['OVERTIME', 'FIRST TO LEAD BY TWO'], custom: [b.text || '', b.method || ''] };
        if (b.type === 'overtime') { bn.style.setProperty('--c', '#f0c040'); bn.style.setProperty('--ci', '#0d0d0f'); }
        const [a1, a2] = map[b.type] || [b.text, ''];
        txt(t1, compact && b.type === 'round' ? 'ROUND WIN' : a1); txt(t2, a2);
        t1.classList.toggle('long', compact && t1.textContent.length > 14);
        if (!compact && (b.type === 'ace' || b.type === 'clutch') && A) { por.src = A.full; por.style.display = ''; por.style.left = '380px'; }
        if (!compact && ['round', 'teamace', 'flawless', 'thrifty', 'matchpoint'].includes(b.type)) { const l = logo(T, 90, lg, 'lg'); l.style.position = 'absolute'; l.style.left = '220px'; l.style.top = '70px'; l.style.setProperty('--c', ink(T.color)); l.style.borderColor = ink(T.color); l.style.color = ink(T.color); }
        if (compact) {
          const personal = !!A && (b.type === 'ace' || b.type === 'clutch');
          const neutral = b.type === 'custom' || b.type === 'overtime';
          bn.classList.toggle('personal', personal); bn.classList.toggle('neutral', neutral);
          const roster = personal ? [A] : neutral ? [] : (s.players[b.team] || []).map(player => agent(player.agent)).filter(Boolean).slice(0, 5);
          artImages.forEach((image, i) => artImage(image, roster[i] && (theme === 'compact' && !personal ? roster[i].icon : roster[i].full)));
          abilityImages.forEach((image, i) => artImage(image, personal && theme === 'impact' ? A.ab?.[i]?.[1] : ''));
          sigil.innerHTML = ''; if (theme === 'compact' && !neutral) logo(T, 104, sigil);
          txt(context, theme === 'compact' ? s.map.name : personal ? `${A.name} / ${A.role}` : `${T.tag || T.name} / ${T.side || ''}`);
          txt(roundLabel, `ROUND ${String(s.round.number).padStart(2, '0')}`);
          txt(teamGhost, neutral ? 'AIR' : T.tag || '');
          const icons = {ace:'banners/skullAceCrown.webp', teamace:'banners/skullAceCrown.webp', flawless:'banners/flawless.svg', clutch:'banners/clutch.svg', thrifty:'banners/thrifty.webp'};
          crest.classList.toggle('brand-icon', !icons[b.type] && b.type !== 'round');
          setImg(emblem, icons[b.type] ? '../core/assets/' + icons[b.type] : b.type === 'round' ? '../core/assets/banners/round-victory.svg' : '../core/brand/mark-224.png');
          const captions = {flawless:'PERFECT ROUND', ace:'FIVE KILLS · ONE PLAYER', teamace:'EVERY PLAYER · ONE KILL', clutch:'LAST PLAYER STANDING', thrifty:'LESS SPENT · MORE WON', matchpoint:'ONE ROUND FROM VICTORY', overtime:'FIRST TO LEAD BY TWO', round:`ROUND ${s.round.number} · ${b.method || 'VICTORY'}`};
          txt(kicker, captions[b.type] || 'ESPORTRA');
          txt(side, neutral ? '' : T.side || ''); teamLogo.innerHTML = ''; teamLogo.style.display = neutral ? 'none' : '';
          if (!neutral) logo(T, 30, teamLogo);
          txt(teamName, neutral ? a2 : T.name || T.tag || 'TEAM ' + (b.team + 1));
          txt(actor, !neutral && (b.type === 'ace' || b.type === 'clutch') && p ? p.name : '');
        }
      }
      if (b.ts !== cur) {
        cur = b.ts; outAt = b.ts + (b.hold || 4200);
        bn.classList.remove('on', 'out', 'restored');
        bn.classList.toggle('restored', !!opts.snapshot && HUD.now() - b.ts > 400);
        if (HUD.now() < outAt) { void bn.offsetWidth; bn.classList.add('on'); }
      }
      this.tick(s);
    }, tick(s) {
      const b = s.banner, n = HUD.now();
      if (bn.classList.contains('on') && !bn.classList.contains('out') && n > outAt) { const id = cur; bn.classList.remove('restored'); bn.classList.add('out'); setTimeout(() => { if (cur === id && HUD.now() > outAt) bn.classList.remove('on', 'out'); }, bn.classList.contains('compact') ? 300 : 500); }
      const on = PERSIST[b.type]; pz.classList.toggle('on', !!on);
      if (on) { const T = s.teams[b.team] || s.teams[0];
        pz.style.setProperty('--c', b.type === 'techpause' ? 'var(--red)' : T.color);
        setImg(pauseIcon, '../core/assets/banners/' + (b.type === 'techpause' ? 'technical-pause' : 'timeout') + '.svg');
        if (b.type === 'techpause') { txt(pa, 'TECHNICAL PAUSE'); txt(pb, `PAUSED FOR ${fmt((n - b.ts) / 1000)}`); pz.style.borderBottomColor = 'var(--red)'; }
        else { txt(pa, `TIMEOUT  ${T.tag}`); txt(pb, `RESUMES IN ${fmt(Math.max(0, 60 - (n - b.ts) / 1000))}`); pz.style.borderBottomColor = T.color; } }
    } };
  };

  M.replay = root => { const m = E('div', 'mod', root), r = E('div', 'rp', m), a = E('div', 'a', r, '<div class="dot"></div>REPLAY'), b = E('div', 'b mono', r);
    return { update(s) { r.classList.toggle('on', !!s.show.replay); txt(b, `ROUND ${s.round.number}   /   ${s.map.name}`); } }; };

  M.economy = root => {
    const m = E('div', 'mod', root), ec = E('div', 'ec fx-rise', m);
    const teams = [0, 1].map(i => { const t = E('div', 'tm ' + (i ? 'r' : 'l'), ec); const hd = E('div', 'hd', t); return { t, hd, body: E('div', 'body', t) }; });
    return { update(s) {
      toggle(m, vis.economy(s));
      teams.forEach((o, i) => { tv(o.t, s, i); const T = s.teams[i], ps = s.players[i]; const bank = ps.reduce((a, p) => a + (+p.credits || 0), 0);
        const lb = [1900, 2400, 2900, 3400, 3900][Math.min(4, T.lossStreak || 0)];
        o.hd.innerHTML = `<div class="team"><span class="score num">${T.score}</span><span class="n">${T.name || T.tag || 'TEAM ' + (i + 1)}</span><span class="side mono">${T.side || ''}</span></div><div class="summary mono">BUY PHASE<span>LOSS BONUS ${money(lb)}</span></div><div class="bank"><span class="v num">${money(bank)}</span><span class="l mono">TEAM BANK</span></div>`;
        o.body.innerHTML = ps.map((p, j) => { const A = agent(p.agent), W = weapon(p.weapon), um = +p.ultMax || 7, u = +p.ult || 0;
          const before = s.prevCredits?.[i]?.[j], delta = before == null ? null : (+p.credits || 0) - Number(before);
          const unchanged = delta == null || delta === 0;
          const change = unchanged ? '—' : `${delta > 0 ? '+' : ''}${money(delta)}`;
          const abilities = [0, 1, 2].map(k => { const ability = A && A.ab[k], count = chargeCount(p, k); if (!ability) return '';
            return `<div class="ability ${count === 0 ? 'empty' : ''}" title="${ability[0]}"><img src="${ability[1]}"><div class="cp ${count > 4 ? 'chamber-q' : ''}">${abilityDots(p, k)}</div></div>`; }).join('');
          const kit = `<div class="kit"><div class="ult ${u >= um ? 'ready' : ''}">${A?.ab?.[3]?.[1] ? `<img src="${A.ab[3][1]}">` : ''}<span class="num">${u}/${um}</span></div><div class="weapon">${W ? `<img src="${W.kill}" title="${p.weapon}">` : `<span class="mono">${p.weapon || '—'}</span>`}</div><div class="armor">${armorIcon(p.armor) ? `<img src="${armorIcon(p.armor)}" title="${p.armor} armor">` : '<span class="mono">NO ARMOR</span>'}</div></div>`;
          const identity = `<div class="identity">${A ? `<img class="ag" src="${A.icon}">` : '<div class="ag empty"></div>'}<div class="person"><div class="n">${p.name || 'PLAYER ' + (j + 1)}</div><div class="agent mono">${A?.name || 'AGENT PENDING'}</div></div><div class="kda"><strong class="num">${p.k || 0} / ${p.d || 0} / ${p.a || 0}</strong><span class="mono">K / D / A</span></div></div>`;
          const econ = `<div class="econ"><span class="cr num">${money(p.credits)}</span><span class="change num ${unchanged ? 'neutral' : delta > 0 ? 'gain' : ''}" title="Credit change since the previous round">${change}</span></div>`;
          const util = `<div class="abilities">${abilities}</div>`;
          return `<div class="rw">${i ? identity + kit + util + econ : econ + util + kit + identity}</div>`; }).join(''); });
    } };
  };

  M.scoreboard = root => {
    const m = E('div', 'mod', root); E('div', 'st-dim', m); const st = E('div', 'st fx-rise', m);
    const COLS = ['K', 'D', 'A', '+/-', 'FK', 'CREDITS', 'ULT', 'ACS'];
    return { update(s) {
      toggle(m, !!s.show.scoreboard); const all = s.players.flat().filter(p=>p.name); const hasAcs = all.some(p => Number(p.acs) > 0);
      const mvp = all.reduce((a, p) => (+(hasAcs ? p.acs : p.k) > +(hasAcs ? a.acs : a.k) ? p : a), all[0]);
      const matchMeta=all.length?`MAP ${s.map.number} / ${s.map.name}<br>ROUND ${s.round.number}`:'WAITING FOR GAME DATA';
      st.innerHTML = `<div class="hd"><div class="t disp hl">SCOREBOARD</div><div class="m mono">${matchMeta}</div></div>` +
        [0, 1].map(i => { const T = s.teams[i]; const ps = [...s.players[i]].sort((a, b) => +(hasAcs ? b.acs : b.k) - +(hasAcs ? a.acs : a.k));
          return `<div class="tb" style="--c:${T.color}"><div class="row h"><div class="tn"><b>${T.score}</b>${T.name}</div><div></div>${COLS.map(c => `<div class="c mono">${c}</div>`).join('')}</div>` +
            ps.map(p => { const A = agent(p.agent); const pm = (+p.k || 0) - (+p.d || 0), acs = p.acs > 0 ? p.acs : '—';
              const values = p.name?[p.k, p.d, p.a, (pm > 0 ? '+' : '') + pm, p.fk ?? '—', p.creditsKnown===false?'—':money(p.credits), `${p.ult || 0}/${p.ultMax || 7}`, acs]:Array(8).fill('—');
              return `<div class="row ${p.alive ? '' : 'dead'}">${A ? `<img src="${A.icon}">` : '<div></div>'}<div class="pn">${p.name||'Waiting for player'}${p === mvp ? `<span class="mvp mono">${hasAcs ? 'MVP' : 'TOP FRAG'}</span>` : ''}</div><div class="ag mono">${A ? A.name : ''} / ${p.name?p.weapon||'—':'—'}</div>` +
                values.map((v, k) => `<div class="c num" style="${k === 3 ? `color:${pm >= 0 ? '#7ee0a0' : '#e0445e'}` : ''}">${v ?? '—'}</div>`).join('') + '</div>'; }).join('') + '</div>'; }).join('');
    } };
  };

  M.lowerthird = root => {
    const m = E('div', 'mod', root), lt = E('div', 'lt', m); E('div', 'acc', lt); const box = E('div', 'box', lt); let sig = '';
    return { update(s) {
      const L = s.lowerThird; const k = JSON.stringify([L, s.casters, s.show.lowerThird]); lt.classList.toggle('on', !!s.show.lowerThird); if (k === sig) return; sig = k;
      const T = s.teams[L.team] || s.teams[0]; tv(lt, s, L.team || 0); lt.classList.toggle('cast', L.kind === 'caster');
      if (L.kind === 'caster') { lt.style.setProperty('--c', 'var(--red)'); box.innerHTML = s.casters.map((c, i) => `<div><div class="k mono">${i ? 'ANALYST' : 'PLAY-BY-PLAY'}</div><div class="cn">${c.name}</div><div class="ch mono">${c.handle}</div></div>`).join(''); }
      else if (L.kind === 'player') { const p = s.players[L.team][L.player] || {}; const A = agent(p.agent);
        box.innerHTML = `<div class="pp">${A ? `<img src="${A.icon}">` : ''}<div><div class="k mono">${T.tag}   /   ${A ? A.name : ''}</div><div class="t disp hl">${p.name || ''}</div><div class="s mono">${L.sub || `${p.k} K   ${p.d} D   ${p.a} A   /   ${p.acs} ACS`}</div></div></div>`; box.style.paddingTop = '14px'; }
      else { lt.style.setProperty('--c', L.team >= 0 ? T.color : 'var(--red)'); box.style.paddingTop = ''; box.innerHTML = `<div class="k mono">${s.event.stage}</div><div class="t disp hl">${L.title}</div><div class="s mono">${L.sub}</div>`; }
    } };
  };

  // ───── full-screen scenes ─────
  // Map veto (approved mock, 14 Nov): the format's steps in order. Done steps show the map, who acted
  // and the side; the step being chosen pulses in that team's colour; later steps wait as empty slots.
  M.veto = root => {
    const m = E('div', 'mod on vt', root); const sc = sceneBg(m); chrome(m, 'MAP VETO');
    const head = E('div', 'vt-head', m), title = E('div', 'title disp hl', head, 'MAP VETO'), sub = E('div', 'title-r mono', head);
    const tl = E('div', 'vt-team l', m), tr = E('div', 'vt-team r', m);
    const box = E('div', 'steps', m), cap = E('div', 'cap mono', m); sceneFx(sc);
    void title;
    let sig = '', cur = null;
    return {
      // Coming on air plays every card's entrance once; afterwards only a new card animates.
      play() { sig = ''; box.innerHTML = ''; },
      update(s) {
        const k = JSON.stringify([s.veto, s.vetoOrder, s.vetoTurn && [s.vetoTurn.team, s.vetoTurn.action], s.vetoToss, s.vetoFirst, s.teams.map(t => [t.name, t.tag, t.color, t.logo]), s.series.map(x => x.map), s.event.bestOf, s.event.stage, s.event.accent]);
        if (k === sig) return; sig = k;
        m.style.setProperty('--ev', eventAccent(s));
        txt(sub, [s.event.stage, `BEST OF ${s.event.bestOf}`].filter(Boolean).join('   ·   '));
        [tl, tr].forEach((el, t) => morph(el, `${teamMark(s.teams[t], 96)}<div><b>${escH(s.teams[t].name)}</b><span class="mono">${escH(s.teams[t].tag)}</span></div>`));
        const steps = cur = vetoSteps(s.veto, s.event.bestOf, s.vetoOrder, s.vetoTurn, s.vetoFirst);
        box.style.setProperty('--n', steps.length);
        morph(box, steps.map(st => {
          const n = String(st.i + 1).padStart(2, '0'), T = st.team >= 0 ? s.teams[st.team] : null;
          const label = st.action === 'decider' ? 'DECIDER' : st.action === 'pick' ? 'PICK' : 'BAN';
          const enter = `animation:tIn .6s ${.06 * st.i}s var(--ease) both;opacity:0;transform:translateY(40px)`;
          if (st.state !== 'done') {
            const now = st.state === 'now';
            const word = now ? (T ? `${escH(T.tag)} ${st.action === 'pick' ? 'PICKING' : 'BANNING'}` : 'DECIDER') : 'UP NEXT';
            return `<div class="card ${now ? 'now' : 'next'}" style="--c:${T ? escH(T.color) : 'var(--ev)'};${enter}"><div class="hd"><b class="stamp">${label}</b><i class="mono">${n}</i></div><div class="art"><div class="mn">${word}</div></div><div class="ft">${T ? `<div class="by">${teamMark(T, 40)}${escH(T.tag)}</div>` : ''}<div class="nt mono">${now ? 'CHOOSING NOW' : st.action === 'decider' ? 'LAST MAP STANDING' : ''}</div></div></div>`;
          }
          const Mm = mapA(st.map), kind = st.action === 'ban' ? 'ban' : st.action === 'decider' ? 'dec' : 'pick';
          const by = st.sideTeam === 0 || st.sideTeam === 1 ? s.teams[st.sideTeam] : T ? s.teams[1 - st.team] : null;
          const note = st.side ? (by ? `${escH(by.tag)} PICKS ${escH(st.side)}` : `${escH(st.side)} FIRST`) : st.sideBy !== undefined ? `${escH(s.teams[st.sideBy].tag)} CHOOSING SIDE` : kind === 'ban' ? 'BANNED' : kind === 'dec' ? `MAP ${s.series.findIndex(x => x.map === st.map) + 1 || ''}` : '';
          return `<div class="card ${kind}" style="--c:${kind === 'pick' && T ? escH(T.color) : kind === 'dec' ? 'var(--ev)' : 'rgba(255,255,255,.14)'};${enter}"><div class="hd"><b class="stamp">${label}</b><i class="mono">${n}</i></div><div class="art">${Mm ? `<img src="${escH(Mm.tall)}" alt="">` : ''}${kind === 'ban' ? '<span class="strike"></span>' : ''}<div class="mn">${escH(st.map)}</div></div><div class="ft">${T ? `<div class="by">${teamMark(T, 40)}${escH(T.tag)}</div>` : '<div class="by dec">DECIDER</div>'}<div class="nt mono">${note}</div></div></div>`;
        }).join(''));
        txt(cap, vetoCaption(s, steps));
      },
      // The turn's time left counts down between updates.
      tick(s) { if (cur && s.vetoTurn && s.vetoTurn.endsAt) txt(cap, vetoCaption(s, cur)); },
    };
  };

  // Agent select (approved mock, 14 Nov): five players a side facing the map. A player still choosing
  // is dimmed; a lock-in fills the card and flashes that card once.
  M.lineups = root => {
    const m = E('div', 'mod on lu', root); const sc = sceneBg(m); chrome(m, 'AGENT SELECT');
    const ths = [E('div', 'th l', m), E('div', 'th r', m)], vs = E('div', 'vs', m);
    const row = E('div', 'lu-row', m), cols = [E('div', 'col l', row), E('div', 'mapc', row), E('div', 'col r', row)], cnt = E('div', 'cnt mono', m); sceneFx(sc);
    let sig = '', was = null;
    return {
      play() { sig = ''; was = null; cols[0].innerHTML = cols[2].innerHTML = ''; },
      update(s) {
        const k = JSON.stringify([s.players.map(t => t.map(p => [p.name, p.agent, p.locked])), s.teams.map(t => [t.name, t.tag, t.color, t.logo, t.side, t.series]), [s.map.name, s.map.number], s.series.map(x => [x.map, x.winner, x.score]), s.event.bestOf, s.event.accent]);
        if (k === sig) return; sig = k;
        m.style.setProperty('--ev', eventAccent(s));
        const now = s.players.map(t => t.slice(0, 5).map(lockState));
        ths.forEach((el, t) => { const T = s.teams[t];
          morph(el, `${teamMark(T, 84)}<b class="disp">${escH(T.name)}</b>${T.side ? `<span class="side ${T.side === 'ATK' ? 'atk' : 'def'}">${escH(T.side)}</span>` : ''}`); });
        morph(vs, `<b>AGENT SELECT</b><span class="mono">MAP ${escH(s.map.number || 1)}   ·   ${escH(s.map.name)}</span>`);
        [0, 1].forEach(t => { const T = s.teams[t];
          cols[t * 2].style.setProperty('--c', T.color);
          morph(cols[t * 2], s.players[t].slice(0, 5).map((p, j) => { const A = agent(p.agent), st = now[t][j];
            const just = was && was[t] && was[t][j] !== 'locked' && st === 'locked';
            const enter = `animation:tIn .6s ${.06 * (t * 5 + j)}s var(--ease) both;opacity:0;transform:translateY(40px)`;
            return `<div class="pc ${st}${just ? ' just' : ''}" style="${enter}"><div class="por" style="background:linear-gradient(180deg,#${A && A.grad[0] || '2a2f37'},#121418)">${A ? `<img class="por-i" src="${escH(A.full)}" data-fallback="${escH(A.icon)}" alt="">` : ''}</div>${st === 'locked' ? '<span class="lock mono">LOCKED</span>' : ''}<div class="who"><b>${escH(p.name || 'PLAYER ' + (j + 1))}</b><span class="mono">${st === 'locked' ? `<em>${escH(A.name)}</em>` : 'CHOOSING'}</span></div></div>`;
          }).join(''));
        });
        const Mm = mapA(s.map.name), played = s.series.filter(x => x.winner === 0 || x.winner === 1);
        const dia = t => Array.from({ length: Math.ceil((s.event.bestOf || 1) / 2) }, (_, i) => `<i class="${i < (s.teams[t].series || 0) ? 'w' : ''}" style="--c:${escH(s.teams[t].color)}"></i>`).join('');
        morph(cols[1], `<div class="art">${Mm ? `<img src="${escH(Mm.tall)}" alt="">` : ''}<b>${escH(s.map.name)}</b></div><div class="info"><div class="score">${s.teams[0].series || 0} – ${s.teams[1].series || 0}<small class="mono">SERIES   ·   MAP ${escH(s.map.number || 1)}</small></div><div class="dia"><span>${dia(0)}</span><span>${dia(1)}</span></div><div class="played mono">${played.map(x => `${escH(x.map)} ${x.score[0]}–${x.score[1]}`).join('<br>')}</div></div>`);
        fallbackOnError(row);
        const locked = now.flat().filter(x => x === 'locked').length;
        txt(cnt, `${locked} OF ${now.flat().length} LOCKED`);
        was = now;
      },
    };
  };

  M.intro = root => {
    const m = E('div', 'mod on in', root); const sc = sceneBg(m); chrome(m, 'MATCH'); const box = E('div', '', m); sceneFx(sc);
    return { update(s) { if (same(this, s)) return;
      box.innerHTML = [0, 1].map(i => { const T = s.teams[i]; return `<div class="side ${i ? 'r' : 'l'}" style="--c:${T.color}"><div class="wash" style="background:radial-gradient(ellipse at ${i ? 70 : 30}% 45%,${T.color},transparent 60%)"></div><div class="tn disp hl">${T.name}</div><div class="ts mono">${T.series} ${T.series === 1 ? 'MAP' : 'MAPS'} WON</div></div>`; }).join('') +
        `<div class="vs">vs</div><div class="ev mono">${s.event.name}</div><div class="st disp hl">${s.event.stage}${EMPTY_PREVIEW ? '' : ' / BEST OF '+s.event.bestOf}</div><div class="mp">` +
        s.series.map((x, k) => { const Mm = mapA(x.map); const w = x.winner != null ? s.teams[x.winner].tag + ' ' + x.score.join('–') : (k === s.map.number - 1 ? 'LIVE' : 'UPCOMING');
          return `<div>${Mm ? `<img src="${Mm.list}">` : ''}<span>${x.map}</span><em>MAP ${k + 1}   /   ${w}</em></div>`; }).join('') + '</div>';
      box.querySelectorAll('.side').forEach((sd, i) => { const l = logo(s.teams[i], 260, sd); l.style.position = 'absolute'; l.style.left = '350px'; l.style.top = '300px'; });
    } };
  };

  M.mapresult = root => {
    const m = E('div', 'mod on mr', root); const sc = sceneBg(m); const bgm = E('img', 'bgm', sc); chrome(m, 'MAP RESULT'); const box = E('div', '', m); sceneFx(sc); const pres = presented(m);
    return { update(s) { s = withRecord(s); pres(s, 'victory'); if (same(this, s)) return;
      const Mm = mapA(s.map.name); if (Mm) setImg(bgm, Mm.splash);
      const [a, b] = s.teams.map(t => t.score), w = a === b ? 1 : a > b ? 0 : 1, T = s.teams[w];
      // GEP gives no ACS, ADR or headshot %: rank by kills then, and show a dash instead of a number.
      const flat = s.players.flatMap((ps, i) => ps.map(p => ({ ...p, t: i }))), hasAcs = flat.some(p => Number(p.acs) > 0);
      const stat = (v, suffix = '') => (Number(v) > 0 ? `${v}${suffix}` : '—');
      const all = flat.sort((x, y) => +(hasAcs ? y.acs : y.k) - +(hasAcs ? x.acs : x.k)); const mvp = all[0], A = agent(mvp.agent);
      box.innerHTML = `<div class="sc" style="--c:${T.color}"><div class="w mono">MAP ${s.map.number}   /   ${s.map.name}</div><div class="big disp hl">${Math.max(a, b)}<span>–</span>${Math.min(a, b)}</div><div class="tn">${T.name} WIN</div></div>` +
        `<div class="mvp" style="--c:${s.teams[mvp.t].color}">${A ? `<img src="${A.full}">` : ''}<div class="k mono">MATCH MVP</div><div class="n disp hl">${mvp.name}</div><div class="a mono">${s.teams[mvp.t].tag}   /   ${A ? A.name : ''}</div>` +
        `<div class="sts"><div>${stat(mvp.acs)}<small>ACS</small></div><div>${mvp.k}/${mvp.d}/${mvp.a}<small>K / D / A</small></div><div>${stat(mvp.adr)}<small>ADR</small></div><div>${stat(mvp.hs, '%')}<small>HEADSHOT</small></div></div></div>` +
        `<div class="tp"><div class="h mono">TOP PERFORMERS</div>` + all.slice(1, 5).map(p => { const Ap = agent(p.agent); return `<div class="r" style="--c:${s.teams[p.t].color}">${Ap ? `<img src="${Ap.icon}">` : ''}<div class="n">${p.name}</div><div class="v mono">${s.teams[p.t].tag}   /   ${hasAcs ? `${stat(p.acs)} ACS   /   ` : ''}${p.k}–${p.d}–${p.a}</div></div>`; }).join('') + '</div>';
    } };
  };

  M.series = root => {
    const m = E('div', 'mod on se', root); const sc = sceneBg(m); chrome(m, 'SERIES'); const title = E('div', 'title disp hl', m, 'SERIES'); const hr = E('div', 'title-r mono', m); const box = E('div', 'cards', m); sceneFx(sc);
    return { update(s) { if (same(this, s)) return;
      txt(hr, `${s.teams[0].tag} ${s.teams[0].series} – ${s.teams[1].series} ${s.teams[1].tag}   /   BO${s.event.bestOf}`);
      box.innerHTML = s.series.map((x, k) => { const Mm = mapA(x.map), done = x.winner != null, live = !done && k === s.map.number - 1;
        const pk = x.pick >= 0 ? `${s.teams[x.pick].tag} PICK` : 'DECIDER'; const sc_ = live ? [s.teams[0].score, s.teams[1].score] : x.score;
        return `<div class="cd ${done ? 'done' : ''}" style="--c:${done ? s.teams[x.winner].color : 'transparent'};animation:tIn .6s ${.1 * k}s var(--ease) both;opacity:0;transform:translateY(40px)">${Mm ? `<img src="${Mm.splash}">` : ''}<div class="sh"></div><div class="no mono">MAP ${k + 1}</div>${live ? '<div class="live mono">● LIVE</div>' : ''}<div class="mn">${x.map}</div><div class="pk mono">${pk}</div>` +
          `<div class="res">${[0, 1].map(i => { const lose = done && x.winner !== i; return `<div class="t ${lose ? 'lose' : ''}" style="order:${i ? 3 : 0}">${s.teams[i].tag}</div>`; }).join('')}<div class="s" style="order:1">${sc_ ? `<span class="${done && x.winner !== 0 ? 'lose' : ''}">${sc_[0]}</span><span style="color:#55555b"> – </span><span class="${done && x.winner !== 1 ? 'lose' : ''}">${sc_[1]}</span>` : '—'}</div></div><div class="bar"></div></div>`; }).join('');
    } };
  };

  M.bracket = root => {
    const m = E('div', 'mod on bk', root); const sc = sceneBg(m); chrome(m, 'PLAYOFFS'); const box = E('div', '', m); sceneFx(sc);
    return { update(s) { if (same(this, s)) return;
      const B = { qf: s.bracket.qf || [], sf: s.bracket.sf || [], gf: s.bracket.gf || [] }, qy = i => 230 + i * 88, sfy = k => (qy(2 * k) + qy(2 * k + 1)) / 2, gfy = k => (sfy(2 * k) + sfy(2 * k + 1)) / 2, chy = (gfy(0) + gfy(1)) / 2;
      let h = [['QUARTERFINALS', 200], ['SEMIFINALS', 700], ['GRAND FINAL', 1150], ['CHAMPION', 1580]].map(([t, x], i) => `<div class="hd mono" style="left:${x}px;${i === 3 ? 'color:#e0445e' : ''}">${t}</div>`).join('');
      let lines = '';
      const row = (x, y, w, n, sc_, win, done) => `<div class="rw ${done ? (win ? 'w' : 'l') : ''}" style="left:${x}px;top:${y}px;width:${w}px"><span class="n">${n}</span><span class="s num">${sc_}</span></div>`;
      const con = (x1, y1, x2, y2, win) => { const xm = (x1 + x2) / 2; lines += `<path d="M${x1} ${y1 + 29} H${xm} V${y2 + 29} H${x2}" fill="none" stroke="${win ? '#e0445e' : 'rgba(255,255,255,.22)'}" stroke-width="2"/>`; };
      const need_ = (r) => r === 'qf' ? 13 : need(s);
      B.qf.forEach((mt, k) => [0, 1].forEach(j => { const i = 2 * k + j, won = mt[j * 2 + 1] > mt[(1 - j) * 2 + 1]; const done = Math.max(mt[1], mt[3]) >= need_('qf');
        h += row(200, qy(i), 330, mt[j * 2], mt[j * 2 + 1], won, done); con(530, qy(i), 700, sfy(k), won && done); }));
      B.sf.forEach((mt, k) => [0, 1].forEach(j => { const i = 2 * k + j, won = mt[j * 2 + 1] > mt[(1 - j) * 2 + 1], done = Math.max(mt[1], mt[3]) >= need_('sf');
        h += row(700, sfy(i), 310, mt[j * 2], mt[j * 2 + 1], won, done); con(1010, sfy(i), 1150, gfy(k), won && done); }));
      const g = B.gf[0] || ['', 0, '', 0], gd = !!(g[0] && g[2]) && Math.max(g[1], g[3]) >= need(s);
      [0, 1].forEach(j => { const won = g[j * 2 + 1] > g[(1 - j) * 2 + 1]; h += row(1150, gfy(j), 310, g[j * 2], g[j * 2 + 1], won, gd); con(1460, gfy(j), 1580, chy, won && gd); });
      h += `<div class="champ" style="left:1580px;top:${chy - 8}px;width:300px;${gd ? '' : 'background:rgba(255,255,255,.05);box-shadow:none;color:#77777c;font-size:26px;padding-top:20px'}">${gd ? (g[1] > g[3] ? g[0] : g[2]) : 'TO BE DECIDED'}</div>`;
      box.innerHTML = `<div class="title disp hl">PLAYOFFS</div><svg width="1920" height="1080" style="position:absolute;left:0;top:0">${lines}</svg>` + h;
    } };
  };

  M.standings = root => {
    const m = E('div', 'mod on sd', root); const sc = sceneBg(m); chrome(m, 'STANDINGS'); const box = E('div', '', m); sceneFx(sc);
    return { update(s) { if (same(this, s)) return;
      const all = s.players.flatMap((ps, i) => ps.map(p => ({ ...p, t: i }))).sort((a, b) => b.acs - a.acs), top = all[0];
      box.innerHTML = `<div class="title disp hl">STANDINGS</div><div class="title-r mono">${s.event.name}</div><div class="tbl"><div class="hh mono"><div class="p">#</div><div class="n">TEAM</div><div class="c">W–L</div><div class="c">MAPS</div><div class="c">RND ±</div></div>` +
        s.standings.map((r, i) => `<div class="rw ${i ? '' : 'top'}" style="animation:tIn .5s ${.05 * i}s var(--ease) both;opacity:0;transform:translateY(20px)"><div class="p num">${i + 1}</div><div class="n">${r[0]}</div><div class="c num">${r[1]}</div><div class="c num">${r[2]}</div><div class="c num">${r[3]}</div></div>`).join('') + '</div>' +
        `<div class="side"><div class="k mono">EVENT MVP RACE</div><div class="v disp hl">${top.name}</div><div class="s mono">${s.teams[top.t].name}   /   ${top.acs} ACS</div></div>`;
    } };
  };

  M.holding = root => {
    const m = E('div', 'mod on ho', root); const sc = sceneBg(m);
    const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('class', 'streaks'); sv.setAttribute('viewBox', '0 0 1920 1080'); sc.appendChild(sv);
    [[-200, 1100, 700, 500, 2100, -100], [-100, 1250, 850, 650, 2150, 50], [100, 1300, 1000, 760, 2200, 180], [400, 1350, 1250, 850, 2300, 380]].forEach((b, i) => {
      sv.insertAdjacentHTML('beforeend', `<path d="M${b[0]} ${b[1]} Q${b[2]} ${b[3]} ${b[4]} ${b[5]}" fill="none" stroke="rgba(224,68,94,.14)" stroke-width="1.2"/><path d="M${b[0]} ${b[1]} Q${b[2]} ${b[3]} ${b[4]} ${b[5]}" fill="none" stroke="#f05a78" stroke-width="${i % 2 ? 1.4 : 2.2}" pathLength="1" stroke-dasharray=".35 1" style="animation:dash ${5 + i}s linear infinite;animation-delay:-${i * 1.3}s;opacity:.7"/>`); });
    const st = document.createElement('style'); st.textContent = '@keyframes dash{from{stroke-dashoffset:1.35}to{stroke-dashoffset:0}}'; document.head.appendChild(st);
    chrome(m, ''); const lf = E('div', 'left', m); const mk = E('img', 'mark', lf); mk.src = '../core/brand/lockup-mark.png';
    const big = E('div', 'big disp hl', lf), sub = E('div', 'sub', lf), cd = E('div', 'cd', lf), cdl = E('div', 'cdl mono', lf), nx = E('div', 'next', m), sch = E('div', 'sch', m), soc = E('div', 'soc mono', m); sceneFx(sc);
    const mode = s => Q.get('mode') || document.body.dataset.mode || s.holding.mode;
    if (SHOW_EDIT) {
      const st2 = document.createElement('style');
      st2.textContent = '.ho [data-edit]{pointer-events:auto;position:relative;z-index:5;cursor:text;border-radius:6px;outline:2px dashed transparent;outline-offset:8px;transition:outline-color .15s}.ho [data-edit]:hover{outline-color:rgba(255,255,255,.45)}.ho [data-edit]:focus{outline-color:#f05a78;outline-style:solid}';
      document.head.appendChild(st2);
      const post = m => window.parent.postMessage({ type: 'AIR_SHOW_TEXT', key: Q.get('editorKey'), ...m }, '*');
      const editable = (el, title, done) => {
        el.dataset.edit = '1'; el.contentEditable = 'plaintext-only'; el.spellcheck = false; el.title = title;
        el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } if (e.key === 'Escape') { el.dataset.cancel = '1'; el.blur(); } });
        el.addEventListener('blur', () => { if (el.dataset.cancel) { delete el.dataset.cancel; HUD.subs.forEach(f => f(HUD.state)); return; } done(el.textContent.trim()); });
      };
      editable(cd, 'Click to change the countdown (minutes)', text => { const n = parseInt(text.split(':')[0], 10); if (n >= 0) post({ minutes: Math.min(240, n) }); });
      cd.addEventListener('focus', () => { const sel = getSelection(); const r = document.createRange(); r.selectNodeContents(cd); sel.removeAllRanges(); sel.addRange(r); });
    }
    return { update(s) { if (same(this, s) && !SHOW_EDIT) return;
      const md = mode(s); const W = { starting: ['STARTING SOON', 'Stay locked in.', 'BROADCAST BEGINS IN'], brb: ['BE RIGHT BACK', 'Grab a drink, don\u2019t go far.', 'WE RETURN IN'], ending: ['THANKS FOR WATCHING', 'GG to both teams.', 'SEE YOU NEXT TIME'] }[md] || ['STARTING SOON', '', ''];
      txt(big, W[0]); if (document.activeElement !== sub) txt(sub, (s.holding.mode === md && s.holding.message) || W[1]); txt(cdl, W[2]); cd.style.display = md === 'ending' ? 'none' : '';
      const [a, b] = s.teams; nx.innerHTML = `<div class="k mono">${md === 'ending' ? 'FINAL' : 'UP NEXT'}   /   ${s.event.stage}</div><div class="m"><span class="t" style="color:${a.color}">${a.tag}</span><span class="v">vs</span><span class="t" style="color:${b.color}">${b.tag}</span></div><div class="s mono">${a.name}  /  ${b.name}${EMPTY_PREVIEW ? '' : ' · BO'+s.event.bestOf}</div>`;
      sch.innerHTML = s.schedule.map(x => `<div class="r ${x.done ? 'done' : ''}"><span class="tm num">${x.time}</span><span>${x.a && x.b ? x.a + '  VS  ' + x.b : ''}</span><span class="lab mono">${x.label}</span></div>`).join('');
      txt(soc, `${s.event.handle}   /   ${s.event.site}`);
    }, tick(s) { if (document.activeElement === cd) return; const t = s.holding.target ? (s.holding.target - HUD.now()) / 1000 : (s.holding.minutes || 0) * 60; const v = fmt(t); txt(cd, t <= 0 ? '0:00' : v.length < 5 ? '0' + v : v); } };
  };

  M.casters = root => {
    const m = E('div', 'mod on cs', root);
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); bg.setAttribute('class', 'holes'); bg.setAttribute('viewBox', '0 0 1920 1080');
    bg.innerHTML = `<defs><radialGradient id="cg1" cx="12%" cy="0%" r="70%"><stop offset="0" stop-color="#4a1522"/><stop offset="1" stop-color="#100f12"/></radialGradient></defs><path fill="url(#cg1)" fill-rule="evenodd" d="M0 0H1920V1080H0Z M120 250h820v462H120Z M980 250h820v462H980Z"/>`;
    m.appendChild(bg); chrome(m, 'ON THE DESK'); const box = E('div', '', m);
    return { update(s) { if (same(this, s)) return; box.innerHTML = `<div class="hd disp hl">${s.event.stage}</div><div class="hd2 mono">${s.teams[0].tag}  VS  ${s.teams[1].tag}   /   MAP ${s.map.number}</div>` +
      s.casters.slice(0, 2).map((c, i) => `<div class="frame ${i ? 'b' : 'a'}"></div><div class="plate ${i ? 'b' : 'a'}"><div class="n">${c.name}</div><div class="h mono">${c.handle}</div></div>`).join(''); } };
  };

  M.ticker = root => {
    const m = E('div', 'mod', root), tk = E('div', 'tk fx-rise', m), lab = E('div', 'lab mono', tk, '<img src="../core/brand/mark-44.png">ESPORTRA'), run = E('div', 'run', tk), belt = E('div', 'belt', run), clk = E('div', 'clock mono', tk); let sig = '';
    return { update(s) { toggle(m, s.show.ticker); const k = JSON.stringify(s.ticker); if (k === sig) return; sig = k; const items = s.ticker.map(t => `<span>${t}</span>`).join(''); belt.innerHTML = items + items; belt.style.animationDuration = Math.max(30, s.ticker.join('').length * .22) + 's'; },
      tick() { const d = new Date(); txt(clk, d.toTimeString().slice(0, 5)); } };
  };

  M.stinger = root => {
    const duration = 2;
    const m = E('div', 'mod stinger-layer', root), sg = E('div', 'sg', m); const w = ['w3', 'w1', 'w2'].map(c => E('div', 'w ' + c, sg)); const ul = E('div', 'ul', sg); const lg = E('img', 'lg', sg); lg.src = '../core/brand/lockup-mark.png';
    const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2, cl = x => Math.max(0, Math.min(1, x));
    // Two-second playback; retain the original wipe proportions (scene cut: 0.96s).
    window.stingerAt = t => {
      t *= 1.25 / duration;
      const d = [0, .06, .12]; w.forEach((e, i) => { const a = ease(cl((t - d[i]) / .42)), b = ease(cl((t - .66 - (2 - i) * .05) / .42)); const x = -120 + a * 120 + b * 130; e.style.transform = `translateX(${x}%) skewX(-18deg)`; });
      const lp = cl((t - .34) / .16), lo = cl((t - .72) / .1); lg.style.opacity = lp * (1 - lo); lg.style.transform = `scale(${.8 + .2 * ease(lp) + .12 * lo})`;
      const up = ease(cl((t - .42) / .18)); ul.style.width = (up * 160 * (1 - lo)) + 'px'; ul.style.left = (960 - up * 80 * (1 - lo)) + 'px';
    };
    window.stingerAt(0); let st = 0, animation = 0;
    if (HUD.preview && document.body.dataset.modules.split(',').includes('stinger')) {
      const started = performance.now();
      const frame = () => { window.stingerAt(((performance.now() - started) % 3000) / 1000); requestAnimationFrame(frame); };
      frame();
    }
    return { update(s, opts = {}) {
      const trigger = Number(s.stinger) || 0;
      if (trigger === st) return; st = trigger;
      if (HUD.preview) return;
      if (!trigger) { cancelAnimationFrame(animation); animation = 0; window.stingerAt(0); return; }
      // A restored snapshot may resume a current wipe; an old one must never replay.
      if (opts.snapshot) { const age = HUD.now() - trigger; if (age >= 0 && age < duration * 1000) play(age); }
      else play();
    }, tick() {} };
    function play(offset = 0) {
      cancelAnimationFrame(animation);
      const started = performance.now() - offset;
      const frame = now => {
        const t = Math.max(0, (now - started) / 1000);
        window.stingerAt(Math.min(duration, t));
        animation = t < duration ? requestAnimationFrame(frame) : 0;
      };
      frame(performance.now());
    }
  };

  // ═════════ EXTENDED LIBRARY ═════════
  const HOW = { elim: 'ELIMINATION', boom: 'SPIKE DETONATED', defuse: 'SPIKE DEFUSED', time: 'TIME EXPIRED' };
  // The game's own round-win icons (white), as the in-game round history uses. On a light colour (c dark) they turn black.
  const WIN_ICON = { elim: 'kills', boom: 'detonated', defuse: 'defused', time: 'timeout' };
  const RIC = (how, c = '#fff', z = 14) => {
    if (!WIN_ICON[how]) return '';
    const h = /^#([0-9a-f]{6})$/i.exec(c), lum = h ? [0, 2, 4].map(i => parseInt(h[1].slice(i, i + 2), 16)).reduce((a, v, i) => a + v * [.299, .587, .114][i], 0) : 255;
    return `<img class="win-ic" src="../core/assets/roundWinReason/${WIN_ICON[how]}.webp" alt="" width="${z}" height="${z}"${lum < 128 ? ' style="filter:brightness(0)"' : ''}>`;
  };
  HUD.roundIcon = RIC;
  const sideOf = (s, t, r) => { const f = (s.firstSide || ['ATK', 'DEF'])[t], o = f === 'ATK' ? 'DEF' : 'ATK'; return r <= 12 ? f : r <= 24 ? o : ((r - 25) % 2 ? o : f); };
  HUD.sideOf = sideOf;
  const alive = (s, t) => s.players[t].filter(p => p.alive);
  HUD.winProb = s => {                         // simple, explainable heuristic; set s.winProbOverride (0-100, team A) to drive it from a real model
    if (typeof s.winProbOverride === 'number') return s.winProbOverride / 100;
    const str = t => alive(s, t).reduce((a, p) => a + 1 + (+p.hp || 0) / 100 * .35 + (p.armor >= 50 ? .15 : p.armor ? .07 : 0), 0) + s.players[t].reduce((a, p) => a + (+p.credits || 0), 0) / 40000;
    let a = str(0), b = str(1); if (s.round.phase === 'planted') { if (sideOf(s, 0, s.round.number) === 'ATK') a += 1.2; else b += 1.2; }
    if (!a && !b) return .5; return a / (a + b);
  };

  M.roundhistory = root => {
    const m = E('div', 'mod', root), rh = E('div', 'rh fx-rise', m);
    const RHMAP = Object.fromEntries(Object.entries(WIN_ICON).map(([k, f]) => [k, `../core/assets/roundWinReason/${f}.webp`]));
    return { update(s) {
      toggle(m, (s.show.roundHistory || s.round.phase === 'buy') && !s.show.scoreboard);
      rh.classList.toggle('buy', s.round.phase === 'buy' && vis.economy(s));
      const n = Math.max(24, Math.min(30, Math.ceil((s.rounds.length + 1) / 2) * 2));
      const start = Math.max(0, Math.ceil((s.rounds.length + 1 - n) / 2) * 2);
      const half = i => i === 12 || (i >= 24 && i % 2 === 0);
      let header = '<div class="rh-head"><span class="rh-lab">ROUND</span>';
      for (let j = 0; j < n; j++) { const i = start + j; if (half(i)) header += '<span class="half"></span>'; header += `<span class="num ${i === s.rounds.length ? 'now' : ''}">${String(i + 1).padStart(2, '0')}</span>`; }
      header += '</div>';
      const buildRow = (teamIdx, isTop) => {
        const T = s.teams[teamIdx];
        let h = `<span class="rh-lab" style="--c:${T.color}">${T.tag || 'T' + (teamIdx + 1)}</span>`;
        for (let j = 0; j < n; j++) { const i = start + j;
          if (half(i)) {
            if (isTop && i === 12) {
              h += `<span class="half"><img src="../core/assets/misc/swapIcon.svg" width="16" height="16"></span>`;
            } else {
              h += '<span class="half"></span>';
            }
          }
          const r = s.rounds[i];
          if (r && r.w === teamIdx) {
            const icon = RHMAP[r.how] || '';
            const reason = HOW[r.how] || 'ROUND WON';
            h += `<span class="c w" style="--c:${T.color}" title="Round ${i + 1}: ${T.name} — ${reason}" aria-label="Round ${i + 1}: ${T.name} — ${reason}">${icon ? `<span class="result-icon" style="--result:url('${icon}')"></span>` : ''}</span>`;
          } else {
            const isCurrent = i === s.rounds.length;
            h += `<span class="c${isCurrent ? ' now' : ''}"></span>`;
          }
        }
        return `<div class="rh-row" style="--c:${T.color}">${h}</div>`;
      };
      rh.innerHTML = header + buildRow(0, true) + buildRow(1, false);
    } };
  };

  M.winprob = root => { const m = E('div', 'mod', root), wp = E('div', 'winp fx-rise', m), na = E('div', 'n num', wp), bar = E('div', 'bar', wp), ia = E('i', '', bar), ib = E('i', '', bar); E('b', '', bar); E('div', 'lab mono', wp, 'WIN PROBABILITY'); const nb = E('div', 'n num', wp);
    return { update(s) { toggle(m, s.show.winProb && ['live', 'planted', 'buy'].includes(s.round.phase) && !s.show.scoreboard); const p = HUD.winProb(s);
      ia.style.width = (p * 100) + '%'; ib.style.width = (100 - p * 100) + '%'; ia.style.background = s.teams[0].color; ib.style.background = s.teams[1].color;
      txt(na, Math.round(p * 100) + '%'); txt(nb, Math.round(100 - p * 100) + '%'); na.style.color = s.teams[0].color; nb.style.color = s.teams[1].color; } }; };

  M.spiketimer = root => {
    const m = E('div', 'mod scorebug-layer', root), sk = E('div', 'sk sb-mid notch-b', m), icon = E('div', 'tm', sk);
    return { update(s) {
      const on = s.show.spikeTimer && s.round.phase === 'planted' && !s.show.scoreboard;
      toggle(m, on); icon.classList.toggle('planted', !!on);
      if (on) pulseSpike(icon, s.round); else delete icon.dataset.spikeDeadline;
    }, tick(s) { if (m.classList.contains('on')) pulseSpike(icon, s.round); } };
  };

  M.moments = root => { const m = E('div', 'mod', root), mo = E('div', 'mo', m); let sig = '';
    function items(s) { const out = [], n = HUD.now(), live = ts => Number.isFinite(ts) && ts > 0 && n >= ts && n - ts < 6500, kf = s.killfeed;
      if (kf.length && live(kf[0].ts)) { const k = P(s, kf[0].killer); if (k) out.push({ id: 'fb', t: kf[0].killer[0], k: 'FIRST BLOOD', p: k, sub: 'ON ' + (P(s, kf[0].victim) || {}).name, priority: 1 }); }
      const cnt = {}; kf.forEach(e => { const id = e.killer.join(); cnt[id] = cnt[id] || { n: 0, e }; cnt[id].n++; cnt[id].e = e; });
      Object.values(cnt).forEach(c => { if (c.n >= 2 && live(c.e.ts)) out.push({ id: 'mk' + c.e.killer + c.n, t: c.e.killer[0], k: c.n >= 5 ? 'ACE' : c.n + 'K', p: P(s, c.e.killer), sub: 'THIS ROUND', priority: c.n + 2 }); });
      if (['live', 'planted'].includes(s.round.phase)) [0, 1].forEach(t => { const a = alive(s, t), b = alive(s, 1 - t); if (a.length === 1 && b.length >= 2) out.push({ id: 'cl' + t + b.length, t, k: '1V' + b.length, p: a[0], sub: 'CLUTCH ATTEMPT', priority: 2 }); });
      return out.sort((a, b) => b.priority - a.priority).slice(0, 1); }
    return { update(s) { toggle(m, s.show.moments && !vis.focused(s) && !vis.economy(s)); this.tick(s); }, tick(s) { const it = items(s), k = it.map(x => x.id).join('|'); if (k === sig) return; sig = k;
      mo.innerHTML = it.map(x => { const A = agent(x.p.agent), c = s.teams[x.t].color; return `<div class="m" style="--c:${c};--ci:${ink(c)}"><div class="k">${x.k}</div>${A ? `<img src="${A.icon}">` : ''}<div class="t">${x.p.name}</div><div class="s mono">${x.sub}</div></div>`; }).join(''); } }; };

  M.toast = root => { const m = E('div', 'mod', root), ts = E('div', 'ts', m); E('div', 'k mono', ts, 'UPDATE'); const t = E('div', 't', ts), sp = E('div', 'ts-sp mono', ts);
    return { update(s) { txt(t, s.toast.text || ''); HUD.morph(sp, spaceOf(s, 'toast')); }, tick(s) { ts.classList.toggle('on', !!(s.toast.ts && HUD.now() - s.toast.ts < 7000) || Q.get('toast') === '1'); } }; };

  M.sponsor = root => { const m = E('div', 'mod', root), sp = E('div', 'spn fx-rise', m); E('div', 'k mono', sp, 'PRESENTED BY'); const v = E('div', 'v', sp); let cur = -1, signature = '';
    return { update(s) { toggle(m, s.show.sponsor && s.sponsors.length && vis.players(s)); const next = JSON.stringify([s.sponsors, s.layout?.sponsorRotation, s.layout?.sponsorSeconds]); if (signature !== next) { signature = next; cur = -1; } this.tick(s); }, tick(s) { if (!s.sponsors.length) return; const seconds = Number.isInteger(s.layout?.sponsorSeconds) && s.layout.sponsorSeconds >= 5 && s.layout.sponsorSeconds <= 120 ? s.layout.sponsorSeconds : 8; const i = s.layout?.sponsorRotation === false ? 0 : Math.floor(HUD.now() / (seconds * 1000)) % s.sponsors.length; if (i === cur) return; cur = i; const x = s.sponsors[i];
      v.style.animation = 'none'; void v.offsetWidth; v.style.animation = ''; v.innerHTML = x.logo ? `<img src="${x.logo}"><span class="mono">${x.line || ''}</span>` : `<b>${x.name}</b><span class="mono">${x.line || ''}</span>`; } }; };

  /** The sponsor bought for a space (Air's sponsor spaces), as "BY <logo or name>"; '' when none. */
  const spaceOf = HUD.spaceOf = (s, space) => { const x = s.airSpaces && s.airSpaces[space]; return x && x.name ? `BY ${logoOk(x.logo) ? `<img src="${escH(x.logo)}" alt="${escH(x.name)}">` : escH(x.name)}` : ''; };
  M.eventbug = root => { const m = E('div', 'mod', root), eb = E('div', 'eb fx-rise', m); const im = E('img', '', eb); im.src = '../core/brand/mark-44.png'; const a = E('div', 'a mono', eb);
    return { update(s) { toggle(m, s.show.eventBug); const sp = spaceOf(s, 'event-bug'); a.innerHTML = `${escH(s.event.name)}<b>${escH(s.event.stage)}</b>${sp ? `<i class="eb-sp">${sp}</i>` : ''}`; } }; };

  M.poll = root => { const m = E('div', 'mod', root), pq = E('div', 'pq fx-rise', m);
    return { update(s) { toggle(m, s.show.poll); const tc = l => (s.teams.find(t => t.tag === l) || {}).color || 'var(--red)';
      pq.innerHTML = `<div class="k mono">LIVE POLL</div><div class="q">${s.poll.question}</div>` + s.poll.options.map(o => `<div class="o" style="--c:${tc(o.label)}"><div class="l mono">${o.label}</div><div class="b"><i style="width:${o.pct}%"></i></div><div class="p num">${o.pct}%</div></div>`).join('') + `<div class="v mono">${money(s.poll.votes)} VOTES</div>`; } }; };



  M.roundrecap = root => { const m = E('div', 'mod', root), rr = E('div', 'rr fx-rise', m);
    return { update(s) { toggle(m, vis.recap(s)); const last = s.rounds[s.rounds.length - 1]; if (!last) return; const W = s.teams[last.w];
      const kills = {}; s.killfeed.forEach(k => { const id = k.killer.join(); kills[id] = (kills[id] || 0) + 1; });
      rr.style.setProperty('--c', W.color); rr.style.setProperty('--ci', ink(W.color));
      rr.innerHTML = `<div class="hd">${RIC(last.how, ink(W.color), 22)}<div class="t">${W.name} TAKE ROUND ${s.rounds.length}</div><div class="s mono">${HOW[last.how] || ''}</div></div><div class="cols">` +
        [0, 1].map(t => `<div class="col">` + s.players[t].map((p, j) => { const A = agent(p.agent), k = kills[t + ',' + j] || 0; return `<div class="r ${p.alive ? '' : 'dead'}">${A ? `<img src="${A.icon}">` : ''}<div class="n">${p.name}</div><div class="k mono"><b>${k}</b> K THIS ROUND</div></div>`; }).join('') + '</div>').join('') +
        `</div><div class="ft mono">${s.teams.map((T, t) => `<span>${T.tag} BANK <b>${money(s.players[t].reduce((a, p) => a + (+p.credits || 0), 0))}</b></span>`).join('')}<span>SCORE ${s.teams[0].score} – ${s.teams[1].score}</span></div>`; } }; };

  M.duel = root => { const m = E('div', 'mod', root), du = E('div', 'du fx-rise', m);
    return { update(s) { toggle(m, s.show.duel && !s.show.scoreboard && !s.show.teamCompare); const d = s.duel, a = P(s, d.a), b = P(s, d.b); if (!a || !b) return;
      const side = (p, t, c) => { const A = agent(p.agent); return `<div class="p ${c}" style="--c:${s.teams[t].color}"><div class="bgc" style="background:linear-gradient(180deg,#${A && A.grad[0] || '333'},transparent)"></div>${A ? `<img src="${A.full}">` : ''}<div class="sh"></div><div class="n">${p.name}</div><div class="t mono">${s.teams[t].tag}   /   ${A ? A.name : ''}</div></div>`; };
      const ratio = p => (+p.k || 0) / Math.max(1, +p.d || 0);
      const rows = [['KILLS', a.k, b.k, 1], ['DEATHS', a.d, b.d, -1], ['ASSISTS', a.a, b.a, 1], ['K/D', ratio(a), ratio(b), 1],
        ['FIRST KILLS', a.fk, b.fk, 1], ['CREDITS', a.credits, b.credits, 1], ['ULT', a.ult, b.ult, 1], ['ACS', a.acs > 0 ? a.acs : null, b.acs > 0 ? b.acs : null, 1]];
      const display = (label, value, p) => value == null ? '—' : label === 'K/D' ? value.toFixed(2) : label === 'CREDITS' ? money(value) : label === 'ULT' ? `${value || 0}/${p.ultMax || 7}` : value;
      du.innerHTML = side(a, d.a[0], 'a') + side(b, d.b[0], 'b') + `<div class="hd mono">${d.title || 'HEAD TO HEAD'}</div><div class="rows">` + rows.map(([label, x, y, dir]) =>
        `<div class="row"><div class="v ${x != null && y != null && (x - y) * dir > 0 ? 'win' : ''}">${display(label, x, a)}</div><div class="l mono">${label}</div><div class="v ${x != null && y != null && (y - x) * dir > 0 ? 'win' : ''}">${display(label, y, b)}</div></div>`).join('') + '</div>'; } }; };

  M.teamcompare = root => { const m = E('div', 'mod', root), tc = E('div', 'tc fx-rise', m);
    return { update(s) { toggle(m, s.show.teamCompare && !s.show.scoreboard); const [A, B] = s.teams, S = s.teamStats || [{}, {}];
      const sum = (t, key) => s.players[t].reduce((total, p) => total + (+p[key] || 0), 0);
      const acs = t => s.players[t].every(p => p.acs > 0) ? Math.round(sum(t, 'acs') / s.players[t].length) : null;
      const defuses = t => Math.max(+S[t].defuses || 0, s.rounds.filter(r => r.w === t && r.how === 'defuse').length);
      const rows = [['ROUNDS WON', A.score, B.score], ['TOTAL KILLS', sum(0, 'k'), sum(1, 'k')], ['TEAM BANK', sum(0, 'credits'), sum(1, 'credits')],
        ['ULTIMATES READY', s.players[0].filter(p => +p.ult >= +p.ultMax).length, s.players[1].filter(p => +p.ult >= +p.ultMax).length],
        ['FIRST KILLS', S[0].firstKills, S[1].firstKills], ['SPIKE PLANTS', S[0].plants, S[1].plants], ['DEFUSES', defuses(0), defuses(1)],
        ['CLUTCHES', S[0].clutches, S[1].clutches], ['ECO WINS', S[0].ecoWins, S[1].ecoWins], ['AVERAGE ACS', acs(0), acs(1)]];
      tc.style.setProperty('--a', A.color); tc.style.setProperty('--b', B.color);
      tc.innerHTML = `<div class="hd"><div class="t" style="color:${A.color}">${A.tag}</div><div class="k mono">TEAM COMPARISON   /   MAP ${s.map.number}</div><div class="t" style="color:${B.color}">${B.tag}</div></div>` +
        rows.map(([l, x, y]) => { const tot = (+x || 0) + (+y || 0) || 1; return `<div class="row"><div class="v">${x == null ? '—' : l === 'TEAM BANK' ? money(x) : x}</div><div class="bar a"><i style="width:${(+x || 0) / tot * 100}%"></i></div><div class="l mono">${l}</div><div class="bar b"><i style="width:${(+y || 0) / tot * 100}%"></i></div><div class="v">${y == null ? '—' : l === 'TEAM BANK' ? money(y) : y}</div></div>`; }).join(''); } }; };

  M.clock = root => { const m = E('div', 'mod on', root), ck = E('div', 'ck', m), k = E('div', 'k mono', ck), v = E('div', 'v', ck);
    return { update(s) { txt(k, { starting: 'WE GO LIVE IN', brb: 'BACK IN', ending: 'NEXT SHOW' }[s.holding.mode] || 'BREAK'); }, tick(s) { const t = s.holding.target ? (s.holding.target - HUD.now()) / 1000 : (s.holding.minutes || 0) * 60; txt(v, fmt(t)); } }; };

  // full-screen scenes
  M.profile = root => { const m = E('div', 'mod on pp', root); const sc = sceneBg(m); const wash = E('div', 'wash', sc); chrome(m, 'PLAYER SPOTLIGHT'); const box = E('div', '', m); sceneFx(sc);
    return { update(s) { if (same(this, s) && this._sp === JSON.stringify(s.spotlight)) return; this._sp = JSON.stringify(s.spotlight); const sp = s.spotlight, p = P(s, [sp.team, sp.player]); if (!p) return; const A = agent(p.agent), T = s.teams[sp.team], se = sp.season || {};
      wash.style.background = `radial-gradient(ellipse at 60% 40%,#${A && A.grad[0] || '444'},transparent 65%)`;
      box.innerHTML = `${photoOk(p.photo) ? `<img class="por photo" src="${p.photo}">` : A ? `<img class="por" src="${A.full}">` : ''}<div class="k mono" style="--c:${T.color}">${T.name}   /   ${A ? A.role : ''}</div><div class="n disp hl">${p.name}</div><div class="a mono">${A ? A.name : ''}   /   ${s.event.stage}</div>` +
        `<div class="grid">${[[p.acs, 'ACS THIS MAP'], [`${p.k}/${p.d}/${p.a}`, 'K / D / A'], [p.adr, 'ADR'], [se.rating, 'EVENT RATING'], [se.kpr, 'KILLS PER ROUND'], [se.clutches, 'CLUTCHES WON']].map(([v, l]) => `<div>${v ?? '–'}<small>${l}</small></div>`).join('')}</div>${sp.quote ? `<div class="q">“${sp.quote}”</div>` : ''}`;
      box.querySelector('.k').style.color = T.color; } }; };

  M.roster = root => { const m = E('div', 'mod on tr', root); const sc = sceneBg(m); chrome(m, 'TEAM'); const box = E('div', '', m); sceneFx(sc);
    return { update(s) { if (same(this, s)) return; const t = +(Q.get('team') || document.body.dataset.team || 0), T = s.teams[t];
      const live = s.players[t].some(player => player.name), registered = (s.registeredRoster?.[t] || []).filter(player => ['starter', 'registered'].includes(player.role)).slice(0, 5);
      const players = live || !registered.length ? s.players[t] : registered;
      const text = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
      box.innerHTML = `<div class="head" style="--c:${T.color}"><div class="lgx"></div><div><div class="t disp hl">${T.name}</div><div class="s mono">${s.event.name}   /   ${s.event.stage}</div></div></div><div class="cards" style="--c:${T.color}">` +
        players.map((p, j) => { const A = agent(p.agent); return `<div class="cd" style="animation:tIn .6s ${.08 * j}s var(--ease) both;opacity:0;transform:translateY(40px)"><div class="bgc" style="background:linear-gradient(180deg,#${A && A.grad[0] || '333'},transparent)"></div>${photoOk(p.photo) ? `<img class="photo" src="${p.photo}">` : A ? `<img src="${A.full}">` : ''}<div class="sh"></div><div class="n">${text(p.name)}</div><div class="a mono">${A ? A.name + '  /  ' + A.role : ''}</div><div class="s mono">${live ? `${p.acs} ACS   ${p.k}/${p.d}/${p.a}` : 'REGISTERED LINEUP · WAITING FOR GAME DATA'}</div></div>`; }).join('') + '</div>';
      const l = logo(T, 120, box.querySelector('.lgx')); l.style.position = 'relative'; } }; };

  const mapBreak = half => root => { const m = E('div', 'mod on mb', root); const sc = sceneBg(m); chrome(m, half ? 'HALFTIME' : 'MAP BREAKDOWN'); const title = E('div', 'title disp hl', m, half ? 'HALFTIME' : 'MAP BREAKDOWN'); const box = E('div', '', m); const pres = presented(m); sceneFx(sc);
    return { update(s) { if (!half) { s = withRecord(s); pres(s, 'breakdown'); } if (same(this, s) && this._r === s.rounds.length) return; this._r = s.rounds.length; const R = half ? s.rounds.slice(0, 12) : s.rounds;
      const won = (t, a, b) => R.slice(a, b).filter(r => r.w === t).length, sc_ = t => R.filter(r => r.w === t).length;
      const sides = t => [0, 1].map(h => sideOf(s, t, h ? 13 : 1));
      let h = `<div class="score">${s.teams.map((T, t) => `<div class="t" style="color:${T.color}">${T.tag}</div>`).join(`<div class="v disp hl">${sc_(0)}–${sc_(1)}</div>`)}</div>`;
      h += `<div class="halves"><div class="row h"><div>TEAM</div><div>FIRST HALF</div><div>SECOND HALF</div><div>OVERTIME</div></div>` + s.teams.map((T, t) => `<div class="row"><div class="n" style="color:${T.color}">${T.name}</div><div class="v">${won(t, 0, 12)}<small class="mono" style="font-size:11px;color:#8a8a90;margin-left:8px">${sides(t)[0]}</small></div><div class="v">${half ? '–' : won(t, 12, 24)}${half ? '' : `<small class="mono" style="font-size:11px;color:#8a8a90;margin-left:8px">${sides(t)[1]}</small>`}</div><div class="v">${R.length > 24 ? won(t, 24, 99) : '–'}</div></div>`).join('') + '</div>';
      h += `<div class="tl"><div class="k mono">ROUND BY ROUND</div><div class="strip">` + R.map((r, i) => (i === 12 ? '<div class="half"></div>' : '') + `<div class="c w" style="--c:${s.teams[r.w].color}"><em>${i + 1}</em>${RIC(r.how, '#fff', 26)}</div>`).join('') + '</div></div>';
      const S = s.teamStats || [{}, {}];
      if (half) { const T0 = s.teams[0], T1 = s.teams[1]; h += `<div class="note">SIDES SWITCH<small>${T0.tag} TO ${sides(0)[1]}   /   ${T1.tag} TO ${sides(1)[1]}</small></div>`; }
      h += `<div class="side">${[['ATTACK ROUNDS WON', t => R.filter((r, i) => r.w === t && sideOf(s, t, i + 1) === 'ATK').length], ['DEFENSE ROUNDS WON', t => R.filter((r, i) => r.w === t && sideOf(s, t, i + 1) === 'DEF').length], ['SPIKE PLANTS', t => S[t].plants], ['CLUTCHES', t => S[t].clutches]].map(([l, f]) => `<div class="r"><b style="color:${s.teams[0].color}">${f(0) ?? '–'}</b><span>${l}</span><b style="color:${s.teams[1].color}">${f(1) ?? '–'}</b></div>`).join('')}</div>`;
      box.innerHTML = h; } }; };
  M.mapbreakdown = mapBreak(false); M.halftime = mapBreak(true);

  M.champion = root => { const m = E('div', 'mod on ch', root); const sc = sceneBg(m);
    const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('class', 'rays'); sv.setAttribute('viewBox', '0 0 1920 1080');
    let r = ''; for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; r += `<line x1="960" y1="260" x2="${960 + Math.cos(a) * 1400}" y2="${260 + Math.sin(a) * 1400}" stroke="rgba(224,68,94,${i % 2 ? .05 : .11})" stroke-width="${i % 3 ? 1 : 2}"/>`; } sv.innerHTML = r; sc.appendChild(sv);
    chrome(m, 'CHAMPIONS'); const box = E('div', '', m); sceneFx(sc); const pres = presented(m);
    const TROPHY = c => `<svg class="tro" viewBox="0 0 300 330"><path d="M70 20H230V120C230 175 195 210 150 215C105 210 70 175 70 120Z" fill="none" stroke="${c}" stroke-width="6"/><path d="M70 45H28C28 105 52 130 80 140M230 45H272C272 105 248 130 220 140" fill="none" stroke="${c}" stroke-width="6"/><path d="M150 215V265M100 300H200L185 265H115Z" fill="none" stroke="${c}" stroke-width="6"/><path d="M150 55L172 95L150 120L128 95Z" fill="${c}"/><path d="M95 300H205V318H95Z" fill="${c}"/></svg>`;
    return { update(s) { pres(s, 'victory'); if (same(this, s)) return; let w = s.champion && s.champion.team >= 0 ? s.champion.team : s.teams[0].series === s.teams[1].series ? (s.teams[0].score >= s.teams[1].score ? 0 : 1) : (s.teams[0].series > s.teams[1].series ? 0 : 1); const T = s.teams[w], L = s.teams[1 - w];
      box.innerHTML = TROPHY('#f2cf6b') + `<div class="k mono">${s.event.name}   /   CHAMPIONS</div><div class="t disp hl">${T.name}</div><div class="s mono">DEFEAT ${L.name} ${Math.max(T.series, need(s))}–${Math.min(L.series, need(s) - 1)} IN THE ${s.event.stage}</div><div class="roster" style="--c:${T.color}">` +
        s.players[w].map(p => { const A = agent(p.agent); return `<div>${A ? `<img src="${A.icon}">` : ''}${p.name}</div>`; }).join('') + '</div>'; } }; };

  M.schedule = root => { const m = E('div', 'mod on sc2', root); const sc = sceneBg(m); chrome(m, 'SCHEDULE'); E('div', 'title disp hl', m, 'TODAY'); const hr = E('div', 'title-r mono', m); const box = E('div', 'list', m); sceneFx(sc);
    return { update(s) { if (same(this, s)) return; txt(hr, s.event.name); const live = s.schedule.findIndex(x => !x.done);
      box.innerHTML = s.schedule.map((x, i) => `<div class="r ${x.done ? 'done' : ''} ${i === live ? 'live' : ''}"><div class="tm">${x.time}</div><div class="m">${x.a && x.b ? `${x.a}<i>vs</i>${x.b}` : `<span style="font-size:36px">${x.label}</span>`}${i === live ? '<span class="lv">NEXT UP</span>' : ''}</div><div class="l mono">${x.a && x.b ? x.label : ''}</div></div>`).join(''); } }; };

  M.seriesmaps = root => {
    const m = E('div', 'mod', root), sm = E('div', 'sm fx-rise', m);
    function buildTile(s, x, i) {
      const liveIdx = s.map.number - 1;
      const isPast = x.winner !== null;
      const isLive = !isPast && i === liveIdx;
      const isNext = !isPast && !isLive && i === liveIdx + 1;
      const isDec  = !isPast && !isLive && x.pick === -1;
      const stateClass = isPast ? 'past' : isLive ? 'live' : 'future';
      let badge = '';
      if (isLive) badge = `<span class="bd live">CURRENT:</span>`;
      else if (isDec) badge = `<span class="bd dec">DECIDER:</span>`;
      else if (isNext) badge = `<span class="bd next">NEXT:</span>`;
      const pickLogo = x.pick >= 0 && s.teams[x.pick].logo ? `<img class="wl" src="${s.teams[x.pick].logo}">` : '';
      const winLogo = isPast && x.winner !== null && s.teams[x.winner].logo ? `<img class="wl" src="${s.teams[x.winner].logo}">` : '';
      let score = '';
      if (isPast && x.score) score = `<span class="sc">${x.score[0]}-${x.score[1]}</span>`;
      else if (isLive) score = `<span class="sc">${s.teams[0].score}-${s.teams[1].score}</span>`;
      return `<div class="tile ${stateClass}">${isPast ? winLogo : pickLogo}${badge}<span class="mn">${x.map}</span>${score}</div>`;
    }
    return { update(s) {
      if (s.series.length <= 1) { toggle(m, false); return; }
      toggle(m, s.show.seriesMaps !== false);
      sm.innerHTML = s.series.map((x, i) => buildTile(s, x, i)).join('');
    } };
  };

  // Full-screen host: one browser source that shows the graphic named in state.airFullscreen
  // (set by Esportra Air), so switching full-screen graphics never touches OBS.
  const OVER_ONLY = Q.get('over') === '1';
  // A browser source for one graphic (Air's Rundown › Copy browser source, 17 Nov): ?only=<screen> shows that
  // graphic alone, only while Air has it on air (or always with &always=1), in &style=full|band (else the Take's).
  const ONLY = Q.get('only'), ALWAYS = Q.get('always') === '1', ONLY_STYLE = Q.get('style');
  const FULLSCREEN = { 'match-intro': 'intro', 'map-veto': 'veto', 'agent-select': 'lineups', 'map-result': 'mapresult', series: 'series', halftime: 'halftime', standings: 'standings', 'player-profile': 'profile', champion: 'champion', 'cam-grid': 'camgrid', schedule: 'schedule', bracket: 'bracket', 'map-breakdown': 'mapbreakdown', 'postgame-player': 'pgplayer', 'postgame-matchup': 'matchup' };
  M.fullscreen = root => {
    const slots = {};
    let shown = null, fsSp = null;
    // airFullscreenStyle 'band' shows the over-the-game version (core/bands.js) where there is one.
    const slot = key => {
      if (!slots[key]) { const [id, style] = key.split('|'); const el = E('div', 'fs-slot', root); el.style.display = 'none'; slots[key] = { el, part: style === 'own' ? M.ownslot(el, id.slice(4)) : M[style === 'band' ? HUD.BANDS[id] : FULLSCREEN[id]](el) }; }
      return slots[key];
    };
    return {
      update(s, opts) {
        const band = s.airFullscreenStyle === 'band' && HUD.BANDS && HUD.BANDS[s.airFullscreen] && M[HUD.BANDS[s.airFullscreen]];
        // The producer's own graphics (core/own.js) are `own:<id>`, defined in state.airOwn.
        const own = typeof s.airFullscreen === 'string' && s.airFullscreen.startsWith('own:') && M.ownslot && HUD.OWN.find(s, s.airFullscreen.slice(4));
        let want = own ? s.airFullscreen + '|own' : FULLSCREEN[s.airFullscreen] ? s.airFullscreen + (band ? '|band' : '|full') : null;
        // The copies over the game and over the desk (?over=1) show only over-the-game versions: a
        // full-screen graphic covers the whole picture, so it lives in the Full screen scene the crew switches to.
        if (OVER_ONLY && want && !(want.endsWith('|band') || (own && own.style === 'band'))) want = null;
        if (ONLY) {
          const onAir = s.airFullscreen === ONLY;
          const style = ONLY_STYLE === 'band' || ONLY_STYLE === 'full' ? ONLY_STYLE : onAir && s.airFullscreenStyle === 'band' ? 'band' : 'full';
          const mine = ONLY.startsWith('own:') ? (M.ownslot && HUD.OWN.find(s, ONLY.slice(4)) ? ONLY + '|own' : null)
            : FULLSCREEN[ONLY] ? ONLY + (style === 'band' && HUD.BANDS && HUD.BANDS[ONLY] && M[HUD.BANDS[ONLY]] ? '|band' : '|full') : null;
          want = onAir || ALWAYS ? mine : null;
        }
        if (want !== shown) {
          // An own graphic plays its exit (fade or slide) before it is hidden.
          if (shown && slots[shown].part.leave) { const was = shown; slots[was].part.leave(s, () => { if (shown !== was) slots[was].el.style.display = 'none'; }); }
          else if (shown) slots[shown].el.style.display = 'none';
          if (want && slots[want] && slots[want].part.play) slots[want].part.play(s);
          if (want) { const sl = slot(want); sl.el.style.display = ''; }
          shown = want;
          HUD.fsShown = shown ? { el: slots[shown].el, key: shown, fresh: true } : null;
        }
        if (shown) slots[shown].part.update(s, opts);
        // The sponsor bought for this graphic's space (post-game graphics place their own).
        const space = { 'map-veto': 'map-veto', 'agent-select': 'agent-select' }[shown], sp = space ? spaceOf(s, space) : '';
        if (!fsSp) fsSp = E('div', 'fs-sp', root);
        if (sp) HUD.morph(fsSp, sp.replace(/^BY /, 'PRESENTED BY '));
        fsSp.classList.toggle('on', !!sp);
      },
      tick(s) { if (shown && slots[shown].part.tick) slots[shown].part.tick(s); },
      frame(s) { if (shown && slots[shown].part.frame) slots[shown].part.frame(s); },
    };
  };

  M.ingame = root => { const parts = ['minimap', 'eventbug', 'seriesmaps', 'scorebug', 'winprob', 'roundhistory', 'toast', 'killfeed', 'moments', 'poll', 'players', 'playercams', 'observed', 'sponsor', 'roundrecap', 'economy', 'duel', 'teamcompare', 'scoreboard', 'banner', 'replay', 'lowerthird', 'stinger'].map(k => M[k](root)); return { update(s, opts) { parts.forEach(p => p.update(s, opts)); }, tick(s) { parts.forEach(p => p.tick && p.tick(s)); }, frame(s) { parts.forEach(p => p.frame && p.frame(s)); } }; };

  // Sample previews activate the requested source without publishing or consuming live state.
  function previewState(list) {
    const s = clone(HUD_DEFAULT);
    if (Q.has('bannerTheme')) s.layout.bannerTheme = bannerTheme(Q.get('bannerTheme'));
    const gates = {scorebug:'scorebug', players:'players', observed:'observed', minimap:'minimap', economy:'economy', scoreboard:'scoreboard', lowerthird:'lowerThird', replay:'replay', ticker:'ticker', roundhistory:'roundHistory', winprob:'winProb', spiketimer:'spikeTimer', moments:'moments', sponsor:'sponsor', eventbug:'eventBug', poll:'poll', duel:'duel', teamcompare:'teamCompare', roundrecap:'roundRecap', playercams:'playerCams'};
    Object.assign(s.show, {economy:false, scoreboard:false, teamCompare:false, duel:false, roundRecap:false});
    list.forEach(name => { if (gates[name]) s.show[gates[name]] = true; });
    s.round.phase = 'live'; s.round.endsAt = previewNow + 84000;
    if (list.includes('economy')) s.round.phase = 'buy';
    if (list.includes('roundrecap')) s.round.phase = 'end';
    if (list.includes('spiketimer')) { s.round.phase = 'planted'; s.round.endsAt = previewNow + 26000; }
    if (list.includes('moments')) {
      s.killfeed = [{killer:[1,0], victim:[0,3], weapon:'OPERATOR', hs:false, ts:previewNow - 200},
        {killer:[1,0], victim:[0,4], weapon:'OPERATOR', hs:false, ts:previewNow - 100}];
    }
    if (list.includes('banner')) Object.assign(s.banner, {type:bannerTheme(s.layout.bannerTheme) !== 'broadcast' ? 'flawless' : 'ace', team:1, player:0, ts:previewNow - 100});
    if (list.includes('toast')) s.toast.ts = previewNow - 100;
    return s;
  }

  // ───── demo simulator (?demo=1): loops a fast round so overlays can be tested without the control panel ─────
  function demo() {
    let s = HUD.state; const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1)); const W = ['VANDAL', 'PHANTOM', 'OPERATOR', 'SHERIFF', 'SPECTRE', 'GHOST'];
    function newRound() { s.round.number++; s.round.phase = 'buy'; s.round.endsAt = HUD.now() + 8000; s.killfeed = [];
      s.players.forEach(t => t.forEach(p => { p.alive = true; p.hp = 100; p.armor = [25, 50][R(0, 1)]; p.credits = R(4, 90) * 100; p.weapon = W[R(0, 4)]; })); HUD.commit(s, { local: true }); }
    function step() {
      const n = HUD.now(), r = s.round;
      if (r.phase === 'buy' && n > r.endsAt) { r.phase = 'live'; r.endsAt = n + 100000; }
      else if (r.phase === 'live' || r.phase === 'planted') {
        const alive = [0, 1].map(i => s.players[i].map((p, j) => [i, j]).filter(([i, j]) => s.players[i][j].alive));
        if (Math.random() < .5 && alive[0].length && alive[1].length) { const kt = R(0, 1), k = alive[kt][R(0, alive[kt].length - 1)], v = alive[1 - kt][R(0, alive[1 - kt].length - 1)];
          const P_ = s.players[k[0]][k[1]], V = s.players[v[0]][v[1]]; V.alive = false; V.hp = 0; V.d++; P_.k++; P_.hp = Math.max(1, P_.hp - R(0, 60)); P_.ult = Math.min(P_.ultMax, P_.ult + 1);
          s.killfeed.push({ killer: k, victim: v, weapon: P_.weapon, hs: Math.random() < .3, ts: n }); if (!P_.alive) s.observed = k; s.observed = k; }
        if (r.phase === 'live' && Math.random() < .12) { r.phase = 'planted'; r.endsAt = n + 45000; }
        const a0 = s.players[0].some(p => p.alive), a1 = s.players[1].some(p => p.alive);
        if (!a0 || !a1) { const w = a0 ? 0 : 1; s.teams[w].score++; if (s.teams[w].score > 13 && s.teams[w].score - s.teams[1 - w].score >= 2) s.teams.forEach(t => t.score = 0);
          s.banner = { type: 'round', team: w, player: 0, text: '', method: r.phase === 'planted' && w === 0 ? 'SPIKE DEFUSED' : 'ELIMINATION', ts: n, hold: 3000 }; r.phase = 'end'; r.endsAt = 0; r.remaining = 0; HUD.commit(s, { local: true }); setTimeout(newRound, 4000); return; }
      }
      HUD.commit(s, { local: true });
    }
    setInterval(step, 1300);
  }

  // ───── boot ─────
  function fit(el) { const k = Math.min(innerWidth / 1920, innerHeight / 1080); el.style.transform = `scale(${k})`; }
  function boot() {
    const root = document.getElementById('hud'); if(MATCH&&root&&!receivedMatch){root.style.visibility='hidden';const waiting=document.createElement('p');waiting.id='waiting-match-data';waiting.textContent='Waiting for match data';Object.assign(waiting.style,{color:'#afbdd0',font:'24px Arial',padding:'48px'});document.body.appendChild(waiting);} if (!root) { window.HUD_READY = true; return; } fit(root); addEventListener('resize', () => fit(root));
    // ?bg=1 shows the map behind a preview; until (or unless) its picture loads, a studio-like backdrop.
    const DESK = 'radial-gradient(60% 70% at 50% 30%, #3a3448, #15131c 70%), #15131c';
    if (Q.has('bg')) { const u = Q.get('bg'), url = u && u !== '1' ? u : (mapA(HUD.state.map.name) || {}).splash; document.body.style.background = DESK;
      if (url) { const im = new Image(); im.onload = () => { document.body.style.background = `#1a1a1d url(${url}) center/cover`; }; im.src = url; } }
    // ?clear=1: no backdrop of its own (Air's editor draws the desk, your picture or a checkerboard behind it).
    if (!OUTPUT && Q.get('clear') === '1') document.body.classList.add('hud-clear');
    if(Q.get('canvas')==='1')document.body.classList.add('hud-editor-canvas');
    const list = (document.body.dataset.modules || '').split(',').map(x => x.trim()).filter(Boolean);
    const missing = list.filter(k => typeof M[k] !== 'function');
    if (missing.length) throw new Error('Unknown HUD module: ' + missing.join(', '));
    if (PREVIEW) {
      HUD.state = EMPTY_PREVIEW ? liveBase() : previewState(list);
      try { const teams=JSON.parse(Q.get('previewTeams')||'[]'); if(Array.isArray(teams)&&teams.length===2)teams.forEach((team,index)=>{ if(typeof team.name==='string'&&team.name.length<=80)HUD.state.teams[index].name=team.name.replace(/[<>]/g,''); if(typeof team.tag==='string'&&team.tag.length<=12)HUD.state.teams[index].tag=team.tag.replace(/[<>]/g,''); if(Array.isArray(team.players))team.players.slice(0,5).forEach((name,slot)=>{if(typeof name==='string'&&name.length<=80)HUD.state.players[index][slot].name=name.replace(/[<>]/g,'');}); if(typeof team.logo==='string'&&!/[<>\"'\s]/.test(team.logo)&&/^(https:\/\/|http:\/\/localhost:5300\/air-assets\/)/.test(team.logo))HUD.state.teams[index].logo=team.logo; }); } catch (_) { /* Keep safe preview defaults for invalid input. */ }
      if (EMPTY_PREVIEW) { HUD.state.series=[];HUD.state.map.name='';HUD.state.map.number=0; }
      sourceState = clone(HUD.state);
      HUD.state=previewSettings(sourceState);
      if(SAMPLE_MOTION){HUD.state.holding.target=previewNow+(HUD.state.holding.minutes||5)*60000;sourceState.holding.target=HUD.state.holding.target;}
      if(!SAMPLE_MOTION)document.body.classList.add('hud-preview');
      if(!EMPTY_PREVIEW) E('div', 'preview-label', document.body, 'PREVIEW · SAMPLE DATA');
    }
    // Static screens still preview their real design with no game data.
    const hideEmpty = EMPTY_PREVIEW && !list.every(name => ['holding','intro','casters','eventbug','sponsor','lowerthird','ticker'].includes(name));
    if (EMPTY_PREVIEW) {
      document.body.classList.add('hud-without-game-data');
    }
    if (hideEmpty) {
      root.style.visibility = 'hidden';
      const empty = E('div', 'empty-preview-message', document.body);
      empty.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#a1a1aa;font:24px system-ui;text-align:center';
      E('strong', '', empty, 'Game data hidden');
      E('span', '', empty, 'Choose Sample data or Received match data to preview this screen.');
    }
    // A stand-in for the game's own round timer behind the scorebug (Air's Adjust preview only).
    if (!OUTPUT && Q.get('gameTimer') === '1') { const gt = E('div', 'game-timer-standin', root); E('span', '', gt, '1:34'); }
    const mods = hideEmpty ? [] : list.map(k => M[k](root)); HUD.mods = mods;
    const feedTag = E('div', 'feed-paused-tag mono', root, 'FEED PAUSED · LAST RECEIVED DATA');
    feedTag.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);padding:6px 12px;background:#1b1410;color:#fbbf24;font-size:12px;z-index:99;display:none';
    const updateFeedTag = s => { feedTag.style.display = !PREVIEW && s.airDiagnostics?.feedPaused ? 'block' : 'none'; };
    const rehearsalTag = E('div', 'feed-paused-tag mono', root, 'REHEARSAL · SAMPLE DATA');
    rehearsalTag.style.cssText = feedTag.style.cssText;
    const updateRehearsalTag = s => { rehearsalTag.style.display = !PREVIEW && s.airContext?.simulation ? 'block' : 'none'; };
    HUD.on(updateRehearsalTag);
    const pausePanel = E('div', 'pause', root), pauseCrest = E('div', 'pause-crest', pausePanel), pauseSymbol = E('img', 'pause-symbol', pauseCrest), pauseTitle = E('div', 'a', pausePanel), pauseTime = E('div', 'b mono', pausePanel);
    E('div', 'pause-wing l', pausePanel); E('div', 'pause-wing r', pausePanel);
    // layout.pauseStyle 'box': a VCT-style box (top left, clear of the player cards) with both teams and the score.
    const pauseScore = E('div', 'pause-score', pausePanel); let pauseSig = '';
    // layout.pauseStyle 'bar' (approved mock 15 Nov): a bar along the bottom with the team, the score, its sponsor and a countdown.
    const pauseBar = E('div', 'pause-bar', root); let barSig = '';
    const updateAirPause = s => {
      const panel = s.airPause, enabled = (!PREVIEW || tplSample === 'pause' || tplSample === 'timeout') && ['technical', 'timeout'].includes(panel?.kind) && Number.isFinite(panel.startedAt);
      const asBar = !!enabled && s.layout && s.layout.pauseStyle === 'bar';
      pausePanel.classList.toggle('on', !!enabled && !asBar);
      const vis = enabled && !asBar ? 'visible' : 'hidden', hid = enabled && !asBar ? 'false' : 'true';
      if (pausePanel.style.visibility !== vis) pausePanel.style.visibility = vis;
      if (pausePanel.getAttribute('aria-hidden') !== hid) pausePanel.setAttribute('aria-hidden', hid);
      pauseBar.classList.toggle('on', asBar);
      // A timeout comes in the buy phase: the bar then takes the round history's place above the economy table.
      pauseBar.classList.toggle('buy', asBar && s.round.phase === 'buy'); root.classList.toggle('pause-bar-buy', asBar && s.round.phase === 'buy');
      if (!enabled) { barSig = ''; return; }
      // A countdown when Air set the timeout's length, else the time since it began.
      const elapsed = Math.max(0, (HUD.now() - panel.startedAt) / 1000), secs = Number(panel.seconds) || 0;
      const clock = secs ? fmt(Math.max(0, secs - elapsed)) : fmt(elapsed);
      if (asBar) {
        const technical = panel.kind === 'technical', team = panel.team === 0 || panel.team === 1 ? s.teams[panel.team] : null, sp = s.airSpaces && s.airSpaces.timeout;
        const k = JSON.stringify([panel.id, panel.kind, panel.team, s.teams.map(t => [t.tag, t.name, t.color, t.logo, t.score]), s.round.number, s.map, sp]);
        pauseBar.style.setProperty('--c', technical ? 'var(--red)' : team ? team.color : 'var(--amber, #fbbf24)');
        if (k !== barSig) { barSig = k;
          pauseBar.innerHTML = `${sp && sp.name ? `<span class="pb-pres">PRESENTED BY ${logoOk(sp.logo) ? `<img src="${escH(sp.logo)}" alt="${escH(sp.name)}">` : escH(sp.name)}</span>` : ''}${team ? teamMark(team, 104) : `<img class="pb-sym" src="../core/assets/banners/${technical ? 'technical-pause' : 'timeout'}.svg" alt="">`}`
            + `<div class="pb-tx"><b>${technical ? 'Technical pause' : 'Tactical timeout'}</b><span>${escH([team ? team.name : '', `ROUND ${s.round.number || 1}`].filter(Boolean).join(' · ').toUpperCase())}</span></div>`
            + `<div class="pb-sc">${s.teams[0].score} – ${s.teams[1].score}<small>${escH(`MAP ${s.map.number || 1} · ${s.map.name || ''}`)}</small></div><div class="pb-ck"></div><div class="pb-pg"><i></i></div>`; }
        txt(pauseBar.querySelector('.pb-ck'), clock);
        pauseBar.querySelector('.pb-pg i').style.width = secs ? `${Math.max(0, Math.min(100, (1 - elapsed / secs) * 100))}%` : '100%';
        return;
      }
      const technical = panel.kind === 'technical'; pausePanel.style.setProperty('--c', technical ? 'var(--red)' : 'var(--amber, #fbbf24)');
      setImg(pauseSymbol, '../core/assets/banners/' + (technical ? 'technical-pause' : 'timeout') + '.svg');
      txt(pauseTitle, technical ? 'TECHNICAL PAUSE' : 'TEAM TIMEOUT');
      txt(pauseTime, (secs ? 'LEFT ' : 'ELAPSED ') + clock);
      const box = s.layout && s.layout.pauseStyle === 'box'; pausePanel.classList.toggle('as-box', box);
      if (box) { const team = panel.team === 0 || panel.team === 1 ? s.teams[panel.team] : null; txt(pauseTitle, technical ? 'TECH PAUSE' : team ? 'TIMEOUT · ' + team.name : 'TIMEOUT');
        const k = JSON.stringify(s.teams.map(t => [t.tag, t.color, t.logo, t.score]));
        if (k !== pauseSig) { pauseSig = k; pauseScore.innerHTML = ''; [0, 1].forEach(i => { if (i) E('b', 'num', pauseScore, `${s.teams[0].score}–${s.teams[1].score}`); logo(s.teams[i], 52, pauseScore); }); } }
    };
    HUD.on(updateAirPause);
    HUD.subs.push(updateFeedTag); updateFeedTag(HUD.state);
    HUD.subs.push((s, opts) => mods.forEach(m => m.update(s, opts))); mods.forEach(m => m.update(HUD.state, {snapshot:true}));
    templates(root, list);
    // A preview inside Air (an iframe) does no work while it is scrolled out of sight: no ticks, no frames and
    // no CSS animations (17 Nov: twenty previews in the Rundown kept animating and made scrolling hitch).
    // OBS outputs are never iframes, so on air nothing changes.
    let lastT = 0, shown = true, looping = false;
    const loop = t => { if (!shown) { looping = false; return; } looping = true; if (t - lastT > 90) { lastT = t; updateAirPause(HUD.state); mods.forEach(m => m.tick && m.tick(HUD.state)); } mods.forEach(m => m.frame && m.frame(HUD.state)); requestAnimationFrame(loop); };
    loop(0);
    if (window.parent !== window && 'IntersectionObserver' in window) {
      const st = document.createElement('style'); st.textContent = '.air-offscreen *,.air-offscreen *::before,.air-offscreen *::after{animation-play-state:paused!important}'; document.head.appendChild(st);
      new IntersectionObserver(([e]) => {
        shown = !!(e && e.isIntersecting); document.documentElement.classList.toggle('air-offscreen', !shown);
        if (shown && !looping) { looping = true; requestAnimationFrame(loop); }
      }).observe(document.body);
    }
    if (HUD.demo || SAMPLE_MOTION) demo();
    window.HUD_READY = true;
    if(window.parent!==window)window.parent.postMessage({type:'AIR_HUD_PREVIEW_READY'},'*');
  }
  // Templates (core/templates.js): the event's brand kit as CSS variables, and the active template's
  // styles on the parts of the graphic this page shows. Re-applied whenever a graphic redraws.
  function templates(root, list) {
    const T = window.AirTemplates; if (!T) return;
    const byModule = {}; Object.entries(FULLSCREEN).forEach(([id, m]) => { byModule[m] = id + '|full'; }); Object.entries(HUD.BANDS || {}).forEach(([id, m]) => { byModule[m] = id + '|band'; });
    byModule.holding = 'holding|full'; byModule.casters = 'casters|full';
    const host = list.includes('fullscreen'), page = list.length === 1 && byModule[list[0]] ? byModule[list[0]] : 'hud';
    const find = (s, id) => (Array.isArray(s.airTemplates) ? s.airTemplates : []).find(t => t && t.id === id) || null;
    let queued = false, entered = false, first = true;
    const run = () => {
      queued = false; const s = HUD.state;
      T.brand(document, tplDraft && tplDraft.brand || s.airBrand, s.teams);
      if (host) {
        const fs = HUD.fsShown; if (!fs) return;
        const g = fs.key, tpl = tplDraft ? tplDraft.template : find(s, s.airFullscreenTemplate);
        T.apply(fs.el, tpl, g);
        if (fs.fresh) { fs.fresh = false; T.enter(fs.el, tpl, g); }
      } else {
        // The HUD's look, or the look the Rundown gave this page (Break, Desk…).
        const tpl = tplDraft ? tplDraft.template : find(s, page === 'hud' ? s.airHudTemplate : (s.airPageTemplates || {})[page]);
        T.apply(root, tpl, page);
        if (page !== 'hud' && !entered && tpl) { entered = true; T.enter(root, tpl, page); }
        // Parts that come and go (banners, the pause box, the scoreboard) play their entrance each time they appear.
        if (page === 'hud') { T.appear(root, tpl, page, first); first = false; }
      }
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(run); } };
    HUD.subs.push(queue); run();
    new MutationObserver(queue).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    // Air's editor: the parts and where they are on the 1920×1080 canvas.
    HUD.templateRects = () => {
      const scope = host ? HUD.fsShown && HUD.fsShown.el : root, g = host ? HUD.fsShown && HUD.fsShown.key : page; if (!scope) return { graphic: g, parts: {} };
      const box = root.getBoundingClientRect(), k = box.width / 1920 || 1, parts = {};
      // Only what is really on screen: hidden or fully transparent parts get no box.
      const seen = el => (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : getComputedStyle(el).visibility !== 'hidden');
      T.partsOf(g).forEach(([id, , sel]) => { const r = [...scope.querySelectorAll(sel)].filter(seen).map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0)
        .map(r => [r.left - box.left, r.top - box.top, r.width, r.height].map(v => Math.round(v / k))); if (r.length) parts[id] = r; });
      return { graphic: g, parts };
    };
    HUD.templatePlay = () => { const s = HUD.state, scope = host ? HUD.fsShown && HUD.fsShown.el : root, g = host ? HUD.fsShown && HUD.fsShown.key : page;
      if (scope) T.enter(scope, tplDraft ? tplDraft.template : null, g); };
    HUD.templateRefresh = () => { HUD.state = previewSettings(sourceState); HUD.subs.forEach(fn => fn(HUD.state, {snapshot:true})); run(); };
  }
  // Air's editor draws a box over each part. Parts that animate in (rise, slide) are measured once they
  // have landed: positions are sent after a change and again whenever animations on the page settle.
  let rectsTimer = 0, watching = false;
  const sendRects = (id) => requestAnimationFrame(() => requestAnimationFrame(() => {
    if (HUD.templateRects) window.parent.postMessage({ type: 'AIR_TEMPLATE_RECTS', id, ...HUD.templateRects() }, '*');
    clearTimeout(rectsTimer);
    rectsTimer = setTimeout(() => {
      const running = (document.getAnimations ? document.getAnimations() : []).filter(a => a.playState === 'running' && a.effect && a.effect.getTiming().iterations !== Infinity);
      Promise.race([Promise.all(running.map(a => a.finished.catch(() => {}))), new Promise(r => setTimeout(r, 2500))])
        .then(() => HUD.templateRects && window.parent.postMessage({ type: 'AIR_TEMPLATE_RECTS', id, ...HUD.templateRects() }, '*'));
    }, 60);
  }));
  const watchRects = () => {
    if (watching) return; watching = true;
    let t = 0; const later = () => { clearTimeout(t); t = setTimeout(() => sendRects(null), 120); };
    addEventListener('animationend', later, true); addEventListener('transitionend', later, true); addEventListener('resize', later);
    // Agent portraits and logos arrive after the first measure and can change where things sit.
    addEventListener('load', later, true); addEventListener('error', later, true);
    if (document.fonts) document.fonts.ready.then(later);
  };
  addEventListener('message', event => {
    if (event.source !== window.parent || window.parent === window) return;
    // Air's template editor (preview pages only): a draft to show, its entrance, and where the parts are.
    // Air's app page is a file, so its origin is not usable: the parent and a one-off key in the URL are checked.
    if (/^AIR_TEMPLATE_/.test(event.data?.type || '') && !OUTPUT && PREVIEW && Q.get('editorKey') && event.data.key === Q.get('editorKey')) {
      const d = event.data;
      if (d.type === 'AIR_TEMPLATE_DRAFT') { tplDraft = d.template || d.brand ? { template: d.template || null, brand: d.brand || null } : null; HUD.templateRefresh && HUD.templateRefresh(); }
      if (d.type === 'AIR_TEMPLATE_PLAY' && HUD.templatePlay) HUD.templatePlay();
      if (d.type === 'AIR_TEMPLATE_SAMPLE') { tplSample = SAMPLES[d.sample] ? d.sample : null; HUD.templateRefresh && HUD.templateRefresh(); }
      if ((d.type === 'AIR_TEMPLATE_DRAFT' || d.type === 'AIR_TEMPLATE_RECTS' || d.type === 'AIR_TEMPLATE_SAMPLE') && HUD.templateRects) { sendRects(d.id); watchRects(); }
      return;
    }
    // Show text: Air's draft (mode, message, countdown and this match's teams) shown on the editable preview.
    if (event.data?.type === 'AIR_SHOW_DRAFT' && SHOW_EDIT && !OUTPUT && event.data.key === Q.get('editorKey')) {
      const d = event.data;
      receive(mergePatch(clone(sourceState), { holding: d.holding || {}, ...(d.teams ? { teams: d.teams } : {}), ...(d.event ? { event: d.event } : {}) }));
      return;
    }
    if (event.data?.type === 'AIR_HUD_PREVIEW_PROBE' && window.HUD_READY)
      window.parent.postMessage({type:'AIR_HUD_PREVIEW_READY'}, '*');
    // Read-only editor views only. OBS outputs cannot accept draft commands.
    if (event.data?.type !== 'AIR_HUD_PREVIEW_SETTINGS' || OUTPUT ||
        Q.get('canvas') !== '1' || Q.get('screen') !== '1' ||
        !Q.has('editorOrigin') || event.origin !== Q.get('editorOrigin')) return;
    try {
      previewPatch = event.data.settings == null ? {} : window.AirHudSettings.validate(event.data.settings);
      HUD.state = previewSettings(sourceState);
      HUD.subs.forEach(fn => fn(HUD.state, {snapshot:true}));
    } catch (_) { /* Invalid drafts leave the last valid preview in place. */ }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
