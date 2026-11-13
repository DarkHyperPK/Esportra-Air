// An event's Branding (logo, accent, stages) and Talent and sponsors tabs (approved mock, 12 Nov):
// what every match of the event uses. Matches switch individual people and sponsors off.
import { useEffect, useState } from 'react';
import { ROLE_NAME, TIER_NAME, rotationShare, type EventInfo, type Sponsor, type Talent } from '../../shared/model.ts';
import { air } from '../bridge.ts';
import type { PageProps } from '../App.tsx';
import { PersonEditor, SponsorEditor, cameraText } from '../components/Editors.tsx';
import { ImagePick, imageUrl } from '../components/MatchEditors.tsx';

const shareText = (x: number) => (x >= 0.5 ? 'Half the slots or more' : x >= 0.3 ? 'About a third' : x >= 0.2 ? 'About a fifth' : 'A small share');

/** The event's identity: logo on dark and light, accent colour, name and stages. */
export function EventBranding({ s, run, event }: Pick<PageProps, 's' | 'run'> & { event: EventInfo }) {
  const [form, setForm] = useState({ name: event.name, stages: event.stages.join(', '), accent: event.accent });
  useEffect(() => { setForm({ name: event.name, stages: event.stages.join(', '), accent: event.accent }); }, [event.id, event.name, event.stages.join(), event.accent]);
  const dirty = form.name !== event.name || form.stages !== event.stages.join(', ') || form.accent !== event.accent;
  return (
    <section className="stack" style={{ gap: 14, maxWidth: 640 }}>
      <div className="row-gap" style={{ gap: 22, alignItems: 'flex-end' }}>
        <div className="stack center-x" style={{ gap: 6 }}><ImagePick s={s} value={event.logo} size={64} label="event logo on dark" onChange={(v) => void run(() => air.updateEvent(event.id, { logo: v }))} fallback="Logo" /><span className="faint t-xs">On dark</span></div>
        <div className="stack center-x light-swatch" style={{ gap: 6 }}><ImagePick s={s} value={event.logoLight} size={64} label="event logo on light" onChange={(v) => void run(() => air.updateEvent(event.id, { logoLight: v }))} fallback="Logo" /><span className="faint t-xs">On light</span></div>
        <label className="stack" style={{ gap: 6 }}><span className="row-gap"><input type="color" aria-label="Accent colour" value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} className="swatch" /><span className="mono t-xs">{form.accent.toUpperCase()}</span></span><span className="faint t-xs">Accent</span></label>
      </div>
      <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); void run(() => air.updateEvent(event.id, { name: form.name, accent: form.accent, stages: form.stages.split(',').map((x) => x.trim()).filter(Boolean) })); }}>
        <label className="field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} /></label>
        <label className="field"><span>Stages</span><input value={form.stages} onChange={(e) => setForm({ ...form, stages: e.target.value })} placeholder="Groups, Playoffs, Grand final" /></label>
        <div className="row-gap"><button className="btn primary" disabled={!dirty}>Save</button><span className="faint t-xs">{event.tournamentId ? 'From Esportra. Changes here only affect what goes on air.' : 'Used by every match of this event.'}</span></div>
      </form>
    </section>
  );
}

/** The people on air and the sponsors every match of the event uses (a match can switch any off). */
export function EventTalent({ s, run, event }: Pick<PageProps, 's' | 'run'> & { event: EventInfo }) {
  const [person, setPerson] = useState<Talent | 'new' | null>(null);
  const [sponsor, setSponsor] = useState<Sponsor | 'new' | null>(null);
  const share = rotationShare(event.sponsors);
  return (
    <div className="event-cols">
      <section className="stack" style={{ gap: 8 }}>
        <div className="between"><h2 className="title-sm">People on air</h2><button className="btn small" onClick={() => setPerson('new')}>Add person</button></div>
        <div className="lst">
          {event.talent.length === 0 && <p className="muted li">Nobody yet. Add your host, casters and analysts.</p>}
          {event.talent.map((t) => {
            const cam = cameraText(t);
            return (
              <div className="li talent-row" key={t.id}>
                {t.photo ? <img className="portrait" src={imageUrl(s, t.photo)} alt="" /> : <span className="portrait initials">{t.name.slice(0, 1)}</span>}
                <span><b>{t.name}</b><br /><span className="muted t-sm">{ROLE_NAME[t.role]}{t.handle ? ` · ${t.handle}` : ''}</span></span>
                <span className={`state ${cam.health}`}><i className={`dot ${cam.health}`} />{cam.text}</span>
                <button className="btn quiet small" onClick={() => setPerson(t)}>Edit</button>
              </div>
            );
          })}
        </div>
      </section>
      <section className="stack" style={{ gap: 8 }}>
        <div className="between"><h2 className="title-sm">Sponsors</h2><button className="btn small" onClick={() => setSponsor('new')}>Add sponsor</button></div>
        <div className="lst">
          {event.sponsors.length === 0 && <p className="muted li">No sponsors yet.</p>}
          {event.sponsors.map((x) => (
            <div className="li sponsor-row" key={x.id}>
              {x.logo ? <img className="spon-logo" src={imageUrl(s, x.logo)} alt="" /> : <b className="spon-name">{x.name}</b>}
              <span className="muted t-sm">{TIER_NAME[x.tier]}{x.logo ? ` · ${x.name}` : ''}</span>
              <span className="faint t-xs">{x.video ? 'Video loop' : 'Logo only'}</span>
              <span className="faint t-xs">{shareText(share[x.id] ?? 0)}</span>
              <button className="btn quiet small" onClick={() => setSponsor(x)}>Edit</button>
            </div>
          ))}
        </div>
      </section>
      {person && <PersonEditor s={s} run={run} event={event} person={person === 'new' ? null : event.talent.find((t) => t.id === person.id) ?? person} close={() => setPerson(null)} />}
      {sponsor && <SponsorEditor s={s} run={run} event={event} sponsor={sponsor === 'new' ? null : sponsor} close={() => setSponsor(null)} />}
    </div>
  );
}

/** An event's logo, or a plain square when it has none. */
export function EventLogo({ s, path, size }: { s: PageProps['s']; path: string; size: number }) {
  return path
    ? <img src={imageUrl(s, path)} alt="" style={{ width: size, height: size, objectFit: 'contain', flex: 'none' }} />
    : <span aria-hidden="true" className="event-logo-blank" style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size / 4.5)) }}>LOGO</span>;
}
