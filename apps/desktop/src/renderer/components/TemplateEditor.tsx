// The template editor (Graphics › Templates; approved mock 13 Nov). Parts on the left, the real graphic
// in the middle (its own page with sample data, never an OBS output), the selected part's settings on the
// right. Drag to move, the corner to scale, arrows to nudge; undo/redo, snapping, Play entrance.
// The page draws the graphic; this window only sends the draft (AIR_TEMPLATE_DRAFT) and reads back where
// the parts are (AIR_TEMPLATE_RECTS).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import {
  BRAND_NAME, BRAND_KEYS, DEFAULT_BRAND, ENTRANCES, SAMPLES, SHOWS_IN, WEIGHTS, snapWeight, FONTS, GRAPHICS, SWATCHES, graphicPage, graphicStyle, graphicTitle, newTemplateId, parentOf, partsOf, validTemplate,
  type BrandKit, type ColorRef, type PartStyle, type Template,
} from '../../shared/templates.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';

export type EditorStart = { id?: string; graphic?: string; from?: Template; returnTo?: string };

/** Opens the editor from anywhere (the App shows it over the page). */
export function openTemplateEditor(start: EditorStart) {
  window.dispatchEvent(new CustomEvent('air:edit-template', { detail: start }));
}

const W = 1920, H = 1080, GRID = 8;
type Rects = Record<string, number[][]>;

/** The overlay page for a graphic, in preview mode with this match's teams. */
export function templatePreviewUrl(s: Snapshot, graphic: string, extra: Record<string, string> = {}) {
  const teams = s.match ? JSON.stringify(s.match.teams.map((t, i) => ({ name: t.name, tag: t.tag, players: (s.match!.players[i] ?? []).map((p) => p.name) }))) : '';
  const q = new URLSearchParams({ preview: '1', screen: '1', ...(teams ? { previewTeams: teams } : {}), ...(graphic === 'full' ? {} : {}), ...extra });
  return `http://127.0.0.1:${s.engine.port}/overlays/${graphicPage(graphic)}.html?${q}`;
}

export const brandOfMatch = (s: Snapshot): BrandKit | null => {
  const ev = s.events?.find((e) => e.id === s.match?.eventId);
  return ev ? ({ ...DEFAULT_BRAND, ...(ev.brand ?? {}), primary: ev.accent } as BrandKit) : null;
};

function blank(graphic: string): Template {
  return { id: newTemplateId(), name: `My ${GRAPHICS[graphic]?.title.toLowerCase() ?? 'graphic'}`, graphic, parts: {}, createdAt: Date.now(), updatedAt: Date.now() };
}

/** The colour a reference shows as, for swatches in the interface. */
function swatchColor(ref: ColorRef | undefined, brand: BrandKit, s: Snapshot): string {
  if (!ref) return 'transparent';
  if (ref.startsWith('#')) return ref;
  if (ref.startsWith('brand.')) return brand[ref.slice(6) as keyof BrandKit] ?? '#888';
  const t = s.match?.teams[ref === 'team.a' ? 0 : 1];
  return t?.color ?? (ref === 'team.a' ? '#22b8c9' : '#e0364f');
}

export function TemplateEditor({ s, run, start, close }: { s: Snapshot; run: Run; start: EditorStart; close: () => void }) {
  const saved = start.id ? s.templates.find((t) => t.id === start.id) : undefined;
  const initial = useMemo<Template>(() => saved ? structuredClone(saved) : start.from ? { ...structuredClone(start.from), id: newTemplateId(), name: `${start.from.name} copy` } : blank(start.graphic ?? 'map-veto|band'), []);
  // The draft and its undo history, changed together by pure updates.
  const [h, setH] = useState<{ draft: Template; past: Template[]; future: Template[] }>({ draft: initial, past: [], future: [] });
  const { draft, past, future } = h;
  const [isNew, setIsNew] = useState(!saved);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [sel, setSel] = useState<string>(partsOf(initial.graphic)[0]?.[0] ?? '');
  // Double-click on the picture: words a template may replace are typed in place (17 Nov).
  const [wordsAt, setWordsAt] = useState<{ id: string; box: number[] } | null>(null);
  const [dataNote, setDataNote] = useState<{ box: number[]; label: string } | null>(null);
  const [rects, setRects] = useState<Rects>({});
  const [compare, setCompare] = useState<'mine' | 'default'>('mine');
  const [backdrop, setBackdrop] = useState<'game' | 'desk' | 'picture' | 'clear'>('game');
  // Your picture: a screenshot of your game or desk, kept in this PC's editor storage only.
  const [picture, setPicture] = useState<string | null>(() => { try { return localStorage.getItem('air-template-backdrop'); } catch { return null; } });
  const [sample, setSample] = useState<string>('');
  const [menu, setMenu] = useState<null | 'sample' | 'backdrop'>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  const [snap, setSnap] = useState(true);
  const [clip, setClip] = useState<PartStyle | null>(null);
  const [confirm, setConfirm] = useState<null | 'close' | 'delete'>(null);
  const [notice, setNotice] = useState('');
  const key = useMemo(() => Math.random().toString(36).slice(2), []);
  const frame = useRef<HTMLIFrameElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const lastKey = useRef<{ k: string; at: number } | null>(null);
  const brand = brandOfMatch(s) ?? DEFAULT_BRAND;
  const dirty = JSON.stringify(draft) !== baseline || isNew;
  const parts = partsOf(draft.graphic);
  const part = parts.find((p) => p[0] === sel) ?? parts[0];
  const ps: PartStyle = (part && draft.parts[part[0]]) || {};
  const hud = draft.graphic === 'hud';

  /** Every edit goes through here: one undo step, or one per gesture when `coalesce` names it. */
  const change = useCallback((fn: (t: Template) => Template, coalesce?: string) => {
    const now = Date.now();
    const same = !!coalesce && lastKey.current?.k === coalesce && now - lastKey.current.at < 800;
    lastKey.current = coalesce ? { k: coalesce, at: now } : null;
    setH((cur) => ({ draft: fn(structuredClone(cur.draft)), past: same ? cur.past : [...cur.past.slice(-99), cur.draft], future: same ? cur.future : [] }));
  }, []);
  const setPart = (id: string, patch: Partial<PartStyle> | null, coalesce?: string) => change((t) => {
    const cur = { ...(t.parts[id] ?? {}) } as Record<string, unknown>;
    if (patch === null) delete t.parts[id];
    else {
      for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete cur[k]; else cur[k] = v; }
      if (Object.keys(cur).length) t.parts[id] = cur as PartStyle; else delete t.parts[id];
    }
    return t;
  }, coalesce);
  const undo = () => { lastKey.current = null; setH((cur) => (cur.past.length ? { draft: cur.past[cur.past.length - 1]!, past: cur.past.slice(0, -1), future: [cur.draft, ...cur.future] } : cur)); };
  const redo = () => { lastKey.current = null; setH((cur) => (cur.future.length ? { draft: cur.future[0]!, past: [...cur.past, cur.draft], future: cur.future.slice(1) } : cur)); };

  // The page: send the draft whenever it changes; it answers with where the parts are.
  const post = useCallback((msg: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ ...msg, key }, '*'), [key]);
  const send = useCallback(() => post({ type: 'AIR_TEMPLATE_DRAFT', template: compare === 'mine' ? draft : null, brand }), [post, draft, compare, JSON.stringify(brand)]);
  useEffect(() => { send(); }, [send]);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === 'AIR_HUD_PREVIEW_READY') { send(); if (sample) post({ type: 'AIR_TEMPLATE_SAMPLE', sample }); }
      if (e.data?.type === 'AIR_TEMPLATE_RECTS' && e.data.graphic === draft.graphic) setRects(e.data.parts ?? {});
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [send, draft.graphic, sample]);
  useEffect(() => { post({ type: 'AIR_TEMPLATE_SAMPLE', sample: sample || null }); }, [sample, post]);
  const pickPicture = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 4_000_000) { setNotice('Choose a picture under 4 MB.'); return; }
    const url = await new Promise<string>((done) => { const r = new FileReader(); r.onload = () => done(String(r.result)); r.readAsDataURL(file); });
    setPicture(url); setBackdrop('picture'); setMenu(null);
    try { localStorage.setItem('air-template-backdrop', url); } catch { setNotice('The picture is shown but too large to keep for next time.'); }
  };
  /** Dropping a part above another puts it in front of that part; below, behind it. */
  const dropPart = (id: string, target: string, after: boolean) => {
    if (id === target) return;
    const tz = draft.parts[target]?.z ?? 0;
    const z = Math.max(-9, Math.min(9, after ? tz - 1 : tz + 1));
    setPart(id, { z: z || undefined });
    setNotice(`${parts.find((p) => p[0] === id)?.[1]} is now ${after ? 'behind' : 'in front of'} ${parts.find((p) => p[0] === target)?.[1]?.toLowerCase()}.`);
  };
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale((e?.contentRect.width ?? 960) / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const save = async (copy = false) => {
    let t: Template;
    try { t = validTemplate(copy ? { ...draft, id: newTemplateId(), name: `${draft.name} copy` } : draft); } catch (e) { setNotice((e as Error).message); return; }
    const ok = await run(() => air.templateSave(t));
    if (!ok) return;
    if (copy) setH({ draft: t, past: [], future: [] });
    setBaseline(JSON.stringify(copy ? t : draft)); setIsNew(false);
    setNotice(copy ? `Saved as “${t.name}”.` : 'Saved.');
  };
  const remove = async () => {
    if (isNew) { close(); return; }
    if (await run(() => air.templateDelete(draft.id))) close();
  };
  const exportFile = () => {
    const blob = new Blob([JSON.stringify({ esportraAirTemplate: 1, ...draft }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${draft.name.replace(/[^\w -]+/g, '').trim() || 'template'}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const t = validTemplate({ ...raw, id: newTemplateId() });
      change(() => t); setIsNew(true); setSel(partsOf(t.graphic)[0]?.[0] ?? ''); setNotice(`Imported “${t.name}”. Save to keep it.`);
    } catch (e) { setNotice(e instanceof SyntaxError ? 'That file is not a template.' : (e as Error).message); }
  };
  const tryClose = () => (dirty ? setConfirm('close') : close());

  // Keys: undo/redo, save, nudge the selected part.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return; }
      if (e.key === 'Escape') { e.preventDefault(); if (menu) setMenu(null); else tryClose(); return; }
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      // Delete or Backspace removes the selected part from the graphic, like a layer in Photoshop (17 Nov).
      // It stays in the list, struck through, and Ctrl Z or the eye brings it back.
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && part?.[0] === sel && !draft.parts[sel]?.hidden) { e.preventDefault(); setPart(part[0], { hidden: true }); return; }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (d && part) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        setPart(part[0], { x: clampN((ps.x ?? 0) + d[0]! * step, -1920, 1920) || undefined, y: clampN((ps.y ?? 0) + d[1]! * step, -1080, 1080) || undefined }, `nudge-${part[0]}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Canvas: click to pick a part, drag to move it, the corner to scale it.
  const drag = useRef<null | { mode: 'move' | 'scale'; id: string; sx: number; sy: number; x0: number; y0: number; s0: number; box: number[]; hits: string[]; moved: boolean; kept: boolean }>(null);
  const [guide, setGuide] = useState<{ v?: number; h?: number } | null>(null);
  const toCanvas = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale] as const; };
  const union = (id: string) => { const list = rects[id]; if (!list?.length) return null; const x = Math.min(...list.map((r) => r[0]!)), y = Math.min(...list.map((r) => r[1]!)); return [x, y, Math.max(...list.map((r) => r[0]! + r[2]!)) - x, Math.max(...list.map((r) => r[1]! + r[3]!)) - y]; };
  const onDown = (e: React.PointerEvent) => {
    if (compare !== 'mine') return;
    const [x, y] = toCanvas(e);
    const handle = (e.target as HTMLElement).dataset.handle;
    let id = sel, order: string[] = [], kept = false;
    if (!handle) {
      // The smallest part under the pointer, so nested parts can be picked.
      const hits = parts.map((p) => ({ id: p[0], r: (rects[p[0]] ?? []).find((r) => x >= r[0]! && x <= r[0]! + r[2]! && y >= r[1]! && y <= r[1]! + r[3]!) })).filter((h) => h.r);
      hits.sort((a, b) => a.r![2]! * a.r![3]! - b.r![2]! * b.r![3]!);
      if (!hits.length) return;
      order = hits.map((h) => h.id);
      kept = order.includes(sel);
      id = kept ? sel : order[0]!;
      setSel(id);
    }
    const p = draft.parts[id] ?? {};
    drag.current = { mode: handle ? 'scale' : 'move', id, sx: x, sy: y, x0: p.x ?? 0, y0: p.y ?? 0, s0: p.scale ?? 1, box: union(id) ?? [0, 0, 1, 1], hits: order, moved: false, kept };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const [x, y] = toCanvas(e);
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) < 4) return;
    d.moved = true;
    if (d.mode === 'scale') {
      const k = Math.max(0.25, Math.min(3, d.s0 * ((d.box[2]! + (x - d.sx)) / d.box[2]!)));
      setPart(d.id, { scale: Math.abs(k - 1) < 0.01 ? undefined : Math.round(k * 100) / 100 }, `scale-${d.id}`);
      return;
    }
    let nx = Math.round(d.x0 + x - d.sx), ny = Math.round(d.y0 + y - d.sy);
    let g: { v?: number; h?: number } = {};
    if (snap && !e.altKey) {
      const bx = d.box[0]! - d.x0, by = d.box[1]! - d.y0, cx = bx + nx + d.box[2]! / 2, cy = by + ny + d.box[3]! / 2;
      if (Math.abs(cx - W / 2) < 10) { nx += Math.round(W / 2 - cx); g = { ...g, v: W / 2 }; }
      else nx = Math.round(nx / GRID) * GRID;
      if (Math.abs(cy - H / 2) < 10) { ny += Math.round(H / 2 - cy); g = { ...g, h: H / 2 }; }
      else ny = Math.round(ny / GRID) * GRID;
    }
    setGuide(g.v !== undefined || g.h !== undefined ? g : null);
    setPart(d.id, { x: nx || undefined, y: ny || undefined }, `move-${d.id}`);
  };
  // A click (no drag) on the selected part picks the next part under the pointer, so parts behind can be reached.
  const onUp = () => {
    const d = drag.current;
    if (d && !d.moved && d.kept && d.hits.length > 1) setSel(d.hits[(d.hits.indexOf(d.id) + 1) % d.hits.length]!);
    drag.current = null; setGuide(null);
  };

  const set = (patch: Partial<PartStyle>, coalesce?: string) => part && setPart(part[0], patch, coalesce);
  const changed = (k: keyof PartStyle) => ps[k] !== undefined;
  const Reset = ({ k }: { k: keyof PartStyle }) => <button type="button" className={`tpl-rd ${changed(k) ? 'set' : ''}`} title="Back to the graphic's own" aria-label={`Reset ${String(k)}`} disabled={!changed(k)} onClick={() => set({ [k]: undefined })} />;
  const box = part ? union(part[0]) : null;
  const graphicsList = Object.keys(GRAPHICS);

  return (
    <div className="scrim tpl-scrim" role="dialog" aria-modal="true" aria-label={`Template editor: ${draft.name}`}>
      <div className="tpl">
        <header className="tpl-bar">
          <div className="tpl-name">
            <input aria-label="Template name" value={draft.name} maxLength={60} onChange={(e) => change((t) => ({ ...t, name: e.target.value }), 'name')} />
            <span className="faint t-xs">{graphicTitle(draft.graphic)}{brandOfMatch(s) ? ' · this event’s brand kit' : ''}</span>
          </div>
          {dirty ? <span className="tpl-dirty">Not saved</span> : <span className="faint t-xs">Saved</span>}
          <span className="tpl-sep" />
          <button className="icon-btn" title="Undo (Ctrl Z)" aria-label="Undo" disabled={!past.length} onClick={undo}>↶</button>
          <button className="icon-btn" title="Redo (Ctrl Y)" aria-label="Redo" disabled={!future.length} onClick={redo}>↷</button>
          <span className="tpl-sep" />
          <button className="btn quiet small" disabled={!Object.keys(draft.parts).length && !draft.timer} onClick={() => change((t) => ({ ...t, parts: {}, timer: undefined }))}>Reset all</button>
          <span className="spacer" />
          {notice && <span className="t-xs muted tpl-notice" role="status">{notice}</span>}
          <button className="btn quiet small" onClick={exportFile}>Export</button>
          <label className="btn quiet small">Import<input type="file" accept="application/json,.json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
          <button className="btn small" onClick={() => void save(true)}>Save as copy</button>
          <button className="btn small" onClick={() => setConfirm('delete')}>{isNew ? 'Discard' : 'Delete'}</button>
          <button className="btn primary small" onClick={() => void save()}>Save <span className="kbd">Ctrl S</span></button>
          <button className="btn quiet small" onClick={tryClose}>Esc · Close</button>
        </header>
        {!isNew && s.onAirLooks.includes(draft.id) && <p className="onair-note" role="status"><b>On air now.</b> This look is on screen: saving changes what viewers see straight away. Save as copy to work on it safely.</p>}
        {confirm && (
          <div className="tpl-confirm" role="alertdialog" aria-label="Confirm">
            {confirm === 'close'
              ? <><span>This template has changes that are not saved.</span><button className="btn small" onClick={() => setConfirm(null)}>Keep editing</button><button className="btn small" onClick={close}>Close without saving</button><button className="btn primary small" onClick={async () => { await save(); close(); }}>Save and close</button></>
              : <><span>{isNew ? 'Discard this new template?' : `Delete “${draft.name}”?${(s.templateUse?.[draft.id] ?? 0) > 0 ? ` It is used in ${s.templateUse[draft.id]} ${s.templateUse[draft.id] === 1 ? 'match' : 'matches'};` : ''} Rundown rows that use it go back to the default look.`}</span><button className="btn small" onClick={() => setConfirm(null)}>Cancel</button><button className="btn danger small" onClick={() => void remove()}>{isNew ? 'Discard' : 'Delete'}</button></>}
          </div>
        )}
        <div className="tpl-body">
          <aside className="tpl-left">
            <label className="stack g-1"><span className="cap">Graphic</span>
              <select className="cell" value={draft.graphic} disabled={!isNew} onChange={(e) => { const g = e.target.value; change((t) => ({ ...t, graphic: g, parts: {}, timer: undefined })); setSel(partsOf(g)[0]?.[0] ?? ''); setRects({}); setSample(''); }}>
                <optgroup label="Overlay bar">{graphicsList.filter((g) => g.endsWith('|band') && !g.startsWith('holding|')).map((g) => <option key={g} value={g}>{GRAPHICS[g]!.title}</option>)}</optgroup>
                <optgroup label="Full screen">{graphicsList.filter((g) => g.endsWith('|full') && !g.startsWith('holding|') && !g.startsWith('casters|')).map((g) => <option key={g} value={g}>{GRAPHICS[g]!.title}</option>)}</optgroup>
                <optgroup label="Scene screens">{graphicsList.filter((g) => g.startsWith('holding|') || g.startsWith('casters|')).map((g) => <option key={g} value={g}>{GRAPHICS[g]!.title}</option>)}</optgroup>
                <optgroup label="In-game HUD"><option value="hud">In-game HUD</option></optgroup>
              </select>
            </label>
            {!isNew && <p className="faint t-xs">A template stays with its graphic. For another graphic, start a new template.</p>}
            <div className="stack g-1"><span className="cap">Parts</span>
              <div className="tpl-tree" role="listbox" aria-label="Parts">
                {parts.map(([id, label]) => {
                  const p = draft.parts[id]; const present = !!rects[id];
                  return (
                    <div key={id} className={`tpl-node ${parentOf(id) ? 'child' : ''} ${id === sel ? 'on' : ''} ${present || p?.hidden ? '' : 'absent'} ${p?.hidden ? 'deleted' : ''} ${dragging === id ? 'dragging' : ''} ${dropAt?.id === id ? (dropAt.after ? 'drop-after' : 'drop-before') : ''}`}
                      draggable onDragStart={(e) => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { setDragging(null); setDropAt(null); }}
                      onDragOver={(e) => { if (!dragging || dragging === id) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDropAt({ id, after: e.clientY > r.top + r.height / 2 }); }}
                      onDrop={(e) => { e.preventDefault(); if (dragging && dropAt) dropPart(dragging, dropAt.id, dropAt.after); setDragging(null); setDropAt(null); }}>
                      <button role="option" aria-selected={id === sel} onClick={() => setSel(id)} title={present ? label : `${label} (not in this sample)`}>
                        <span>{label}</span>{rects[id] && rects[id]!.length > 1 && <span className="faint t-2xs mono">×{rects[id]!.length}</span>}
                        <i className={`chg ${p ? 'on' : ''}`} aria-label={p ? 'changed' : undefined} />
                      </button>
                      <button className={`eye ${p?.hidden ? 'off' : ''}`} aria-label={p?.hidden ? `Show ${label}` : `Hide ${label}`} title={p?.hidden ? 'Show' : 'Hide'} onClick={() => setPart(id, { hidden: p?.hidden ? undefined : true })}>{p?.hidden ? '◌' : '●'}</button>
                      <button className="eye trash" disabled={!!p?.hidden} aria-label={`Delete ${label}`} title="Delete (Del) · Ctrl Z brings it back" onClick={() => { setSel(id); setPart(id, { hidden: true }); }}>✕</button>
                      {!present && SHOWS_IN[id] && SAMPLES[draft.graphic]?.some((x) => x.id === SHOWS_IN[id]) && <button className="tpl-shows" onClick={() => { setSample(SHOWS_IN[id]!); setSel(id); }}>Shows in: {SAMPLES[draft.graphic]!.find((x) => x.id === SHOWS_IN[id])!.name} ›</button>}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="faint t-xs">Double-click words on the picture to replace them. Select a part and press Delete to take it off the graphic; Ctrl Z or its eye brings it back. The blue dot means you changed that part. Click a part on the picture to select it; click again to reach the part behind. Drag a part above or below another to put it in front or behind; layers only matter where parts overlap.</p>
          </aside>
          <section className="tpl-mid">
            <div className="tpl-cvbar">
              <div className="seg" role="group" aria-label="Compare">
                <button aria-pressed={compare === 'default'} onClick={() => setCompare('default')}>Default</button>
                <button aria-pressed={compare === 'mine'} onClick={() => setCompare('mine')}>Your template</button>
              </div>
              {SAMPLES[draft.graphic] && (
                <span className="tpl-anchor">
                  <button className="btn small" aria-haspopup="menu" aria-expanded={menu === 'sample'} onClick={() => setMenu(menu === 'sample' ? null : 'sample')}>Sample: {SAMPLES[draft.graphic]!.find((x) => x.id === sample)?.name ?? (draft.graphic === 'hud' ? 'Round live' : 'Starting soon')} ▾</button>
                  {menu === 'sample' && (
                    <div className="tpl-menu" role="menu" aria-label="Sample">
                      <span className="cap">{draft.graphic === 'hud' ? 'In-game HUD' : 'Screen'}</span>
                      {SAMPLES[draft.graphic]!.map((x) => <button key={x.id} role="menuitemradio" aria-checked={(sample || SAMPLES[draft.graphic]![0]!.id) === x.id} onClick={() => { setSample(x.id); setMenu(null); }}>{x.name}</button>)}
                    </div>
                  )}
                </span>
              )}
              {draft.graphic.endsWith('|full') && draft.graphic !== 'holding|full' && draft.graphic !== 'casters|full' ? null : (
                <span className="tpl-anchor">
                  <button className="btn quiet small" aria-haspopup="menu" aria-expanded={menu === 'backdrop'} onClick={() => setMenu(menu === 'backdrop' ? null : 'backdrop')}>Backdrop: {({ game: 'Game', desk: 'Desk', picture: 'Your picture', clear: 'Clear' } as const)[backdrop]} ▾</button>
                  {menu === 'backdrop' && (
                    <div className="tpl-menu wide" role="menu" aria-label="Backdrop">
                      <span className="cap">Behind the graphic</span>
                      <div className="tpl-bd">
                        {(['game', 'desk', 'picture', 'clear'] as const).map((b) => (
                          <button key={b} role="menuitemradio" aria-checked={backdrop === b} disabled={b === 'picture' && !picture} className={`bd-${b}`} style={b === 'picture' && picture ? { backgroundImage: `url(${picture})` } : undefined} onClick={() => { setBackdrop(b); setMenu(null); }}><i>{({ game: 'Game', desk: 'Desk', picture: 'Your picture', clear: 'Clear' } as const)[b]}</i></button>
                        ))}
                      </div>
                      <label className="tpl-menu-item">Choose a picture…<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void pickPicture(e.target.files?.[0]); e.target.value = ''; }} /></label>
                      <span className="faint t-2xs" style={{ padding: '0 8px 6px' }}>Stays on this PC. Never sent anywhere.</span>
                    </div>
                  )}
                </span>
              )}
              <span className="spacer" />
              <button className="btn small" onClick={() => post({ type: 'AIR_TEMPLATE_PLAY' })}>▶ Play entrance</button>
              <button className="btn quiet small" aria-pressed={snap} onClick={() => setSnap(!snap)}>Snap {snap ? 'on' : 'off'}</button>
            </div>
            <div className="tpl-cvwrap">
              <div className={`tpl-canvas bd-${backdrop}`} ref={canvas} style={backdrop === 'picture' && picture ? { backgroundImage: `url(${picture})` } : undefined}>
                <iframe ref={frame} title={`Preview of ${graphicTitle(draft.graphic)}`} tabIndex={-1} key={`${draft.graphic}-${backdrop}`}
                  src={templatePreviewUrl(s, draft.graphic, { editorKey: key, canvas: '1', ...(backdrop === 'game' ? { bg: '1' } : { clear: '1' }) })}
                  style={{ transform: `scale(${scale})` }} />
                <div className="tpl-safe" aria-hidden="true"><span>TITLE SAFE</span></div>
                <div className="tpl-hits" onPointerDown={(e) => { setDataNote(null); onDown(e); }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                  onDoubleClick={() => { const pt = parts.find((x) => x[0] === sel); const b = pt && union(pt[0]); if (!pt || !b) return; if (pt[2]) setWordsAt({ id: pt[0], box: b }); else setDataNote({ box: b, label: pt[1] }); }}>
                  {compare === 'mine' && parts.map(([id, label]) => (rects[id] ?? []).map((r, i) => (
                    <div key={id + i} className={`tpl-hot ${id === sel ? 'on' : ''}`} data-label={i === 0 ? label : undefined}
                      style={{ left: r[0]! * scale, top: r[1]! * scale, width: r[2]! * scale, height: r[3]! * scale }} />
                  )))}
                  {compare === 'mine' && box && <div className="tpl-box" style={{ left: box[0]! * scale, top: box[1]! * scale, width: box[2]! * scale, height: box[3]! * scale }}><i data-handle="scale" className="h br" title="Drag to scale" /></div>}
                  {wordsAt && (
                    <input className="tpl-words" autoFocus aria-label="Words" maxLength={40} defaultValue={draft.parts[wordsAt.id]?.label ?? ''} placeholder="The graphic's own words"
                      style={{ left: wordsAt.box[0]! * scale, top: wordsAt.box[1]! * scale, width: Math.max(160, wordsAt.box[2]! * scale), minHeight: Math.max(28, wordsAt.box[3]! * scale) }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { e.stopPropagation(); setWordsAt(null); } }}
                      onBlur={(e) => { const v = e.target.value.replace(/[<>]/g, '').trim(); setPart(wordsAt.id, { label: v || undefined }); setWordsAt(null); }} />
                  )}
                  {dataNote && (
                    <div className="tpl-datanote" style={{ left: dataNote.box[0]! * scale, top: (dataNote.box[1]! + dataNote.box[3]!) * scale + 6 }} onPointerDown={(e) => e.stopPropagation()}>
                      <b>{dataNote.label}</b> shows the match's own words (teams, players, agents, scores), so they can't be typed here. Change its font, size and colour on the right, or the words in Teams/Players and Match data.
                    </div>
                  )}
                  {guide?.v !== undefined && <div className="tpl-guide v" style={{ left: guide.v * scale }} />}
                  {guide?.h !== undefined && <div className="tpl-guide h" style={{ top: guide.h * scale }} />}
                </div>
              </div>
            </div>
            <div className="tpl-foot faint t-xs"><span>Arrow keys nudge 1 px · Shift 10 px · drag the corner to scale · Alt while dragging ignores snapping</span><span className="spacer" /><span className="mono">1920 × 1080 · {Math.round(scale * 100)}%</span></div>
          </section>
          <aside className="tpl-right" aria-label="Settings for the selected part">
            {part ? (
              <>
                <div className="tpl-insp-head"><span className="cap">Selected part</span><h3>{part[1]}</h3>{(rects[part[0]]?.length ?? 0) > 1 && <span className="faint t-xs">All {rects[part[0]]!.length} change together</span>}{!rects[part[0]] && <span className="faint t-xs">Not in this sample; it still changes when it appears.</span>}</div>
                <Group title="Position and size">
                  <Row label="Move"><div className="tpl-num2"><Num label="X" value={ps.x ?? 0} lo={-1920} hi={1920} onChange={(v) => set({ x: v || undefined }, 'x')} /><Num label="Y" value={ps.y ?? 0} lo={-1080} hi={1080} onChange={(v) => set({ y: v || undefined }, 'y')} /></div><button type="button" className={`tpl-rd ${changed('x') || changed('y') ? 'set' : ''}`} aria-label="Reset position" disabled={!changed('x') && !changed('y')} onClick={() => set({ x: undefined, y: undefined })} /></Row>
                  <Row label="Scale"><Num label="%" value={Math.round((ps.scale ?? 1) * 100)} lo={25} hi={300} onChange={(v) => set({ scale: v === 100 ? undefined : v / 100 }, 'scale')} /><Reset k="scale" /></Row>
                  <Row label="Layer"><div className="row g-1"><button className="chipbtn" onClick={() => set({ z: Math.max(-9, (ps.z ?? 0) - 1) || undefined })}>Back</button><span className="mono t-xs">{ps.z ?? 0}</span><button className="chipbtn" onClick={() => set({ z: Math.min(9, (ps.z ?? 0) + 1) || undefined })}>Front</button></div><Reset k="z" /></Row>
                </Group>
                <Group title="Visibility and opacity">
                  <Row label="Show"><Chips value={ps.hidden ? 'hidden' : 'shown'} options={[['shown', 'Shown'], ['hidden', 'Hidden']]} onPick={(v) => set({ hidden: v === 'hidden' ? true : undefined })} /><Reset k="hidden" /></Row>
                  <Row label="Opacity"><Slider value={Math.round((ps.opacity ?? 1) * 100)} onChange={(v) => set({ opacity: v === 100 ? undefined : v / 100 }, 'opacity')} /><Reset k="opacity" /></Row>
                </Group>
                <Group title="Fill">
                  <Row label="Type"><Chips value={ps.fill?.kind ?? 'own'} options={[['own', 'Own'], ['solid', 'Solid'], ['gradient', 'Gradient'], ['none', 'Clear']]} onPick={(v) => set({ fill: v === 'own' ? undefined : v === 'none' ? { kind: 'none' } : { kind: v as 'solid' | 'gradient', a: ps.fill?.a ?? 'brand.panel', ...(v === 'gradient' ? { b: ps.fill?.b ?? '#05060c', angle: ps.fill?.angle ?? 180 } : {}), alpha: ps.fill?.alpha ?? 0.92 } })} /><Reset k="fill" /></Row>
                  {ps.fill && ps.fill.kind !== 'none' && (
                    <>
                      <ColorPick s={s} brand={brand} label={ps.fill.kind === 'gradient' ? 'From' : 'Colour'} value={ps.fill.a} onPick={(c) => set({ fill: { ...ps.fill!, a: c } }, 'fill-a')} />
                      {ps.fill.kind === 'gradient' && <ColorPick s={s} brand={brand} label="To" value={ps.fill.b} onPick={(c) => set({ fill: { ...ps.fill!, b: c } }, 'fill-b')} />}
                      <Row label="Opacity"><Slider value={Math.round((ps.fill.alpha ?? 1) * 100)} onChange={(v) => set({ fill: { ...ps.fill!, alpha: v / 100 } }, 'fill-alpha')} /><span /></Row>
                      {ps.fill.kind === 'gradient' && <Row label="Angle"><Num label="°" value={ps.fill.angle ?? 180} lo={0} hi={360} onChange={(v) => set({ fill: { ...ps.fill!, angle: v } }, 'fill-angle')} /><span /></Row>}
                    </>
                  )}
                </Group>
                <Group title="Text">
                  <ColorPick s={s} brand={brand} label="Colour" value={ps.color} own onPick={(c) => set({ color: c }, 'color')} reset={changed('color') ? () => set({ color: undefined }) : undefined} />
                  <Row label="Font"><select className="cell" aria-label="Font" value={ps.font ?? ''} onChange={(e) => { const font = (e.target.value || undefined) as PartStyle['font']; set({ font, ...(ps.weight && font ? { weight: snapWeight(font, ps.weight) } : {}) }); }}><option value="">Own</option>{FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select><Reset k="font" /></Row>
                  <Row label="Weight"><select className="cell" aria-label="Weight" value={ps.weight ?? ''} onChange={(e) => set({ weight: e.target.value ? Number(e.target.value) : undefined })}><option value="">Own</option>{(ps.font ? WEIGHTS[ps.font] : [500, 600, 700, 800, 900]).map((w) => <option key={w} value={w}>{({ 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' } as Record<number, string>)[w]}</option>)}</select><Reset k="weight" /></Row>
                  <Row label="Size"><Num label="px" value={ps.size ?? 0} lo={0} hi={240} placeholder="Own" onChange={(v) => set({ size: v >= 6 ? v : undefined }, 'size')} /><Reset k="size" /></Row>
                  <Row label="Spacing"><Num label="em" step={0.01} value={ps.spacing ?? 0} lo={-0.1} hi={0.6} onChange={(v) => set({ spacing: v === 0 ? undefined : v }, 'spacing')} /><Reset k="spacing" /></Row>
                  <Row label="Capitals"><Chips value={ps.caps ?? 'own'} options={[['own', 'Own'], ['upper', 'ALL CAPS'], ['none', 'As typed']]} onPick={(v) => set({ caps: v === 'own' ? undefined : v as 'upper' | 'none' })} /><Reset k="caps" /></Row>
                  {part[2] && <Row label="Words"><input className="cell" aria-label="Words" maxLength={40} placeholder="The graphic's own words" value={ps.label ?? ''} onChange={(e) => set({ label: e.target.value.replace(/[<>]/g, '') || undefined }, 'label')} /><Reset k="label" /></Row>}
                </Group>
                <Group title="Border and corners">
                  <Row label="Border"><Chips value={ps.border?.sides ?? 'own'} options={[['own', 'Own'], ['none', 'None'], ['all', 'All'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']]} onPick={(v) => set({ border: v === 'own' ? undefined : v === 'none' ? { sides: 'none' } : { sides: v as 'all', color: ps.border?.color ?? 'brand.primary', width: ps.border?.width ?? 2 } })} /><Reset k="border" /></Row>
                  {ps.border && ps.border.sides !== 'none' && (
                    <>
                      <ColorPick s={s} brand={brand} label="Colour" value={ps.border.color} onPick={(c) => set({ border: { ...ps.border!, color: c } }, 'border-c')} />
                      <Row label="Width"><Num label="px" value={ps.border.width ?? 2} lo={0} hi={16} onChange={(v) => set({ border: { ...ps.border!, width: v } }, 'border-w')} /><span /></Row>
                    </>
                  )}
                  <Row label="Corners"><Num label="px" value={ps.radius ?? 0} lo={0} hi={80} placeholder="Own" onChange={(v) => set({ radius: v }, 'radius')} /><Reset k="radius" /></Row>
                </Group>
                <Group title="Depth">
                  <Row label="Shadow"><Chips value={ps.depth ?? 'own'} options={[['own', 'Own'], ['none', 'None'], ['soft', 'Soft'], ['strong', 'Strong']]} onPick={(v) => set({ depth: v === 'own' ? undefined : v as 'none' })} /><Reset k="depth" /></Row>
                </Group>
                {(
                  <Group title="Entrance">
                    <Row label="Animation"><Chips value={ps.entrance?.kind ?? 'none'} options={ENTRANCES.map((x) => [x.id, x.name])} onPick={(v) => set({ entrance: v === 'none' ? undefined : { kind: v as 'rise', ms: ps.entrance?.ms ?? 600, delay: ps.entrance?.delay ?? 0, ...(ps.entrance?.stagger ? { stagger: true } : {}) } })} /><Reset k="entrance" /></Row>
                    {ps.entrance && (
                      <>
                        <Row label="Time · delay"><div className="tpl-num2"><Num label="ms" value={ps.entrance.ms} lo={0} hi={3000} onChange={(v) => set({ entrance: { ...ps.entrance!, ms: v } }, 'ent-ms')} /><Num label="ms" value={ps.entrance.delay} lo={0} hi={3000} onChange={(v) => set({ entrance: { ...ps.entrance!, delay: v } }, 'ent-delay')} /></div><span /></Row>
                        <Row label="Several"><Chips value={ps.entrance.stagger ? 'one' : 'all'} options={[['all', 'Together'], ['one', 'One after another']]} onPick={(v) => set({ entrance: { ...ps.entrance!, stagger: v === 'one' ? true : undefined } })} /><span /></Row>
                      </>
                    )}
                  </Group>
                )}
                {hud && part[0] === 'scorebug' && (
                  <Group title="Timer window">
                    <p className="faint t-xs">Lines the scorebug's open window up with the round timer the game draws.</p>
                    <Row label="Move"><Num label="px" value={draft.timer?.dx ?? 0} lo={-200} hi={200} onChange={(v) => change((t) => ({ ...t, timer: { dx: v, width: t.timer?.width ?? 160, plate: t.timer?.plate ?? '#17181e' } }), 'timer-dx')} /><span /></Row>
                    <Row label="Width"><Num label="px" value={draft.timer?.width ?? 160} lo={100} hi={240} onChange={(v) => change((t) => ({ ...t, timer: { dx: t.timer?.dx ?? 0, width: v, plate: t.timer?.plate ?? '#17181e' } }), 'timer-w')} /><span /></Row>
                    <Row label="Plate"><input type="color" aria-label="Plate colour" value={draft.timer?.plate ?? '#17181e'} onChange={(e) => change((t) => ({ ...t, timer: { dx: t.timer?.dx ?? 0, width: t.timer?.width ?? 160, plate: e.target.value } }), 'timer-plate')} /><button type="button" className={`tpl-rd ${draft.timer ? 'set' : ''}`} aria-label="Reset timer window" disabled={!draft.timer} onClick={() => change((t) => ({ ...t, timer: undefined }))} /></Row>
                  </Group>
                )}
                <div className="tpl-insp-foot">
                  <button className="btn small" disabled={!draft.parts[part[0]]} onClick={() => setPart(part[0], null)}>Reset {part[1].toLowerCase()}</button>
                  <button className="btn quiet small" disabled={!draft.parts[part[0]]} onClick={() => { setClip(structuredClone(ps)); setNotice(`Copied the style of ${part[1].toLowerCase()}.`); }}>Copy style</button>
                  <button className="btn quiet small" disabled={!clip} onClick={() => { const { label: _l, ...rest } = clip!; setPart(part[0], part[2] ? clip! : rest); }}>Paste style</button>
                </div>
              </>
            ) : <p className="muted t-sm" style={{ padding: 14 }}>This graphic has no parts to edit.</p>}
          </aside>
        </div>
      </div>
    </div>
  );
}

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <details className="tpl-grp" open><summary className="cap">{title}</summary><div className="tpl-grp-body">{children}</div></details>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="tpl-row"><span>{label}</span>{children}</div>;
}
function Num({ label, value, lo, hi, step = 1, placeholder, onChange }: { label: string; value: number; lo: number; hi: number; step?: number; placeholder?: string; onChange: (v: number) => void }) {
  return (
    <span className="tpl-in">
      <input type="number" aria-label={label} value={placeholder && !value ? '' : value} placeholder={placeholder} min={lo} max={hi} step={step}
        onChange={(e) => { const v = Number(e.target.value); if (e.target.value === '') onChange(0); else if (Number.isFinite(v)) onChange(clampN(v, lo, hi)); }} />
      <i>{label}</i>
    </span>
  );
}
function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <span className="tpl-slider"><input type="range" min={0} max={100} value={value} aria-label="Opacity" onChange={(e) => onChange(Number(e.target.value))} /><span className="mono t-2xs">{value}%</span></span>;
}
function Chips({ value, options, onPick }: { value: string; options: Array<[string, string]>; onPick: (v: string) => void }) {
  return <div className="tpl-chips" role="radiogroup">{options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={`chipbtn ${value === v ? 'on' : ''}`} onClick={() => onPick(v)}>{l}</button>)}</div>;
}
/** Brand and team swatches first, then any colour. */
function ColorPick({ s, brand, label, value, own, onPick, reset }: { s: Snapshot; brand: BrandKit; label: string; value?: ColorRef; own?: boolean; onPick: (c: ColorRef) => void; reset?: () => void }) {
  const name = value ? (SWATCHES.find((w) => w.ref === value)?.name ?? value.toUpperCase()) : 'Own';
  const custom = value && value.startsWith('#') ? value : '#ffffff';
  return (
    <div className="tpl-color">
      <div className="tpl-row"><span>{label}</span><span className="faint t-xs">{own && !value ? 'The graphic’s own' : name}</span>{reset ? <button type="button" className="tpl-rd set" aria-label={`Reset ${label}`} onClick={reset} /> : <span />}</div>
      <div className="tpl-swatches">
        {SWATCHES.map((w) => <button key={w.ref} type="button" className={`sw ${value === w.ref ? 'on' : ''}`} title={w.name} aria-label={w.name} style={{ background: swatchColor(w.ref, brand, s) }} onClick={() => onPick(w.ref)} />)}
        <label className={`sw custom ${value?.startsWith('#') ? 'on' : ''}`} title="Any colour"><input type="color" aria-label={`${label}: any colour`} value={custom} onChange={(e) => onPick(e.target.value)} /></label>
      </div>
    </div>
  );
}

export { BRAND_KEYS, BRAND_NAME, graphicStyle };
