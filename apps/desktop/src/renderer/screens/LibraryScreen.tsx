import { useEffect, useState } from 'react';
import { BANNER_THEMES, type BannerTheme, type Snapshot } from '../../shared/api.ts';
import { LIBRARY, inShow } from '../../shared/library.ts';
import { PackWindow } from '../components/PackWindow.tsx';
import { air } from '../bridge.ts';
import { Preview, overlayUrl } from '../components/Preview.tsx';
import type { PageProps, Run } from '../App.tsx';
import { PageHeader } from '../components/Chrome.tsx';
import { GRAPHICS, graphicTitle, type BrandKit, type Template } from '../../shared/templates.ts';
import { brandOfMatch, openTemplateEditor, templatePreviewUrl } from '../components/TemplateEditor.tsx';
import { OwnGraphicEditor, blankOwn } from '../components/OwnGraphicEditor.tsx';
import { OWN_PURPOSES, ownScreenId, type OwnGraphic } from '../../shared/own-graphics.ts';
import { defaultSection } from '../../shared/autopilot.ts';

/** A live thumbnail of a graphic with a template (or its default look). */
export function TemplateThumb({ s, graphic, template, label, brand: kit }: { s: Snapshot; graphic: string; template: Template | null; label: string; brand?: BrandKit }) {
  const brand = kit ?? brandOfMatch(s);
  const extra: Record<string, string> = { ...(graphic.endsWith('|full') ? {} : { bg: '1' }), ...(template ? { template: JSON.stringify(template) } : {}), ...(brand ? { brand: JSON.stringify(brand) } : {}) };
  return <Preview src={templatePreviewUrl(s, graphic, extra)} label={label} backdrop={false} />;
}

const SCENE = (g: string) => g.startsWith('holding|') || g.startsWith('casters|');
const GROUPS: Array<[string, string, (g: string) => boolean]> = [
  ['band', 'Over the game', (g) => g.endsWith('|band') && !SCENE(g)],
  ['full', 'Full screen', (g) => g.endsWith('|full') && !SCENE(g)],
  ['scene', 'Scene screens', SCENE],
  ['hud', 'In-game HUD', (g) => g === 'hud'],
];

/** Graphics › Templates: your saved looks by graphic, the built-in looks to start from, and New template. */
/** Graphics › Your graphics: designs from Photoshop with data boxes (approved mock, 14 Nov). */
function OwnTab({ s, run }: { s: Snapshot; run: Run }) {
  const [editing, setEditing] = useState<OwnGraphic | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const purpose = (id: string) => OWN_PURPOSES.find(([p]) => p === id)?.[1] ?? id;
  const inRundown = (id: string) => s.rundown.some((r) => r.show === ownScreenId(id));
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="between">
        <p className="muted t-sm" style={{ maxWidth: '72ch' }}>Design in Photoshop as you do now, export the finished graphic as a PNG, and place data boxes where the names, scores and stats go. Air fills them from the game, Esportra and what you keep in Air, and plays them like any built-in screen.</p>
        <button className="btn primary" onClick={() => setEditing(blankOwn())}>+ Import a design</button>
      </div>
      {s.ownGraphics.length === 0
        ? <div className="empty own-empty"><b>No graphics of your own yet</b><span className="muted t-sm">Import a 1920 × 1080 PNG to start.</span></div>
        : <div className="tpl-grid">
            {s.ownGraphics.map((g) => (
              <div key={g.id} className="card tpl-card">
                <Preview src={overlayUrl(s, 'own', { own: g.id })} label={g.name} />
                <div className="tpl-meta">
                  <span className="between"><b>{g.name}</b>{inRundown(g.id) && <span className="tally ready">In this match</span>}</span>
                  <span className="faint t-xs">{purpose(g.purpose)} · {g.boxes.length} box{g.boxes.length === 1 ? '' : 'es'}</span>
                  <span className="row-gap" style={{ flexWrap: 'wrap' }}>
                    <button className="btn small" onClick={() => setEditing(g)}>Edit</button>
                    {s.match && <button className="btn small" disabled={inRundown(g.id)} onClick={() => void run(() => air.rundownSave({ section: g.purpose === 'any' ? 'between' : defaultSection(g.purpose), show: ownScreenId(g.id), trigger: 'manual', map: 'every', forSeconds: 0, delaySeconds: 12, transition: 'stinger', holdMode: 'manual', holdSeconds: 0 }))}>Use in this match</button>}
                    {sure === g.id
                      ? <><button className="btn small danger-solid" onClick={() => { setSure(null); void run(() => air.ownDelete(g.id)); }}>Delete</button><button className="btn quiet small" onClick={() => setSure(null)}>Keep</button></>
                      : <button className="btn quiet small danger" onClick={() => setSure(g.id)}>Delete</button>}
                  </span>
                </div>
              </div>
            ))}
          </div>}
      {editing && <OwnGraphicEditor s={s} run={run} start={editing} close={() => setEditing(null)} />}
    </div>
  );
}

function TemplatesTab({ s }: { s: Snapshot }) {
  const [graphic, setGraphic] = useState('map-veto|band');
  const [show, setShow] = useState<'all' | 'builtin' | 'yours'>('all');
  const uses = (id: string) => s.templateUse?.[id] ?? 0;
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="between">
        <p className="muted t-sm" style={{ maxWidth: '72ch' }}>Make your own look for any graphic: move, resize, recolour and re-font its parts, then pick the template in a match's Rundown. Colours can follow the event's brand kit (Events › Branding).</p>
        <span className="row g-2">
          <div className="seg" role="group" aria-label="Show templates">
            {([['all', 'All'], ['builtin', 'Built in'], ['yours', 'Yours']] as const).map(([v, l]) => <button key={v} aria-pressed={show === v} onClick={() => setShow(v)}>{l}</button>)}
          </div>
          <select className="cell" aria-label="Graphic for a new template" value={graphic} onChange={(e) => setGraphic(e.target.value)}>
            {GROUPS.map(([k, label, fits]) => <optgroup key={k} label={label}>{Object.keys(GRAPHICS).filter(fits).map((g) => <option key={g} value={g}>{GRAPHICS[g]!.title}</option>)}</optgroup>)}
          </select>
          <button className="btn primary" onClick={() => openTemplateEditor({ graphic })}>+ New template</button>
        </span>
      </div>
      {GROUPS.map(([k, label, fits]) => {
        const mine = show === 'builtin' ? [] : s.templates.filter((t) => fits(t.graphic));
        const builtin = show === 'yours' ? [] : Object.keys(GRAPHICS).filter(fits);
        return (
          <section key={k} className="stack g-2" aria-label={label}>
            <span className="cap">{label}</span>
            <div className="tpl-grid">
              {mine.map((t) => (
                <div key={t.id} className="card tpl-card">
                  <TemplateThumb s={s} graphic={t.graphic} template={t} label={t.name} />
                  <div className="tpl-meta">
                    <span className="between"><b>{t.name}</b>{uses(t.id) > 0 && <span className="tally ready">Used in {uses(t.id)} {uses(t.id) === 1 ? 'match' : 'matches'}</span>}</span>
                    <span className="faint t-xs">{GRAPHICS[t.graphic]?.title} · {new Date(t.updatedAt).toLocaleDateString()}</span>
                    <span className="row g-1"><button className="btn small" onClick={() => openTemplateEditor({ id: t.id })}>Edit</button><button className="btn quiet small" onClick={() => openTemplateEditor({ from: t })}>Duplicate</button></span>
                  </div>
                </div>
              ))}
              {builtin.map((g) => (
                <div key={g} className="card tpl-card builtin">
                  <TemplateThumb s={s} graphic={g} template={null} label={`${GRAPHICS[g]!.title}, built in`} />
                  <div className="tpl-meta">
                    <span className="between"><b>{GRAPHICS[g]!.title}</b><span className="tally off">Built in</span></span>
                    <span className="faint t-xs">{k === 'hud' ? 'Every in-game part' : label}</span>
                    <span className="row g-1"><button className="btn small" aria-label={`Start from this: ${graphicTitle(g)}`} onClick={() => openTemplateEditor({ graphic: g })}>Start from this</button></span>
                  </div>
                </div>
              ))}
              {mine.length + builtin.length === 0 && <p className="muted t-sm tpl-empty">No templates yet. Choose a graphic above and press New template, or start from a built-in look.</p>}
            </div>
          </section>
        );
      })}
      <p className="faint t-xs">Built-in looks never change. A template only changes how parts look; the data still comes from the match.</p>
    </div>
  );
}

const THEME_NOTES: Record<BannerTheme, string> = {
  broadcast: 'Full-width banners. The default.',
  compact: 'Smaller banners that cover less of the game.',
  monument: 'Large centred banners for big moments.',
  impact: 'Bold, high-contrast banners.',
};

/** The four banner styles side by side, each showing the same moment. */
export function BannerStyles({ s, value, onPick }: { s: Snapshot; value: BannerTheme; onPick: (t: BannerTheme) => void }) {
  return (
    <div className="styles-grid" role="radiogroup" aria-label="Banner style">
      {BANNER_THEMES.map((t) => (
        <button key={t} type="button" role="radio" aria-checked={value === t} className="style-card" onClick={() => onPick(t)}>
          <Preview src={overlayUrl(s, 'banners', { hudSettings: JSON.stringify({ bannerTheme: t }) })} label={`${t} banner style`} />
          <span className="style-meta"><b>{t[0]!.toUpperCase() + t.slice(1)}</b><span className="muted">{THEME_NOTES[t]}</span></span>
        </button>
      ))}
    </div>
  );
}

export function LibraryScreen({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'library' | 'templates' | 'own'>('library');
  const game = s.game;
  const items = LIBRARY[game?.id ?? 'valorant'];
  const chosen = items.filter((i) => inShow(s.setup, i)).length;
  const theme = s.match?.theme ?? s.setup.package;
  // The sample room follows the selected match's teams, players and banner style.
  useEffect(() => { void run(() => air.librarySeed()); }, [s.match?.id, theme, s.match?.teams.map((t) => t.name + t.logo + t.color).join()]);
  return (
    <div className="stack" style={{ gap: 26 }}>
      <PageHeader eyebrow={`Library · ${game?.name ?? 'no game chosen'}`} title={tab === 'library' ? 'Graphics packs' : tab === 'own' ? 'Your graphics' : 'Templates'}>
        {tab === 'own' ? 'Your own designs from Photoshop, filled with live data from the game, Esportra and Air.' : tab === 'library' ? <>Every graphic Air can put on air, live {s.match ? <>with <b>{s.match.teams[0].name}</b> and <b>{s.match.teams[1].name}</b></> : 'with sample teams'}. Open a pack to choose what is in your show.</> : 'Your own looks for the graphics, used by the Rundown.'}
      </PageHeader>
      <div className="seg tabs-seg" role="tablist" aria-label="Graphics">
        <button role="tab" aria-selected={tab === 'library'} aria-pressed={tab === 'library'} onClick={() => setTab('library')}>Library</button>
        <button role="tab" aria-selected={tab === 'templates'} aria-pressed={tab === 'templates'} onClick={() => setTab('templates')}>Templates{s.templates.length ? ` · ${s.templates.length}` : ''}</button>
        <button role="tab" aria-selected={tab === 'own'} aria-pressed={tab === 'own'} onClick={() => setTab('own')}>Your graphics{s.ownGraphics.length ? ` · ${s.ownGraphics.length}` : ''}</button>
      </div>
      {tab === 'own' ? <OwnTab s={s} run={run} /> : tab === 'templates' ? <TemplatesTab s={s} /> : <>
      <div className="packs">
        <button className="pack-card" onClick={() => setOpen(true)} aria-label={`Open ${game?.pack ?? 'the'} pack`}>
          <Preview src={overlayUrl(s, 'ingame')} label={`${game?.pack ?? 'Graphics'} pack`} />
          <span className="between"><span><b>{game?.pack ?? 'Graphics'}</b><br /><span className="muted t-sm">{items.length} graphics · {chosen} in the show</span></span><span className="state ok"><i className="dot ok" />In use</span></span>
        </button>
        <div className="pack-card soon" aria-hidden="true">
          <div className="pv pv-bg pack-soon"><span className="muted t-sm">More packs later</span></div>
          <span><b>Other packs</b><br /><span className="muted t-sm">Not available yet</span></span>
        </div>
      </div>
      <section className="stack" style={{ gap: 10 }}>
        <div className="between"><h2 className="title-sm">Banner style</h2><span className="muted t-sm">{s.match ? `Used by ${s.match.title}` : 'Choose a match to set its style'}</span></div>
        <BannerStyles s={s} value={theme} onPick={(t) => s.match && void run(() => air.updateMatch(s.match!.id, { theme: t }))} />
      </section>
      </>}
      {open && <PackWindow s={s} run={run} close={() => setOpen(false)} />}
    </div>
  );
}
