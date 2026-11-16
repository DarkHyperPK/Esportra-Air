// Show templates (approved mock, 16 Nov): a whole show to start a match from. The picker in New match,
// and the list in HUD library where a template is applied to the selected match, saved, copied or removed.
import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import type { ShowTemplateView } from '../../shared/show-templates.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';

const THEME: Record<string, string> = { broadcast: 'Broadcast', compact: 'Compact', monument: 'Monument', impact: 'Impact' };
const PAUSE: Record<string, string> = { box: 'Box', panel: 'Panel', bar: 'Bar' };

function summary(t: ShowTemplateView) {
  const bars = t.screens.filter((x) => x.style === 'band').length;
  return `${t.screens.length} screen${t.screens.length === 1 ? '' : 's'}${bars ? ` · ${bars} overlay bar${bars === 1 ? '' : 's'}` : ''}`;
}

/** The templates as cards: choosing one sets the show. */
export function ShowTemplatePicker({ s, value, onPick }: { s: Snapshot; value: string | null; onPick: (id: string) => void }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="faint t-sm">Start from a show template</span>
      <div className="tpl-grid" role="radiogroup" aria-label="Show template">
        {s.showTemplates.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={value === t.id} className={`tpl-card ${value === t.id ? 'on' : ''}`} onClick={() => onPick(t.id)}>
            <b>{t.name}</b>
            <span className="faint t-xs">{t.builtIn ? 'Built in' : 'Yours'} · {summary(t)}</span>
            <span className="faint t-xs">{THEME[t.theme] ?? t.theme} banners · {PAUSE[t.pause] ?? t.pause} pause{t.hudLook ? ` · HUD: ${t.hudLook}` : ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** HUD library: the templates, the one shown in detail, and what can be done with it. */
export function ShowTemplateManager({ s, run }: { s: Snapshot; run: Run }) {
  const [sel, setSel] = useState<string>(s.showTemplateOf ?? s.showTemplates[0]?.id ?? '');
  const [naming, setNaming] = useState<null | { mode: 'save' | 'rename'; name: string }>(null);
  const t = s.showTemplates.find((x) => x.id === sel) ?? s.showTemplates[0];
  if (!t) return null;
  const inUse = s.showTemplateOf === t.id;
  const submit = async () => {
    if (!naming) return;
    const ok = naming.mode === 'save' ? await run(() => air.showTemplateSave({ name: naming.name })) : await run(() => air.showTemplateRename(t.id, naming.name));
    if (ok) setNaming(null);
  };
  return (
    <section className="stack" style={{ gap: 12 }} aria-label="Show templates">
      <div className="between">
        <h2 className="title-sm">Show templates</h2>
        {s.match && <button className="btn small" onClick={() => setNaming({ mode: 'save', name: '' })}>Save {s.match.title}’s show as a template…</button>}
      </div>
      <ShowTemplatePicker s={s} value={t.id} onPick={setSel} />
      <div className="card tpl-detail">
        <div className="card-head">
          <span><b>{t.name}</b> <span className="faint t-sm">{t.builtIn ? 'Built in' : 'Yours'}{t.uses ? ` · used by ${t.uses} match${t.uses === 1 ? '' : 'es'}` : ''}</span></span>
          <span className="row-gap">
            <button className="btn quiet small" onClick={() => void run(() => air.showTemplateDuplicate(t.id))}>Duplicate</button>
            {!t.builtIn && <button className="btn quiet small" onClick={() => setNaming({ mode: 'rename', name: t.name })}>Rename</button>}
            {!t.builtIn && <button className="btn quiet small" onClick={() => void run(() => air.showTemplateDelete(t.id)).then((ok) => ok && setSel(s.showTemplates[0]!.id))}>Delete</button>}
            <button className="btn primary small" disabled={!s.match || s.autopilot?.enabled} title={!s.match ? 'Choose a match first' : s.autopilot?.enabled ? 'Run manually first, then change the show' : undefined} onClick={() => void run(() => air.showTemplateApply(t.id))}>{inUse ? 'Use again in this match' : s.match ? `Use in ${s.match.title}` : 'Use in a match'}</button>
          </span>
        </div>
        {naming && (
          <form className="body-pad row-gap" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <input className="cell" autoFocus aria-label="Show template name" value={naming.name} maxLength={40} placeholder="Name, e.g. Finals" onChange={(e) => setNaming({ ...naming, name: e.target.value })} />
            <button className="btn small" disabled={!naming.name.trim()}>{naming.mode === 'save' ? 'Save' : 'Rename'}</button>
            <button type="button" className="btn quiet small" onClick={() => setNaming(null)}>Cancel</button>
          </form>
        )}
        <div className="tpl-rows body-pad">
          {t.screens.map((x) => (
            <div key={x.show} className="tpl-row"><span>{s.setup.screens.find((y) => y.id === x.show)?.title ?? x.show}</span><span className={`pill ${x.style === 'band' ? 'ok' : ''}`}>{x.style === 'band' ? 'Overlay bar' : 'Full screen'}</span><span className="faint t-xs">{x.look ?? 'Built-in look'}</span></div>
          ))}
          <div className="tpl-row faint t-sm"><span>Banner style</span><span>{THEME[t.theme] ?? t.theme}</span><span /></div>
          <div className="tpl-row faint t-sm"><span>HUD look</span><span>{t.hudLook ?? 'Built in'}</span><span /></div>
          <div className="tpl-row faint t-sm"><span>Pause</span><span>{PAUSE[t.pause] ?? t.pause}</span><span /></div>
        </div>
        <p className="faint t-xs body-pad" style={{ paddingTop: 0 }}>Using a template replaces the match’s Rundown, banner style and pause look. Fine-tune them in the match’s Rundown step.</p>
      </div>
    </section>
  );
}
