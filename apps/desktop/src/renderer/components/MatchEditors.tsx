// Editors shared by the New match wizard and a match's own pages: teams, lineups, talent and event.
import { useRef, useState } from 'react';
import type { Match, PlayerInfo, Snapshot, Team } from '../../shared/api.ts';
import { ROLE_NAME, SPONSOR_TIERS, TALENT_ROLES, TIER_NAME, type EventInfo, type SponsorTier, type TalentRole } from '../../shared/model.ts';
import type { Run } from '../App.tsx';
import { GAMES, type GameId } from '../../shared/games.ts';
import { air } from '../bridge.ts';

export type DraftPlayer = Omit<PlayerInfo, 'id'> & { id?: string };
export type Lineups = [DraftPlayer[], DraftPlayer[]];

export const emptyPlayer = (): DraftPlayer => ({ name: '', realName: '', gameId: '', photo: '' });

/** The name of a match's event, or ''. */
export const eventName = (s: Snapshot, m: Match) => s.events.find((e) => e.id === m.eventId)?.name ?? '';

/** An engine image path made absolute for this window. */
export const imageUrl = (s: Snapshot, path: string) => (path.startsWith('/air-assets/') ? `http://127.0.0.1:${s.engine.port}${path}` : path);

const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('That file could not be read.'));
  reader.readAsDataURL(file);
});

/** A square image slot: click to choose a picture; the engine stores it. */
export function ImagePick({ s, value, onChange, label, size = 64, round = false, fallback }: { s: Snapshot; value: string; onChange: (url: string) => void; label: string; size?: number; round?: boolean; fallback?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="imgpick" style={{ width: size }}>
      <button type="button" className={`imgpick-btn ${round ? 'round' : ''}`} style={{ width: size, height: size }} aria-label={value ? `Change ${label}` : `Add ${label}`} onClick={() => input.current?.click()} disabled={busy}>
        {value ? <img src={imageUrl(s, value)} alt="" /> : <span>{busy ? '…' : fallback ?? '+'}</span>}
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
          onChange(await air.uploadImage(await readFile(file)));
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }} />
      {value && <button type="button" className="imgpick-clear" onClick={() => onChange('')} aria-label={`Remove ${label}`}>Remove</button>}
      {error && <span className="imgpick-error" role="alert">{error}</span>}
    </div>
  );
}

export function GamePicker({ value, onChange }: { value: GameId; onChange: (g: GameId) => void }) {
  return (
    <div className="games" role="radiogroup" aria-label="Game">
      {GAMES.map((g) => (
        <button key={g.id} type="button" role="radio" aria-checked={value === g.id} disabled={!g.available} className={`game-card ${g.id}`} onClick={() => onChange(g.id)}>
          <span className="game-name">{g.name}</span>
          <span className="game-state">{g.available ? 'Live data · HUD ready' : 'Coming to Air'}</span>
        </button>
      ))}
    </div>
  );
}

export function TeamFields({ s, team, index, onChange }: { s: Snapshot; team: Team; index: 0 | 1; onChange: (t: Team) => void }) {
  return (
    <div className="team-card" style={{ ['--team' as string]: team.color }}>
      <ImagePick s={s} value={team.logo} onChange={(logo) => onChange({ ...team, logo })} label={`Team ${index ? 'B' : 'A'} logo`} size={88} fallback="Logo" />
      <div className="stack" style={{ gap: 10, flex: 1, minWidth: 0 }}>
        <span className="cap">Team {index ? 'B' : 'A'}</span>
        <label className="field"><span>Team name</span><input value={team.name} onChange={(e) => onChange({ ...team, name: e.target.value })} maxLength={40} required placeholder="e.g. Night Owls" /></label>
        <div className="grid2" style={{ gridTemplateColumns: '1fr 120px' }}>
          <label className="field"><span>Tag (scorebug)</span><input value={team.tag} onChange={(e) => onChange({ ...team, tag: e.target.value.toUpperCase().slice(0, 5) })} maxLength={5} placeholder="Auto" /></label>
          <label className="field"><span>Colour</span><input type="color" className="color" value={team.color} onChange={(e) => onChange({ ...team, color: e.target.value })} /></label>
        </div>
      </div>
    </div>
  );
}

export function LineupEditor({ s, teams, lineups, onChange, game }: { s: Snapshot; teams: [Team, Team]; lineups: Lineups; onChange: (l: Lineups) => void; game: GameId }) {
  const id = GAMES.find((g) => g.id === game)?.playerId;
  const set = (t: 0 | 1, i: number, p: Partial<DraftPlayer>) => onChange(lineups.map((team, ti) => (ti === t ? team.map((x, xi) => (xi === i ? { ...x, ...p } : x)) : team)) as Lineups);
  return (
    <div className="lineups">
      {([0, 1] as const).map((t) => (
        <section key={t} className="lineup" style={{ ['--team' as string]: teams[t].color }}>
          <header className="lineup-head">
            {teams[t].logo ? <img src={imageUrl(s, teams[t].logo)} alt="" /> : <span className="crest-lg" />}
            <span className="title-sm">{teams[t].name || `Team ${t ? 'B' : 'A'}`}</span>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{lineups[t].length} of 7</span>
          </header>
          {lineups[t].map((p, i) => (
            <div className="player-row" key={i}>
              <ImagePick s={s} value={p.photo} onChange={(photo) => set(t, i, { photo })} label={`photo for ${p.name || `player ${i + 1}`}`} size={44} round fallback={String(i + 1)} />
              <label className="field"><span>Display name</span><input value={p.name} onChange={(e) => set(t, i, { name: e.target.value })} maxLength={32} required placeholder="On air" /></label>
              {id && <label className="field"><span>{id.label}</span><input value={p.gameId} onChange={(e) => set(t, i, { gameId: e.target.value })} placeholder={id.placeholder} spellCheck={false} /></label>}
              <label className="field"><span>Real name</span><input value={p.realName} onChange={(e) => set(t, i, { realName: e.target.value })} maxLength={60} placeholder="Optional" /></label>
              <button type="button" className="btn quiet small" aria-label={`Remove ${p.name || `player ${i + 1}`}`} onClick={() => onChange(lineups.map((team, ti) => (ti === t ? team.filter((_, xi) => xi !== i) : team)) as Lineups)}>✕</button>
            </div>
          ))}
          {lineups[t].length < 7 && <button type="button" className="btn small" onClick={() => onChange(lineups.map((team, ti) => (ti === t ? [...team, emptyPlayer()] : team)) as Lineups)}>+ Add player</button>}
        </section>
      ))}
      {id && <p className="muted" style={{ fontSize: 12.5, gridColumn: '1 / -1' }}>The {id.label} is how Air recognises each player in live game data, so their display name and photo appear on air. Players without one keep their in-game name.</p>}
    </div>
  );
}

/**
 * The event's people on air and sponsors. With a match, each can be switched on or off for it;
 * without one, this edits the event itself. Every change is saved straight away.
 */
export function EventPeople({ s, run, event, match }: { s: Snapshot; run: Run; event: EventInfo | null; match?: Match | null }) {
  const [person, setPerson] = useState({ name: '', role: 'play-by-play' as TalentRole });
  const [sponsor, setSponsor] = useState({ name: '', tier: 'partner' as SponsorTier });
  const [eventName, setEventName] = useState('');
  if (!event) {
    return (
      <form className="stack" style={{ gap: 10, maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); void run(() => air.createEvent(eventName)); }}>
        <label className="field"><span>Event name</span><input value={eventName} onChange={(e) => setEventName(e.target.value)} maxLength={60} placeholder="e.g. Community Cup" /></label>
        <button className="btn primary" disabled={!eventName.trim()}>Create event</button>
      </form>
    );
  }
  const off = (list: string[], id: string, on: boolean) => (on ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <section className="stack" style={{ gap: 8 }}>
        <span className="cap">People on air · {event.name}</span>
        {event.talent.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>Nobody yet.</span>}
        {event.talent.map((t) => {
          const on = !match?.talentOff.includes(t.id);
          return (
            <div key={t.id} className="row-item" style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto auto', gap: 12, alignItems: 'center' }}>
              <ImagePick s={s} value={t.photo} size={40} round label={`Photo of ${t.name}`} onChange={(photo) => void run(() => air.saveTalent(event.id, { id: t.id, photo }))} />
              <span><b>{t.name}</b><br /><span className="muted" style={{ fontSize: 12.5 }}>{ROLE_NAME[t.role]}{t.handle ? ` · ${t.handle}` : ''}</span></span>
              {match
                ? <button type="button" className="switch" role="switch" aria-checked={on} aria-label={`${t.name} on air for this match`} onClick={() => void run(() => air.updateMatch(match.id, { talentOff: off(match.talentOff, t.id, !on) }))} />
                : <span />}
              <button type="button" className="btn quiet small" onClick={() => void run(() => air.removeTalent(event.id, t.id))}>Remove</button>
            </div>
          );
        })}
        <form style={{ display: 'flex', gap: 8 }} onSubmit={async (e) => { e.preventDefault(); if (await run(() => air.saveTalent(event.id, person))) setPerson({ ...person, name: '' }); }}>
          <input className="cell" aria-label="Name" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} placeholder="Name" maxLength={40} />
          <select className="cell" aria-label="Role" value={person.role} onChange={(e) => setPerson({ ...person, role: e.target.value as TalentRole })}>{TALENT_ROLES.map((r) => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}</select>
          <button className="btn" disabled={!person.name.trim()}>Add</button>
        </form>
      </section>
      <section className="stack" style={{ gap: 8 }}>
        <span className="cap">Sponsors</span>
        {event.sponsors.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>None yet.</span>}
        {event.sponsors.map((x) => {
          const on = !match?.sponsorsOff.includes(x.id);
          return (
            <div key={x.id} className="row-item" style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto auto', gap: 12, alignItems: 'center' }}>
              <ImagePick s={s} value={x.logo} size={40} label={`Logo of ${x.name}`} onChange={(logo) => void run(() => air.saveSponsor(event.id, { id: x.id, logo }))} />
              <span><b>{x.name}</b><br /><span className="muted" style={{ fontSize: 12.5 }}>{TIER_NAME[x.tier]}</span></span>
              {match
                ? <button type="button" className="switch" role="switch" aria-checked={on} aria-label={`${x.name} on for this match`} onClick={() => void run(() => air.updateMatch(match.id, { sponsorsOff: off(match.sponsorsOff, x.id, !on) }))} />
                : <span />}
              <button type="button" className="btn quiet small" onClick={() => void run(() => air.removeSponsor(event.id, x.id))}>Remove</button>
            </div>
          );
        })}
        <form style={{ display: 'flex', gap: 8 }} onSubmit={async (e) => { e.preventDefault(); if (await run(() => air.saveSponsor(event.id, sponsor))) setSponsor({ ...sponsor, name: '' }); }}>
          <input className="cell" aria-label="Sponsor name" value={sponsor.name} onChange={(e) => setSponsor({ ...sponsor, name: e.target.value })} placeholder="Sponsor name" maxLength={40} />
          <select className="cell" aria-label="Tier" value={sponsor.tier} onChange={(e) => setSponsor({ ...sponsor, tier: e.target.value as SponsorTier })}>{SPONSOR_TIERS.map((t) => <option key={t} value={t}>{TIER_NAME[t]}</option>)}</select>
          <button className="btn" disabled={!sponsor.name.trim()}>Add</button>
        </form>
      </section>
    </div>
  );
}
