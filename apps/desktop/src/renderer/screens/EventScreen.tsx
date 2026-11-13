// An event's Branding (logo, accent, stages) and Talent and sponsors tabs (approved mock, 12 Nov):
// what every match of the event uses. Matches switch individual people and sponsors off.
import { useEffect, useState } from 'react';
import { ROLE_NAME, TIER_NAME, rotationShare, type EventInfo, type Sponsor, type Talent } from '../../shared/model.ts';
import { air } from '../bridge.ts';
import type { PageProps } from '../App.tsx';
import { PersonEditor, SponsorEditor, cameraText } from '../components/Editors.tsx';
import { ImagePick, imageUrl } from '../components/MatchEditors.tsx';
import { BRAND_KEYS, BRAND_NAME, DEFAULT_BRAND, type BrandKit } from '../../shared/templates.ts';
import { TemplateThumb } from './LibraryScreen.tsx';

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
      </div>
      <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); void run(() => air.updateEvent(event.id, { name: form.name, accent: form.accent, stages: form.stages.split(',').map((x) => x.trim()).filter(Boolean) })); }}>
        <label className="field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} /></label>
        <label className="field"><span>Stages</span><input value={form.stages} onChange={(e) => setForm({ ...form, stages: e.target.value })} placeholder="Groups, Playoffs, Grand final" /></label>
        <div className="row-gap"><button className="btn primary" disabled={!dirty}>Save</button><span className="faint t-xs">{event.tournamentId ? 'From Esportra. Changes here only affect what goes on air.' : 'Used by every match of this event.'}</span></div>
      </form>
      <BrandKitEditor s={s} run={run} event={event} />
    </section>
  );
}

/** The event's brand kit: every graphic and template reads these colours (Primary is the event colour). */
function BrandKitEditor({ s, run, event }: Pick<PageProps, 's' | 'run'> & { event: EventInfo }) {
  const saved: BrandKit = { ...DEFAULT_BRAND, ...(event.brand ?? {}), primary: event.accent };
  const [kit, setKit] = useState<BrandKit>(saved);
  useEffect(() => { setKit(saved); }, [event.id, JSON.stringify(saved)]);
  const dirty = JSON.stringify(kit) !== JSON.stringify(saved);
  return (
    <section className="stack" style={{ gap: 12, marginTop: 10 }} aria-label="Brand kit">
      <div><h3 className="title-sm">Brand kit</h3><p className="muted t-sm">Every graphic and every template reads these colours, so one template looks right at any event. Attack and Defence colour the scorebug's sides.</p></div>
      <div className="kit-grid">
        {BRAND_KEYS.map((k) => (
          <label key={k} className="card kit-sw">
            <input type="color" aria-label={`${BRAND_NAME[k]} colour`} value={kit[k]} onChange={(e) => setKit({ ...kit, [k]: e.target.value })} />
            <span><b>{BRAND_NAME[k]}{k === 'primary' ? ' · event colour' : ''}</b><span className="mono t-xs faint">{kit[k].toUpperCase()}</span></span>
          </label>
        ))}
      </div>
      <div className="kit-pv"><TemplateThumb key={`sb-${JSON.stringify(kit)}`} s={s} brand={kit} graphic="hud" template={null} label="In-game HUD with this kit" /><TemplateThumb key={`vt-${JSON.stringify(kit)}`} s={s} brand={kit} graphic="map-veto|band" template={null} label="Map veto with this kit" /></div>
      <div className="row-gap">
        <button className="btn primary" disabled={!dirty} onClick={() => void run(() => air.brandSave(event.id, kit))}>Save kit</button>
        <button className="btn quiet" disabled={!dirty} onClick={() => setKit(saved)}>Undo changes</button>
        <button className="btn quiet" onClick={() => setKit({ ...DEFAULT_BRAND, primary: kit.primary })}>Default colours</button>
        {s.events.filter((e) => e.id !== event.id).length > 0 && (
          <select className="cell" aria-label="Copy the kit from another event" value="" onChange={(e) => { const from = s.events.find((x) => x.id === e.target.value); if (from) setKit({ ...DEFAULT_BRAND, ...(from.brand ?? {}), primary: from.accent }); }}>
            <option value="">Copy from another event…</option>
            {s.events.filter((e) => e.id !== event.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
      </div>
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
/** The event's logo; without one, its initials on its colour (or an empty LOGO box when it has no name yet). */
export function EventLogo({ s, path, size, name, accent }: { s: PageProps['s']; path: string; size: number; name?: string; accent?: string }) {
  if (path) return <img src={imageUrl(s, path)} alt="" style={{ width: size, height: size, objectFit: 'contain', flex: 'none' }} />;
  const initials = (name ?? '').split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  if (initials) {
    const c = accent || '#6d7bff';
    return <span aria-hidden="true" className="event-initials" style={{ width: size, height: size, fontSize: Math.round(size * 0.34), background: `linear-gradient(135deg, ${c}, color-mix(in srgb, ${c} 60%, #000))` }}>{initials}</span>;
  }
  return <span aria-hidden="true" className="event-logo-blank" style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size / 4.5)) }}>LOGO</span>;
}
