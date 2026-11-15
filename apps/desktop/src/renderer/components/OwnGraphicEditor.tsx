// Your own graphics (approved mock, 14 Nov): import the finished design (a 1920×1080 PNG from
// Photoshop), then drag fields onto it as data boxes. "With data" shows the overlay page itself
// (overlays/own.html, preview only) filled from the sample room with this match's teams.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { BUILT_IN_FONTS, OWN_FIELDS, OWN_PURPOSES, fieldOf, newBox, type OwnBox, type OwnGraphic } from '../../shared/own-graphics.ts';
import { LIBRARY_ROOM } from '../../shared/library.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';

const GROUPS = [...new Set(OWN_FIELDS.map((f) => f.group))];
const SOURCE: Record<string, string> = { game: 'Game', esportra: 'Esportra', air: 'Air' };
const SWATCHES = ['#ffffff', '#0b0b0e', '#ffb22e', '#f43f5e', '#22d3ee', '#34d399', '#a78bfa'];
const readFile = (file: File) => new Promise<string>((done, fail) => { const r = new FileReader(); r.onload = () => done(String(r.result)); r.onerror = () => fail(new Error('That file could not be read.')); r.readAsDataURL(file); });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

export function blankOwn(): OwnGraphic {
  return { id: crypto.randomUUID(), name: '', purpose: 'map-result', style: 'full', image: '', fonts: [], boxes: [], enter: 'fade', exit: 'fade', createdAt: Date.now(), updatedAt: Date.now() };
}

export function OwnGraphicEditor({ s, run, start, close }: { s: Snapshot; run: Run; start: OwnGraphic; close: () => void }) {
  const [g, setG] = useState<OwnGraphic>(start);
  const [saved, setSaved] = useState(JSON.stringify(start));
  const [step, setStep] = useState<'import' | 'place'>(start.image ? 'place' : 'import');
  const [sel, setSel] = useState<string | null>(start.boxes[0]?.id ?? null);
  const [mode, setMode] = useState<'boxes' | 'data'>('boxes');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.5);
  const key = useMemo(() => crypto.randomUUID(), []);
  const dirty = JSON.stringify(g) !== saved;
  const box = g.boxes.find((b) => b.id === sel) ?? null;
  const asset = (url: string) => `http://127.0.0.1:${s.engine.port}${url}`;
  const page = `http://127.0.0.1:${s.engine.port}/overlays/own.html?${new URLSearchParams({ match: LIBRARY_ROOM, screen: '1', preview: '1', editorKey: key })}`;

  useEffect(() => { void air.librarySeed().catch(() => {}); }, []);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale((e?.contentRect.width ?? 960) / 1920));
    ro.observe(el);
    return () => ro.disconnect();
  }, [step]);
  // The overlay page shows the draft (preview pages only, checked by the one-off key).
  const post = (msg: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ ...msg, key }, '*');
  // The page is served by the graphics engine, so the design and fonts keep their own /air-assets/ addresses.
  useEffect(() => { post({ type: 'AIR_OWN_DRAFT', graphic: g }); }, [g, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (patch: Partial<OwnGraphic>) => setG((x) => ({ ...x, ...patch }));
  const setBox = (id: string, patch: Partial<OwnBox>) => setG((x) => ({ ...x, boxes: x.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  const addBox = (field: string, x = 960, y = 540) => {
    const b = newBox(field, x, y, `b${crypto.randomUUID().slice(0, 8)}`);
    setG((v) => ({ ...v, boxes: [...v.boxes, b] }));
    setSel(b.id);
  };
  const removeBox = (id: string) => { setG((x) => ({ ...x, boxes: x.boxes.filter((b) => b.id !== id) })); setSel(null); };

  const importDesign = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    if (file.type !== 'image/png') { setNotice('Export the design from Photoshop as a PNG.'); return; }
    setBusy(true);
    try {
      const url = await air.uploadArtwork(await readFile(file));
      change({ image: url, ...(g.name ? {} : { name: file.name.replace(/\.png$/i, '').replace(/[-_]+/g, ' ').slice(0, 60) }) });
    } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); }
  };
  const addFont = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    try { const f = await air.uploadFont(await readFile(file), file.name); change({ fonts: [...g.fonts, f] }); } catch (e) { setNotice((e as Error).message); }
  };
  const save = async () => { if (await run(() => air.ownSave(g))) setSaved(JSON.stringify(g)); };
  // Closing never loses work silently: unsaved changes ask first (Esc and the Close button alike).
  const [leaving, setLeaving] = useState(false);
  const tryClose = () => (dirty ? setLeaving(true) : close());
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); if (leaving) setLeaving(false); else tryClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Drag a box to move it, its corner to size it (design pixels, snapped to whole pixels).
  const drag = useRef<{ id: string; kind: 'move' | 'size'; x: number; y: number; start: OwnBox } | null>(null);
  const onDown = (e: React.PointerEvent, id: string, kind: 'move' | 'size') => {
    e.stopPropagation();
    const b = g.boxes.find((x) => x.id === id)!;
    setSel(id);
    drag.current = { id, kind, x: e.clientX, y: e.clientY, start: b };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / scale, dy = (e.clientY - d.y) / scale;
    if (d.kind === 'move') setBox(d.id, { x: clamp(d.start.x + dx, -1920, 1920), y: clamp(d.start.y + dy, -1080, 1080) });
    else setBox(d.id, { w: clamp(d.start.w + dx, 8, 1920), h: clamp(d.start.h + dy, 8, 1080) });
  };
  const onUp = () => { drag.current = null; };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (step !== 'place' || !box || ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      const n = e.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] };
      if (moves[e.key]) { e.preventDefault(); setBox(box.id, { x: box.x + moves[e.key]![0], y: box.y + moves[e.key]![1] }); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeBox(box.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const dropField = (e: React.DragEvent) => {
    e.preventDefault();
    const field = e.dataTransfer.getData('text/air-field');
    const r = canvas.current?.getBoundingClientRect();
    if (field && r) addBox(field, (e.clientX - r.left) / scale, (e.clientY - r.top) / scale);
  };
  const fonts = [...BUILT_IN_FONTS, ...g.fonts.map((f) => f.name)];

  return (
    <div className="scrim tpl-scrim" role="dialog" aria-modal="true" aria-label={`Your graphic: ${g.name || 'new'}`}>
      <div className="tpl own-ed">
        <header className="tpl-bar">
          <div className="tpl-name">
            <input aria-label="Graphic name" value={g.name} maxLength={60} placeholder="Name this graphic" onChange={(e) => change({ name: e.target.value })} />
            <span className="faint t-xs">Your graphic · {g.style === 'band' ? 'overlay bar' : 'full screen'} · {g.boxes.length} box{g.boxes.length === 1 ? '' : 'es'}</span>
          </div>
          {dirty ? <span className="tpl-dirty">Not saved</span> : <span className="faint t-xs">Saved</span>}
          <span className="spacer" />
          {step === 'place' && <>
            <div className="seg" role="group" aria-label="Show">
              <button aria-pressed={mode === 'boxes'} onClick={() => setMode('boxes')}>Boxes</button>
              <button aria-pressed={mode === 'data'} onClick={() => setMode('data')}>With data</button>
            </div>
            <button className="btn" disabled={mode !== 'data'} onClick={() => post({ type: 'AIR_OWN_PLAY' })}>▶ Play entrance</button>
            <button className="btn primary" disabled={!dirty || !g.image} onClick={() => void save()}>{s.onAirLooks.includes(g.id) ? 'Save · on air now' : 'Save'}</button>
          </>}
          <button className="btn quiet" onClick={tryClose}>Esc · Close</button>
        </header>
        {leaving && (
          <div className="tpl-confirm" role="alertdialog" aria-label="Unsaved changes">
            <span>This graphic has changes that are not saved.</span>
            <button className="btn primary small" disabled={!g.image || !g.name.trim()} onClick={() => void (async () => { if (await run(() => air.ownSave(g))) close(); })()}>Save and close</button>
            <button className="btn small danger" onClick={close}>Close without saving</button>
            <button className="btn quiet small" onClick={() => setLeaving(false)}>Keep editing</button>
          </div>
        )}
        {notice && <p className="own-notice" role="alert">{notice}</p>}
        {s.onAirLooks.includes(g.id) && <p className="onair-note" role="status"><b>On air now.</b> Saving changes what viewers see straight away.</p>}

        {step === 'import' ? (
          <div className="own-import">
            <label className={`own-drop ${g.image ? 'has' : ''}`}>
              {g.image ? <img src={asset(g.image)} alt="Your design" /> : <span className="own-drop-in"><b>{busy ? 'Checking the design…' : 'Choose the design (PNG)'}</b><span className="faint t-sm">1920 × 1080, up to 16 MB, exported from Photoshop with see-through areas where the game should show.</span></span>}
              <input type="file" accept="image/png" aria-label="Design PNG" hidden onChange={(e) => void importDesign(e.target.files?.[0])} />
            </label>
            <div className="stack" style={{ gap: 14 }}>
              <label className="field"><span>Name</span><input value={g.name} maxLength={60} onChange={(e) => change({ name: e.target.value })} placeholder="e.g. Neon Cup · Map result" /></label>
              <label className="field"><span>What it is for</span><select aria-label="What it is for" value={g.purpose} onChange={(e) => change({ purpose: e.target.value })}>{OWN_PURPOSES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
              <span className="faint t-xs" style={{ marginTop: -8 }}>Decides its place in the Rundown and its moment. “Anything” is only taken by hand.</span>
              <div className="field"><span>How it shows</span><div className="seg" role="group" aria-label="How it shows">
                <button aria-pressed={g.style === 'full'} onClick={() => change({ style: 'full' })}>Full screen</button>
                <button aria-pressed={g.style === 'band'} onClick={() => change({ style: 'band' })}>Overlay bar</button>
              </div></div>
              <ul className="own-checks">
                <li className={g.image ? 'ok' : ''}>{g.image ? '✓' : '·'} 1920 × 1080 PNG, up to 16 MB</li>
                <li className="warn">! Text that is part of the picture stays as it is: put a box over anything that should change.</li>
              </ul>
              <span className="row-gap" style={{ justifyContent: 'flex-end' }}>
                <button className="btn quiet" onClick={tryClose}>Cancel</button>
                <button className="btn primary" disabled={!g.image || !g.name.trim()} onClick={() => setStep('place')}>Next: place the data</button>
              </span>
            </div>
          </div>
        ) : (
          <div className="tpl-body">
            <aside className="tpl-left own-fields" aria-label="Fields">
              <span className="cap">Fields</span>
              <span className="faint t-xs">Drag one onto the design, or click to add it in the middle. Only verified sources: {Object.values(SOURCE).join(', ')}.</span>
              {GROUPS.map((grp) => (
                <details key={grp} className="tpl-grp" open={grp !== 'Players'}>
                  <summary className="cap">{grp}</summary>
                  <div className="own-field-list">
                    {OWN_FIELDS.filter((f) => f.group === grp).map((f) => {
                      const used = g.boxes.some((b) => b.field === f.id);
                      return (
                        <button key={f.id} type="button" draggable className={`own-field ${used ? 'used' : ''}`} onDragStart={(e) => e.dataTransfer.setData('text/air-field', f.id)} onClick={() => addBox(f.id)} title={`From ${SOURCE[f.source]}`}>
                          <span>{f.label}</span><i>{f.kind === 'image' ? 'picture' : f.kind === 'color' ? 'colour' : SOURCE[f.source]}</i>
                        </button>
                      );
                    })}
                  </div>
                </details>
              ))}
            </aside>
            <section className="tpl-mid">
              <div className="tpl-cvwrap">
                <div className="tpl-canvas clear own-canvas" ref={canvas} onDragOver={(e) => e.preventDefault()} onDrop={dropField} onPointerMove={onMove} onPointerUp={onUp} onPointerDown={() => setSel(null)}>
                  {mode === 'data'
                    ? <iframe ref={frame} title="Your graphic with data" src={page} style={{ transform: `scale(${scale})` }} onLoad={() => post({ type: 'AIR_OWN_DRAFT', graphic: g })} />
                    : <img className="own-art" src={asset(g.image)} alt="Your design" draggable={false} />}
                  {g.boxes.map((b) => (
                    <div key={b.id} className={`own-box ${b.id === sel ? 'on' : ''} ${mode === 'data' ? 'quiet' : ''}`} style={{ left: b.x * scale, top: b.y * scale, width: b.w * scale, height: b.h * scale, borderRadius: b.radius * scale }}
                      onPointerDown={(e) => onDown(e, b.id, 'move')} role="button" aria-label={`Box: ${fieldOf(b.field)?.label ?? b.field}`} aria-pressed={b.id === sel}>
                      <span>{fieldOf(b.field)?.label}</span>
                      <i className="own-handle" onPointerDown={(e) => onDown(e, b.id, 'size')} aria-hidden="true" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="tpl-foot faint t-xs"><span>Drag a field onto the design · drag a box to move it, its corner to size it · arrows nudge 1 px (Shift 10) · Delete removes a box</span><span className="spacer" /><span className="mono">1920 × 1080 · {Math.round(scale * 100)}%</span></div>
            </section>
            <aside className="tpl-right" aria-label="Settings for the selected box">
              {box ? (
                <>
                  <div className="tpl-insp-head"><span className="cap">Selected box</span><h3>{fieldOf(box.field)?.label}</h3></div>
                  <Group title="Data">
                    <Row label="Field"><select aria-label="Field" value={box.field} onChange={(e) => setBox(box.id, { field: e.target.value })}>{GROUPS.map((grp) => <optgroup key={grp} label={grp}>{OWN_FIELDS.filter((f) => f.group === grp).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>)}</select></Row>
                    <Row label="When empty"><input aria-label="Text when there is no data" value={box.empty} maxLength={40} placeholder="Show nothing" onChange={(e) => setBox(box.id, { empty: e.target.value })} /></Row>
                  </Group>
                  {fieldOf(box.field)?.kind === 'text' && (
                    <Group title="Text">
                      <Row label="Font"><select aria-label="Font" value={box.font} onChange={(e) => setBox(box.id, { font: e.target.value })}>{fonts.map((f) => <option key={f} value={f}>{f}</option>)}</select></Row>
                      <Row label="Size"><input type="number" aria-label="Size" min={8} max={400} value={box.size} onChange={(e) => setBox(box.id, { size: clamp(Number(e.target.value) || 8, 8, 400) })} /></Row>
                      <Row label="Colour"><span className="own-swatches">{SWATCHES.map((c) => <button key={c} type="button" className={`own-sw ${box.color === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setBox(box.id, { color: c })} />)}<input type="color" aria-label="Any colour" value={box.color} onChange={(e) => setBox(box.id, { color: e.target.value })} /></span></Row>
                      <Row label="Align"><Chips value={box.align} options={[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]} onPick={(v) => setBox(box.id, { align: v as OwnBox['align'] })} /></Row>
                      <Row label="Capitals"><Chips value={box.caps} options={[['data', 'As data'], ['upper', 'ALL CAPS']]} onPick={(v) => setBox(box.id, { caps: v as OwnBox['caps'] })} /></Row>
                      <Row label="Too long"><Chips value={box.fit} options={[['shrink', 'Shrink to fit'], ['cut', 'Cut …']]} onPick={(v) => setBox(box.id, { fit: v as OwnBox['fit'] })} /></Row>
                    </Group>
                  )}
                  {fieldOf(box.field)?.kind !== 'text' && (
                    <Group title="Shape">
                      <Row label="Corners"><input type="number" aria-label="Corners" min={0} max={540} value={box.radius} onChange={(e) => setBox(box.id, { radius: clamp(Number(e.target.value) || 0, 0, 540) })} /></Row>
                      <Row label=""><button type="button" className="btn small" onClick={() => setBox(box.id, { radius: 540 })}>Circle</button></Row>
                    </Group>
                  )}
                  <Group title="Position">
                    <Row label="X · Y"><span className="own-pair"><input type="number" aria-label="X" value={box.x} onChange={(e) => setBox(box.id, { x: clamp(Number(e.target.value) || 0, -1920, 1920) })} /><input type="number" aria-label="Y" value={box.y} onChange={(e) => setBox(box.id, { y: clamp(Number(e.target.value) || 0, -1080, 1080) })} /></span></Row>
                    <Row label="W · H"><span className="own-pair"><input type="number" aria-label="Width" value={box.w} onChange={(e) => setBox(box.id, { w: clamp(Number(e.target.value) || 8, 8, 1920) })} /><input type="number" aria-label="Height" value={box.h} onChange={(e) => setBox(box.id, { h: clamp(Number(e.target.value) || 8, 8, 1080) })} /></span></Row>
                    <Row label=""><button type="button" className="btn small danger" onClick={() => removeBox(box.id)}>Remove box</button></Row>
                  </Group>
                </>
              ) : <div className="tpl-insp-head"><span className="cap">No box selected</span><span className="faint t-sm">Click a box on the design, or add a field from the left.</span></div>}
              <Group title="Whole graphic">
                <Row label="For"><select aria-label="What it is for" value={g.purpose} onChange={(e) => change({ purpose: e.target.value })}>{OWN_PURPOSES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></Row>
                <Row label="In"><Chips value={g.enter} options={[['cut', 'Cut'], ['fade', 'Fade'], ['slide', 'Slide']]} onPick={(v) => change({ enter: v as OwnGraphic['enter'] })} /></Row>
                <Row label="Out"><Chips value={g.exit} options={[['cut', 'Cut'], ['fade', 'Fade'], ['slide', 'Slide']]} onPick={(v) => change({ exit: v as OwnGraphic['exit'] })} /></Row>
                <Row label="Fonts"><span className="own-fonts">{g.fonts.map((f) => <span key={f.id} className="tally">{f.name}</span>)}<label className="btn small">Add a font<input type="file" accept=".woff2,.woff,.ttf,.otf" hidden aria-label="Font file" onChange={(e) => void addFont(e.target.files?.[0])} /></label></span></Row>
                <Row label="Design"><button type="button" className="btn small" onClick={() => setStep('import')}>Replace the design</button></Row>
              </Group>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <details className="tpl-grp" open><summary className="cap">{title}</summary><div className="tpl-grp-body">{children}</div></details>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="tpl-row"><span>{label}</span>{children}</div>;
}
function Chips({ value, options, onPick }: { value: string; options: Array<[string, string]>; onPick: (v: string) => void }) {
  return <div className="tpl-chips" role="radiogroup">{options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} className={`chipbtn ${value === v ? 'on' : ''}`} onClick={() => onPick(v)}>{l}</button>)}</div>;
}
