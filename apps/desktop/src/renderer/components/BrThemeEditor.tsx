// Graphics studio › Event theme (23 Nov): the colour world of a battle royale lobby's graphics. A preset (Sky,
// Jungle, Inferno) or own colours over one, the background picture (a kit wallpaper or an upload), the emblem
// (the event's logo by default, or an upload) and the props (airdrop crate, parachutes, which side). The draft
// shows at once on a big preview (`AIR_BR_DRAFT`, preview pages only); Save puts it on the lobby (and on air).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import {
  BR_SCREENS, BR_SCREEN_NAME, BR_THEMES, BR_THEME_BASE, BR_THEME_COLOURS, BR_THEME_COLOUR_NAME, BR_THEME_NAME, DEFAULT_THEME,
  type BrScreen, type BrTheme, type BrThemeColour,
} from '../../shared/br-screens.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { AssetPicker } from './AssetPicker.tsx';
import { templatePreviewUrl } from './TemplateEditor.tsx';

const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('That file could not be read.'));
  reader.readAsDataURL(file);
});
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const full = (t: BrTheme | undefined): BrTheme => ({ ...DEFAULT_THEME, ...(t ?? {}), props: { ...DEFAULT_THEME.props!, ...(t?.props ?? {}) } });

export function BrThemeEditor({ s, run }: { s: Snapshot; run: Run }) {
  const lobbies = s.lobbies.filter((l) => l.game === s.game?.id);
  const [lobbyId, setLobbyId] = useState(s.selectedLobbyId && lobbies.some((l) => l.id === s.selectedLobbyId) ? s.selectedLobbyId : lobbies[0]?.id ?? '');
  const lobby = lobbies.find((l) => l.id === lobbyId) ?? null;
  const saved = full(lobby?.look?.theme);
  const [draft, setDraft] = useState<BrTheme>(saved);
  useEffect(() => setDraft(full(lobby?.look?.theme)), [lobbyId]);
  const [graphic, setGraphic] = useState<BrScreen>('br-lobby');
  const [pick, setPick] = useState<'background' | null>(null);
  const [busy, setBusy] = useState(false);
  const key = useMemo(() => Math.random().toString(36).slice(2), []);
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale((e?.contentRect.width ?? 768) / 1920));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const send = useCallback(async () => {
    if (!lobby) return;
    const fields = await air.lobbyPreview(lobby.id, draft).catch(() => null);
    if (fields) frame.current?.contentWindow?.postMessage({ type: 'AIR_BR_DRAFT', key, fields }, '*');
  }, [lobby?.id, draft, key]);
  useEffect(() => { void send(); }, [send]);
  const ev = s.events.find((e) => e.id === lobby?.eventId) ?? null;
  const dirty = !same(draft, saved);
  const base = BR_THEME_BASE[draft.preset];
  const set = (patch: Partial<BrTheme>) => setDraft((d) => ({ ...d, ...patch }));
  const colour = (k: BrThemeColour, v: string | null) => setDraft((d) => {
    const colors = { ...(d.colors ?? {}) };
    if (v === null || v.toLowerCase() === base[k]) delete colors[k]; else colors[k] = v.toLowerCase();
    return { ...d, colors };
  });
  const props = (patch: Partial<NonNullable<BrTheme['props']>>) => set({ props: { ...draft.props!, ...patch } });
  const upload = async (file: File | undefined, field: 'background' | 'emblem') => {
    if (!file) return;
    setBusy(true);
    try { const url = await air.uploadImage(await readFile(file)); set({ [field]: url }); } finally { setBusy(false); }
  };
  const save = (all: boolean) => run(async () => {
    const targets = all ? lobbies.filter((l) => l.eventId === lobby!.eventId) : [lobby!];
    let snap: Snapshot | undefined;
    for (const l of targets) snap = await air.lobbyLook(l.id, { theme: draft });
    return snap!;
  });
  if (!lobbies.length) return <p className="muted">Create a lobby in Events first; its graphics take the theme you set here.</p>;
  const src = templatePreviewUrl(s, `${graphic}|full`, { editorKey: key });
  return (
    <div className="bt">
      <div className="bt-stage">
        <div className="row g-2" style={{ flexWrap: 'wrap' }}>
          <select className="cell" aria-label="Lobby" value={lobbyId} onChange={(e) => setLobbyId(e.target.value)}>
            {lobbies.map((l) => <option key={l.id} value={l.id}>{l.title}{s.events.find((e) => e.id === l.eventId) ? ` · ${s.events.find((e) => e.id === l.eventId)!.name}` : ''}</option>)}
          </select>
          <div className="seg" role="tablist" aria-label="Preview graphic">
            {BR_SCREENS.map((id) => <button key={id} role="tab" aria-selected={graphic === id} aria-pressed={graphic === id} onClick={() => setGraphic(id)}>{BR_SCREEN_NAME[id]}</button>)}
          </div>
        </div>
        <div ref={box} className="pv bt-pv" role="img" aria-label={`Preview: ${BR_SCREEN_NAME[graphic]}`}>
          <iframe key={src} ref={frame} title={BR_SCREEN_NAME[graphic]} src={src} tabIndex={-1} style={{ transform: `scale(${scale})` }} onLoad={() => setTimeout(() => void send(), 150)} />
        </div>
        <span className="faint t-xs">Sample teams; the colours, pictures and props are this lobby&rsquo;s. Kit pictures need the event&rsquo;s game licence (Game assets).</span>
      </div>
      <aside className="bt-side stack g-3">
        <section className="stack g-2">
          <b className="t-sm">Theme</b>
          <div className="bt-presets">
            {BR_THEMES.map((p) => (
              <button key={p} className={`card bt-preset ${draft.preset === p ? 'sel' : ''}`} aria-pressed={draft.preset === p} onClick={() => set({ preset: p, colors: {} })}>
                <i style={{ background: `radial-gradient(120% 120% at 70% 0%, ${BR_THEME_BASE[p].bg2}, ${BR_THEME_BASE[p].bg1} 70%)` }}><em style={{ background: BR_THEME_BASE[p].acc }} /></i>
                <span>{BR_THEME_NAME[p]}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="stack g-2">
          <div className="between"><b className="t-sm">Colours</b>{draft.colors && Object.keys(draft.colors).length > 0 && <button className="btn quiet small" onClick={() => set({ colors: {} })}>Use {BR_THEME_NAME[draft.preset]}&rsquo;s</button>}</div>
          <div className="bt-colours">
            {BR_THEME_COLOURS.map((k) => {
              const v = draft.colors?.[k] ?? base[k];
              return (
                <label key={k} className="bt-colour">
                  <input type="color" value={v} onChange={(e) => colour(k, e.target.value)} aria-label={BR_THEME_COLOUR_NAME[k]} />
                  <span className="t-sm">{BR_THEME_COLOUR_NAME[k]}</span>
                  {draft.colors?.[k] ? <button className="btn quiet small" aria-label={`Reset ${BR_THEME_COLOUR_NAME[k]}`} onClick={(e) => { e.preventDefault(); colour(k, null); }}>↺</button> : <span className="faint t-xs">preset</span>}
                </label>
              );
            })}
          </div>
        </section>
        <section className="stack g-2">
          <b className="t-sm">Background picture</b>
          <div className="row g-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn small" onClick={() => setPick('background')}>Kit wallpaper…</button>
            <label className="btn small">Upload…<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => void upload(e.target.files?.[0], 'background')} /></label>
            {draft.background && <button className="btn quiet small" onClick={() => set({ background: '' })}>Pack default</button>}
          </div>
          <span className="faint t-xs">{draft.background ? (draft.background.startsWith('/air-assets/') ? 'Your picture.' : 'A kit wallpaper.') : 'The pack’s first wallpaper, under the theme’s colour veil.'}</span>
        </section>
        <section className="stack g-2">
          <b className="t-sm">Emblem</b>
          <div className="row g-2" style={{ flexWrap: 'wrap' }}>
            <label className="btn small">Upload…<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => void upload(e.target.files?.[0], 'emblem')} /></label>
            {draft.emblem && <button className="btn quiet small" onClick={() => set({ emblem: '' })}>Use the event&rsquo;s logo</button>}
          </div>
          <span className="faint t-xs">{draft.emblem ? 'Your emblem.' : ev?.logo ? `${ev.name}’s logo.` : 'A shield with the event’s name (the event has no logo).'} Shown on Starting soon and Champions.</span>
        </section>
        <section className="stack g-2">
          <b className="t-sm">Props</b>
          <label className="row g-2 t-sm"><input type="checkbox" checked={draft.props!.crate} onChange={(e) => props({ crate: e.target.checked })} /> Airdrop crate <span className="faint t-xs">(a kit item)</span></label>
          <label className="row g-2 t-sm"><input type="checkbox" checked={draft.props!.chutes} onChange={(e) => props({ chutes: e.target.checked })} /> Parachutes</label>
          <div className="seg" role="tablist" aria-label="Props side">
            {(['left', 'right'] as const).map((side) => <button key={side} role="tab" aria-selected={draft.props!.side === side} aria-pressed={draft.props!.side === side} onClick={() => props({ side })}>{side === 'left' ? 'Left' : 'Right'}</button>)}
          </div>
          <span className="faint t-xs">Move, resize or hide a prop on one graphic in Looks (its layers).</span>
        </section>
        <div className="row g-2 bt-actions">
          <button className="btn primary" disabled={!dirty} onClick={() => void save(false)}>Save{s.selectedLobbyId === lobbyId ? ' · on air' : ''}</button>
          {lobbies.filter((l) => l.eventId === lobby?.eventId).length > 1 && <button className="btn" onClick={() => void save(true)}>Use for every lobby of {ev?.name ?? 'this event'}</button>}
          {dirty && <button className="btn quiet" onClick={() => setDraft(saved)}>Undo changes</button>}
        </div>
      </aside>
      {pick && <AssetPicker s={s} slot="background" current={draft.background ? { src: draft.background, kind: 'wallpaper' } : undefined} pick={(p) => set({ background: p.src })} close={() => setPick(null)} />}
    </div>
  );
}
