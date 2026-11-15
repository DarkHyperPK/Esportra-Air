// Side-drawer editors for one person, one sponsor or one player (approved mocks: person editor and
// player editor). Each edits a draft and saves with one press.
import { useState, type ReactNode } from 'react';
import type { PlayerInfo, Snapshot } from '../../shared/api.ts';
import { gameOf } from '../../shared/games.ts';
import { ROLE_NAME, SPACE_NAME, SPONSOR_SPACES, SPONSOR_TIERS, TALENT_ROLES, TIER_NAME, cameraLinkUrl, type CameraKind, type EventInfo, type Sponsor, type SponsorSpace, type Talent } from '../../shared/model.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { useEscape } from './Dialogs.tsx';
import { ImagePick } from './MatchEditors.tsx';

export function EditorDrawer({ title, close, children, footer }: { title: string; close: () => void; children: ReactNode; footer: ReactNode }) {
  const ref = useEscape(close);
  return (
    <div className="scrim right" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="editor" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header><h2 className="title-md">{title}</h2><button className="btn quiet small" onClick={close} aria-label="Close">Esc</button></header>
        <div className="editor-body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

/** A small segmented choice (camera kind, tier). */
export function Seg<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => <button type="button" key={v} aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)}>{text}</button>)}
    </div>
  );
}

export function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  return <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />;
}

/** How a person's camera is described in lists. */
export function cameraText(t: Talent): { text: string; health: 'ok' | 'warn' | 'off' } {
  if (t.camera.kind === 'obs') return { text: `OBS source · ${t.camera.obsSource}`, health: 'ok' };
  if (t.camera.kind === 'link') return { text: 'Camera link', health: 'ok' };
  return { text: 'No camera · photo shown', health: 'off' };
}

export function PersonEditor({ s, run, event, person, close }: { s: Snapshot; run: Run; event: EventInfo; person: Talent | null; close: () => void }) {
  const [draft, setDraft] = useState({ name: person?.name ?? '', role: person?.role ?? 'play-by-play', handle: person?.handle ?? '', photo: person?.photo ?? '' });
  const [kind, setKind] = useState<CameraKind>(person?.camera.kind ?? 'link');
  const [source, setSource] = useState(person?.camera.obsSource ?? '');
  const [copied, setCopied] = useState(false);
  const link = person?.camera.kind === 'link' && person.camera.linkId ? cameraLinkUrl(person.camera.linkId, person.name) : null;
  const save = async () => {
    const ok = await run(() => air.saveTalent(event.id, { ...(person ? { id: person.id } : {}), ...draft, camera: { kind, linkId: null, obsSource: kind === 'obs' ? source : null } }));
    if (ok) close();
  };
  return (
    <EditorDrawer
      title={person ? person.name : 'Add a person'} close={close}
      footer={<>
        {person ? <button className="btn quiet danger" onClick={async () => { if (await run(() => air.removeTalent(event.id, person.id))) close(); }}>Remove from event</button> : <span />}
        <span className="row-gap"><button className="btn quiet" onClick={close}>Cancel</button><button className="btn primary" disabled={!draft.name.trim() || (kind === 'obs' && !source.trim())} onClick={() => void save()}>Save</button></span>
      </>}
    >
      <div className="photo-frame">
        <ImagePick s={s} value={draft.photo} size={132} label={`photo of ${draft.name || 'this person'}`} onChange={(photo) => setDraft({ ...draft, photo })} fallback="Photo" />
        <span className="muted">Used on lower thirds, the desk, and whenever their camera is off. Keep the face inside the circle.</span>
      </div>
      <div className="grid2">
        <label className="field"><span>Name on air</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={40} /></label>
        <label className="field"><span>Role</span><select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Talent['role'] })}>{TALENT_ROLES.map((r) => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}</select></label>
        <label className="field" style={{ gridColumn: '1 / -1' }}><span>Handle</span><input value={draft.handle} onChange={(e) => setDraft({ ...draft, handle: e.target.value })} maxLength={40} placeholder="@handle" /></label>
      </div>
      <hr className="rule" />
      <div className="between"><h3 className="title-sm">Camera</h3><Seg label="Camera" value={kind} onChange={setKind} options={[['link', 'Camera link'], ['obs', 'OBS source'], ['none', 'None']]} /></div>
      {kind === 'link' && (link ? (
        <div className="stack" style={{ gap: 8 }}>
          <span className="muted">Send this link to {person!.name}. They open it in a browser and allow their camera. Nothing to install.</span>
          <div className="row-gap"><input className="cell mono" value={link} readOnly aria-label="Camera link" style={{ flex: 1, minWidth: 0 }} /><button className="btn small" onClick={() => { void air.copy(link); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button></div>
          <button className="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={() => void run(() => air.renewTalentLink(event.id, person!.id))}>Send a new link (the old one stops working)</button>
          <span className="faint t-xs">Video goes to your OBS. Esportra only connects the two and never records or keeps it.</span>
        </div>
      ) : <span className="muted">The link is made when you save.</span>)}
      {kind === 'obs' && (
        <label className="field"><span>OBS source</span>
          <input value={source} onChange={(e) => setSource(e.target.value)} list="obs-video-inputs" maxLength={120} placeholder="e.g. Desk cam 2" />
          <datalist id="obs-video-inputs">{s.obs.videoInputs.map((v) => <option key={v} value={v} />)}</datalist>
        </label>
      )}
      {kind === 'none' && <span className="muted">Their photo is shown wherever their camera would be.</span>}
    </EditorDrawer>
  );
}

export function SponsorEditor({ s, run, event, sponsor, close }: { s: Snapshot; run: Run; event: EventInfo; sponsor: Sponsor | null; close: () => void }) {
  const [d, setD] = useState({ name: sponsor?.name ?? '', tier: sponsor?.tier ?? 'partner', logo: sponsor?.logo ?? '', logoLight: sponsor?.logoLight ?? '', read: sponsor?.read ?? '', video: sponsor?.video ?? '', spaces: sponsor ? (sponsor.spaces ?? { rotator: { logo: '' } }) : { rotator: { logo: '' } } as NonNullable<Sponsor['spaces']> });
  const setSpace = (k: SponsorSpace, on: boolean, logo = '') => setD((x) => { const spaces = { ...x.spaces }; if (on) spaces[k] = { logo }; else delete spaces[k]; return { ...x, spaces }; });
  return (
    <EditorDrawer
      title={sponsor ? sponsor.name : 'Add a sponsor'} close={close}
      footer={<>
        {sponsor ? <button className="btn quiet danger" onClick={async () => { if (await run(() => air.removeSponsor(event.id, sponsor.id))) close(); }}>Remove from event</button> : <span />}
        <span className="row-gap"><button className="btn quiet" onClick={close}>Cancel</button><button className="btn primary" disabled={!d.name.trim()} onClick={async () => { if (await run(() => air.saveSponsor(event.id, { ...(sponsor ? { id: sponsor.id } : {}), ...d }))) close(); }}>Save</button></span>
      </>}
    >
      <div className="row-gap" style={{ alignItems: 'flex-end', gap: 22 }}>
        <div className="stack center-x" style={{ gap: 6 }}><ImagePick s={s} value={d.logo} size={88} label="logo on dark" onChange={(logo) => setD({ ...d, logo })} fallback="Logo" /><span className="faint t-xs">On dark</span></div>
        <div className="stack center-x light-swatch" style={{ gap: 6 }}><ImagePick s={s} value={d.logoLight} size={88} label="logo on light" onChange={(logoLight) => setD({ ...d, logoLight })} fallback="Logo" /><span className="faint t-xs">On light (optional)</span></div>
      </div>
      <label className="field"><span>Name</span><input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={40} /></label>
      <div className="stack" style={{ gap: 6 }}>
        <span className="field-label">Tier</span>
        <Seg label="Tier" value={d.tier} onChange={(tier) => setD({ ...d, tier })} options={SPONSOR_TIERS.map((t) => [t, TIER_NAME[t]])} />
        <span className="faint t-xs">Title sponsors appear three times as often as supporters in the sponsor slot.</span>
      </div>
      <label className="field"><span>Read</span><input value={d.read} onChange={(e) => setD({ ...d, read: e.target.value })} maxLength={120} placeholder={`This match is brought to you by ${d.name || 'our sponsor'}.`} /></label>
      <span className="faint t-xs" style={{ marginTop: -8 }}>Shown under the logo in the sponsor slot and on the sponsor read lower third.</span>
      <div className="field"><span>Video loop for breaks (optional)</span>
        <div className="row" style={{ gap: 8 }}>
          <input aria-label="Video loop for breaks" style={{ flex: 1, minWidth: 0 }} value={d.video} onChange={(e) => setD({ ...d, video: e.target.value })} maxLength={400} placeholder="C:\Sponsors\nova-loop.mp4" />
          <button type="button" className="btn" onClick={() => void air.pickVideo().then((path) => { if (path) setD((x) => ({ ...x, video: path })); })}>Browse…</button>
          {d.video && <button type="button" className="btn" onClick={() => setD((x) => ({ ...x, video: '' }))}>Remove</button>}
        </div>
      </div>
      <span className="faint t-xs" style={{ marginTop: -8 }}>A file on this PC. Air adds it to the break scene in OBS when you go live.</span>
      <div className="stack" style={{ gap: 8 }}>
        <span className="field-label">Spaces they bought</span>
        <span className="faint t-xs">Tick each one. A space can have its own logo; otherwise the main logo is used. The rotator rotates every sponsor that bought it.</span>
        <div className="sp-spaces">
          {SPONSOR_SPACES.map((k) => {
            const on = !!d.spaces[k];
            return (
              <div key={k} className={`sp-space ${on ? 'on' : ''}`}>
                <label className="row-gap t-sm"><input type="checkbox" checked={on} onChange={(e) => setSpace(k, e.target.checked)} />{SPACE_NAME[k]}</label>
                {on && <span className="row-gap"><ImagePick s={s} value={d.spaces[k]!.logo} size={40} label={`${SPACE_NAME[k]} logo`} onChange={(logo) => setSpace(k, true, logo)} fallback="Main" />{d.spaces[k]!.logo ? <button type="button" className="btn quiet small" onClick={() => setSpace(k, true, '')}>Use main</button> : <span className="faint t-xs">Main logo</span>}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </EditorDrawer>
  );
}

type Draft = Omit<PlayerInfo, 'id'> & { id?: string };

/** One player of a lineup: how they appear, how the game knows them, and their camera link. */
export function PlayerEditor({ s, run, team, index, close }: { s: Snapshot; run: Run; team: 0 | 1; index: number | null; close: () => void }) {
  const m = s.match!;
  const existing = index === null ? null : m.players[team][index] ?? null;
  const [d, setD] = useState<Draft>(existing ?? { name: '', realName: '', gameId: '', photo: '' });
  const id = gameOf(m.game)?.identity;
  const seat = index === null ? null : s.cams.slots.find((x) => x.team === team && x.slot === index) ?? null;
  const [copied, setCopied] = useState(false);
  const save = async (players: typeof m.players) => run(() => air.updateMatch(m.id, { players: players as never }));
  const write = (next: Draft | null) => m.players.map((list, t) => (t !== team ? list : index === null ? [...list, next!] : next ? list.map((p, i) => (i === index ? { ...p, ...next } : p)) : list.filter((_, i) => i !== index))) as typeof m.players;
  return (
    <EditorDrawer
      title={existing ? existing.name : `Add a player · ${m.teams[team].name}`} close={close}
      footer={<>
        {existing ? <button className="btn quiet danger" onClick={async () => { if (await save(write(null))) close(); }}>Remove from lineup</button> : <span />}
        <span className="row-gap"><button className="btn quiet" onClick={close}>Cancel</button><button className="btn primary" disabled={!d.name.trim()} onClick={async () => { if (await save(write(d))) close(); }}>Save</button></span>
      </>}
    >
      <div className="row-gap" style={{ gap: 16 }}>
        <ImagePick s={s} value={d.photo} size={72} label={`photo of ${d.name || 'this player'}`} onChange={(photo) => setD({ ...d, photo })} fallback="Photo" />
        <span className="muted">{m.teams[team].name}{index !== null ? ` · seat ${index + 1}` : ''}</span>
      </div>
      <div className="grid2">
        <label className="field"><span>Name on air</span><input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={32} /></label>
        <label className="field"><span>Full name</span><input value={d.realName} onChange={(e) => setD({ ...d, realName: e.target.value })} maxLength={60} /></label>
        {id && <label className="field" style={{ gridColumn: '1 / -1' }}><span>{id.label}</span><input className="mono" value={d.gameId} onChange={(e) => setD({ ...d, gameId: e.target.value })} placeholder={id.placeholder} spellCheck={false} /></label>}
      </div>
      {id && <span className="faint t-xs" style={{ marginTop: -8 }}>{id.help}</span>}
      <span className="faint t-xs">Changes are saved in Teams/Players too, for every match not yet finished.</span>
      {seat && (
        <>
          <hr className="rule" />
          <div className="between"><h3 className="title-sm">Player camera</h3><span className={`state ${seat.connected ? 'ok' : ''}`}><i className={`dot ${seat.connected ? 'ok' : 'off'}`} />{seat.connected ? 'Connected' : seat.pushUrl ? 'Not opened yet' : 'No link'}</span></div>
          {seat.pushUrl ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row-gap"><input className="cell mono" value={seat.pushUrl} readOnly aria-label="Player camera link" style={{ flex: 1, minWidth: 0 }} /><button className="btn small" onClick={() => { void air.copy(seat.pushUrl!); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button></div>
              <button className="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={() => void run(() => air.camRemove(team, index!))}>Remove the link</button>
            </div>
          ) : <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => void run(() => air.camCreate(team, index!))}>Make a camera link</button>}
        </>
      )}
    </EditorDrawer>
  );
}
