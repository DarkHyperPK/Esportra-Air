// The look of a Rundown row (approved mock, 13 Nov): the built-in looks and your templates for that
// graphic, as live thumbnails. Picking needs no editing; New template opens the editor on this graphic.
import type { Snapshot } from '../../shared/api.ts';
import { BAND_SCREENS } from '../../shared/look.ts';
import { GRAPHICS, graphicStyle, templatesFor, type Template } from '../../shared/templates.ts';
import { TemplateThumb } from '../screens/LibraryScreen.tsx';
import { openTemplateEditor } from './TemplateEditor.tsx';

export type Look = { style: 'full' | 'band'; template?: string };

/** The looks a screen can have: Full screen, Overlay bar (where it has one) and your templates. */
export function looksFor(s: Snapshot, screen: string): Array<{ key: string; name: string; note: string; graphic: string; look: Look; template: Template | null }> {
  const out: Array<{ key: string; name: string; note: string; graphic: string; look: Look; template: Template | null }> = [];
  if (screen === 'in-game') {
    out.push({ key: 'hud', name: 'Default HUD', note: 'Built in', graphic: 'hud', look: { style: 'full' }, template: null });
    for (const t of s.templates.filter((x) => x.graphic === 'hud')) out.push({ key: t.id, name: t.name, note: 'Yours', graphic: 'hud', look: { style: 'full', template: t.id }, template: t });
    return out;
  }
  // Break's two looks are the classic screen and the frame; the Desk has one.
  const names = screen === 'holding' ? ['Default classic', 'Default frame', 'Classic', 'Frame'] : screen === 'casters' ? ['Default desk', '', 'Desk', ''] : ['Default full screen', 'Default overlay bar', 'Full screen', 'Overlay bar'];
  if (GRAPHICS[`${screen}|full`]) out.push({ key: 'full', name: names[0]!, note: 'Built in', graphic: `${screen}|full`, look: { style: 'full' }, template: null });
  if ((BAND_SCREENS.has(screen) || screen === 'holding') && GRAPHICS[`${screen}|band`]) out.push({ key: 'band', name: names[1]!, note: screen === 'holding' ? 'Built in · two windows' : 'Built in', graphic: `${screen}|band`, look: { style: 'band' }, template: null });
  for (const t of templatesFor(s.templates, screen)) out.push({ key: t.id, name: t.name, note: `Yours · ${graphicStyle(t.graphic) === 'band' ? names[3] : names[2]}`, graphic: t.graphic, look: { style: graphicStyle(t.graphic), template: t.id }, template: t });
  return out;
}

export function LookPicker({ s, screen, value, onPick, label = 'Look' }: { s: Snapshot; screen: string; value: Look; onPick: (look: Look) => void; label?: string }) {
  const looks = looksFor(s, screen);
  if (!looks.length) return null;
  const current = looks.find((l) => (value.template ? l.look.template === value.template : !l.look.template && l.look.style === value.style)) ?? looks[0]!;
  const newGraphic = screen === 'in-game' ? 'hud' : value.style === 'band' && GRAPHICS[`${screen}|band`] ? `${screen}|band` : BAND_SCREENS.has(screen) ? `${screen}|band` : `${screen}|full`;
  return (
    <div className="look-pick" role="radiogroup" aria-label={label}>
      {looks.map((l) => (
        <button key={l.key} type="button" role="radio" aria-checked={current.key === l.key} className={`look-opt ${screen === 'in-game' ? 'wide' : ''}`} onClick={() => onPick(l.look)}>
          <TemplateThumb s={s} graphic={l.graphic} template={l.template} label={l.name} />
          <span className="look-meta"><b>{l.name}</b><span className="faint t-2xs">{l.note}</span></span>
        </button>
      ))}
      <button type="button" className="look-opt add" onClick={() => openTemplateEditor({ graphic: newGraphic })}><span>+ New template</span><span className="faint t-2xs">Opens the editor</span></button>
      {current.template && <button type="button" className="btn quiet small look-edit" onClick={() => openTemplateEditor({ id: current.template!.id })}>Edit “{current.name}”</button>}
    </div>
  );
}

/** The pack window's Looks strip: a graphic's built-in looks and your templates, each to start from or edit. */
export function LooksStrip({ s, screen }: { s: Snapshot; screen: string }) {
  const looks = looksFor(s, screen);
  if (!looks.length) return null;
  return (
    <section className="stack g-1" aria-label="Looks">
      <span className="cap">Looks</span>
      <div className="look-pick strip">
        {looks.map((l) => (
          <div key={l.key} className="look-opt">
            <TemplateThumb s={s} graphic={l.graphic} template={l.template} label={l.name} />
            <span className="look-meta"><b>{l.name}</b><span className="faint t-2xs">{l.note}{l.template && (s.templateUse?.[l.template.id] ?? 0) > 0 ? ` · used in ${s.templateUse[l.template.id]}` : ''}</span>
              <button type="button" className="btn quiet small" onClick={() => openTemplateEditor(l.template ? { id: l.template.id } : { graphic: l.graphic })}>{l.template ? 'Edit' : 'Start from this'}</button></span>
          </div>
        ))}
        <button type="button" className="look-opt add" onClick={() => openTemplateEditor({ graphic: looks[looks.length > 1 && looks[1]!.look.style === 'band' ? 1 : 0]!.graphic })}><span>+ New template</span></button>
      </div>
    </section>
  );
}
