// The look of a Rundown row (approved mock, 13 Nov): the built-in looks and your templates for that
// graphic, as live thumbnails. Picking needs no editing; New template opens the editor on this graphic.
import type { Snapshot } from '../../shared/api.ts';
import { BAND_SCREENS } from '../../shared/look.ts';
import { GRAPHICS, graphicStyle, templatesFor, type Template } from '../../shared/templates.ts';
import { TemplateThumb } from '../screens/LibraryScreen.tsx';
import { openTemplateEditor } from './TemplateEditor.tsx';

export type Look = { style: 'full' | 'band'; template?: string };

/** The looks a screen can have: Full screen, Over the game (where it has one) and your templates. */
export function looksFor(s: Snapshot, screen: string): Array<{ key: string; name: string; note: string; graphic: string; look: Look; template: Template | null }> {
  const out: Array<{ key: string; name: string; note: string; graphic: string; look: Look; template: Template | null }> = [];
  if (screen === 'in-game') {
    out.push({ key: 'hud', name: 'Default HUD', note: 'Built in', graphic: 'hud', look: { style: 'full' }, template: null });
    for (const t of s.templates.filter((x) => x.graphic === 'hud')) out.push({ key: t.id, name: t.name, note: 'Yours', graphic: 'hud', look: { style: 'full', template: t.id }, template: t });
    return out;
  }
  if (GRAPHICS[`${screen}|full`]) out.push({ key: 'full', name: 'Default full screen', note: 'Built in', graphic: `${screen}|full`, look: { style: 'full' }, template: null });
  if (BAND_SCREENS.has(screen) && GRAPHICS[`${screen}|band`]) out.push({ key: 'band', name: 'Default over the game', note: 'Built in', graphic: `${screen}|band`, look: { style: 'band' }, template: null });
  for (const t of templatesFor(s.templates, screen)) out.push({ key: t.id, name: t.name, note: `Yours · ${graphicStyle(t.graphic) === 'band' ? 'Over the game' : 'Full screen'}`, graphic: t.graphic, look: { style: graphicStyle(t.graphic), template: t.id }, template: t });
  return out;
}

export function LookPicker({ s, screen, value, onPick, label = 'Look' }: { s: Snapshot; screen: string; value: Look; onPick: (look: Look) => void; label?: string }) {
  const looks = looksFor(s, screen);
  if (!looks.length) return null;
  const current = looks.find((l) => (value.template ? l.look.template === value.template : !l.look.template && l.look.style === value.style)) ?? looks[0]!;
  const newGraphic = screen === 'in-game' ? 'hud' : BAND_SCREENS.has(screen) ? `${screen}|band` : `${screen}|full`;
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
