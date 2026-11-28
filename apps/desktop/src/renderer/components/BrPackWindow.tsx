// HUD library's pack window for a battle royale game (23 Nov): the same window as the Valorant pack (list on the
// left, a large preview, what it is on the right), choosing only. The HUD's layout is chosen here for the lobby on
// the graphics; full screens are put on air from Live.
import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { BR_THEME_NAME, BR_SCREENS, BR_SCREEN_NAME, BR_SCREEN_PHASE, BR_SCREEN_WHAT, type BrScreen, type HudLayout } from '../../shared/br-screens.ts';
import { BUILTIN_BR_HUD, DEFAULT_BRAND, type BrandKit } from '../../shared/templates.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { useEscape } from './Dialogs.tsx';
import { Preview, StillPreview } from './Preview.tsx';
import { openTemplateEditor, templatePreviewUrl } from './TemplateEditor.tsx';

const LIST: Array<[string, string]> = BR_SCREENS.map((id): [string, string] => [id, BR_SCREEN_NAME[id]]);

/** The window's two tabs: the ready-made in-game HUD templates (28 Nov, approved mock) and the full screens. */
export function BrPackWindow({ s, run, close }: { s: Snapshot; run: Run; close: () => void }) {
  const [tab, setTab] = useState<'hud' | 'screens'>('hud');
  const ref = useEscape(close);
  const lobby = s.lobbies.find((l) => l.id === s.selectedLobbyId) ?? null;
  return (
    <div className="scrim center" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="pack hx-pack" role="dialog" aria-modal="true" aria-label={`${s.game?.pack ?? 'Battle royale'} pack`} ref={ref}>
        <header>
          <div><span className="cap">HUD library</span><h2 className="title-md" style={{ marginTop: 2 }}>ESPORTRA HUD</h2></div>
          <span className="pill">{s.game?.name}</span>
          <span className="faint t-sm">{lobby ? lobby.title : 'No lobby chosen'}</span>
          <span className="spacer" />
          <div className="seg" role="tablist" aria-label="Window">
            <button role="tab" aria-selected={tab === 'hud'} aria-pressed={tab === 'hud'} onClick={() => setTab('hud')}>In-game HUD</button>
            <button role="tab" aria-selected={tab === 'screens'} aria-pressed={tab === 'screens'} onClick={() => setTab('screens')}>Full screens</button>
          </div>
          <button className="btn quiet small" onClick={close}>Esc</button>
        </header>
        {tab === 'hud' ? <HudTemplates s={s} run={run} lobby={lobby} /> : <FullScreens s={s} lobby={lobby} />}
      </div>
    </div>
  );
}

type PickCard = { key: string; name: string; line: string; layout: HudLayout; templateId: string | null; builtin: boolean };

/** The brand of the lobby's event, as the HUD takes it: Primary highlights, Panel the dark plates, the logo on the rail. */
function eventBrand(s: Snapshot, lobby: Snapshot['lobbies'][number] | null) {
  const ev = lobby ? s.events?.find((e) => e.id === lobby.eventId) : undefined;
  const kit: BrandKit = { ...DEFAULT_BRAND, ...(ev?.brand ?? {}), primary: ev?.accent ?? DEFAULT_BRAND.primary } as BrandKit;
  const logo = ev?.logoLight || ev?.logo || '';
  return { ev, kit, logo, hasBrand: !!ev };
}

function HudTemplates({ s, run, lobby }: { s: Snapshot; run: Run; lobby: Snapshot['lobbies'][number] | null }) {
  const look = lobby?.look;
  const currentLayout: HudLayout = look?.hud ?? 'rail';
  const currentTemplate = look?.templates?.brhud ?? null;
  const mine: PickCard[] = s.templates.filter((t) => t.graphic === 'brhud' && t.layout).map((t) => ({ key: t.id, name: t.name, line: `Your template on ${BUILTIN_BR_HUD.find((b) => b.layout === t.layout)?.name ?? t.layout}.`, layout: t.layout!, templateId: t.id, builtin: false }));
  const cards: PickCard[] = [...BUILTIN_BR_HUD.map((b) => ({ key: b.id, name: b.name, line: b.line, layout: b.layout, templateId: null, builtin: true })), ...mine];
  const inUse = (c: PickCard) => (c.templateId ? currentTemplate === c.templateId : !currentTemplate && currentLayout === c.layout);
  const [pick, setPick] = useState<string>(() => (cards.find(inUse) ?? cards[0]!).key);
  const [moment, setMoment] = useState<'elim' | 'none'>('elim');
  const card = cards.find((c) => c.key === pick) ?? cards[0]!;
  const { ev, kit, logo, hasBrand } = eventBrand(s, lobby);
  const brandQ: Record<string, string> = hasBrand ? { brand: JSON.stringify({ primary: kit.primary, panel: kit.panel }), ...(logo ? { emblem: logo } : {}) } : {};
  const url = (c: PickCard, extra: Record<string, string> = {}) => templatePreviewUrl(s, 'brhud', { mode: c.layout, ...extra });
  const use = (c: PickCard) => lobby && run(() => air.lobbyLook(lobby.id, { hud: c.layout, templates: { brhud: c.templateId ?? '' }, hudBrand: hasBrand }));
  return (
    <div className="hx-body">
      <div className="hx-list">
        <span className="cap">Ready-made templates</span>
        {cards.map((c) => (
          <article key={c.key} className={`hx-card ${c.key === card.key ? 'sel' : ''}`}>
            <div className="hx-still" role="button" tabIndex={0} onClick={() => setPick(c.key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPick(c.key); } }} aria-label={`Preview ${c.name}`} aria-pressed={c.key === card.key}>
              <StillPreview src={url(c, brandQ)} label={c.name} stamp={`brhud-${c.layout}-${c.templateId ?? ''}-${kit.primary}`} />
            </div>
            <div className="hx-cb">
              <div className="hx-ct"><b>{c.name}</b>{inUse(c) && <span className="tally ready">In use</span>}</div>
              <p>{c.line}</p>
              {c.key === card.key
                ? <button className="btn primary small" disabled={!lobby || inUse(c)} onClick={() => void use(c)}>{inUse(c) ? 'Used by this lobby' : 'Use for this lobby'}</button>
                : <button className="btn quiet small" onClick={() => setPick(c.key)}>Preview</button>}
            </div>
          </article>
        ))}
        <p className="faint t-xs hx-hint">Each one covers the game&rsquo;s HUD only. The game&rsquo;s own minimap and compass stay as they are.{lobby ? '' : ' Choose a lobby in Events to use one.'}</p>
      </div>
      <div className="hx-right">
        <div className="hx-prev-head">
          <div><span className="cap">Preview · {hasBrand ? 'your brand applied' : 'the HUD’s own colours'}</span><h3>{card.name}{ev ? <> <span className="muted">on {ev.name}</span></> : null}</h3></div>
          <div className="seg" role="group" aria-label="Moment">
            <button aria-pressed={moment === 'elim'} onClick={() => setMoment('elim')}>Team eliminated</button>
            <button aria-pressed={moment === 'none'} onClick={() => setMoment('none')}>No moment</button>
          </div>
        </div>
        <Preview key={`${card.key}-${moment}-${kit.primary}-${kit.panel}`} src={url(card, { ...brandQ, ...(moment === 'none' ? { moment: 'none' } : {}) })} label={card.name} />
        <div className="hx-brand">
          {hasBrand ? (
            <div className="hx-bsw"><span className="cap">Brand</span>
              <span className="hx-s"><i style={{ background: kit.primary }} />Primary <code>{kit.primary}</code></span>
              <span className="hx-s"><i style={{ background: kit.panel }} />Panel <code>{kit.panel}</code></span>
              <span className="hx-s"><i className="hx-sl">{logo ? <img src={`http://127.0.0.1:${s.engine.port}${logo}`} alt="" /> : null}</i>Logo <code>{logo ? logo.split('/').pop()!.slice(0, 14) : 'none yet'}</code></span>
            </div>
          ) : <span className="muted t-sm">Choose a lobby of an event to see its brand on the HUD.</span>}
          <span className="faint t-xs">{ev ? `From Events › ${ev.name} › Branding` : ''}</span>
        </div>
        <div className="hx-copy">
          <button className="btn small" onClick={() => openTemplateEditor({ graphic: 'brhud', layout: card.layout, ...(card.templateId ? { from: s.templates.find((t) => t.id === card.templateId) } : {}) })}>Make a copy to edit</button>
          <p className="muted t-xs">Built-in templates stay as they are; your copy opens in Graphics studio: colours, fonts, logos.</p>
        </div>
      </div>
    </div>
  );
}

function FullScreens({ s, lobby }: { s: Snapshot; lobby: Snapshot['lobbies'][number] | null }) {
  const [selected, setSelected] = useState<string>(LIST[0]![0]);
  const src = templatePreviewUrl(s, `${selected}|full`);
  return (
    <div className="pack-body hx-screens">
      <div className="pack-list">
        <div role="listbox" aria-label="Graphics">
          {LIST.map(([id, title]) => (
            <button key={id} role="option" aria-selected={selected === id} onClick={() => setSelected(id)}>
              <span>{title}</span><span className="faint t-xs">{BR_SCREEN_PHASE[id as BrScreen] === 'pre' ? 'Before a match' : 'After a match'}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="pack-stage">
        <Preview key={src} src={src} label={BR_SCREEN_NAME[selected as BrScreen]} />
        <span className="faint t-xs">Sample lobby with made-up teams. Kit pictures appear once the event&rsquo;s game licence is confirmed in Graphics studio › Game assets.</span>
      </div>
      <aside className="pack-details">
        <b className="title-sm">{BR_SCREEN_NAME[selected as BrScreen]}</b>
        <span className="muted t-sm">{BR_SCREEN_WHAT[selected as BrScreen]}</span>
        <dl className="pack-facts">
          <dt>When</dt><dd>{BR_SCREEN_PHASE[selected as BrScreen] === 'pre' ? 'Before a match' : 'After a match'}</dd>
          <dt>In OBS</dt><dd>The full-screen source</dd>
          <dt>With</dt><dd>{lobby ? lobby.title : 'Sample teams'}</dd>
          <dt>Theme</dt><dd>{BR_THEME_NAME[lobby?.look?.theme?.preset ?? 'sky']}{lobby?.look?.theme?.colors && Object.keys(lobby.look.theme.colors).length ? ' · own colours' : ''}</dd>
        </dl>
        <span className="spacer" />
        <span className="faint t-xs">Put it on air from Live. Colours, background, emblem and props: Graphics studio › Event theme.</span>
      </aside>
    </div>
  );
}
