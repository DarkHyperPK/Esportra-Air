// Editors shared by the New match wizard and a match's own pages: teams, lineups, talent and event.
import { useRef, useState } from 'react';
import type { Caster, PlayerInfo, Snapshot, Team } from '../../shared/api.ts';
import { GAMES, type GameId } from '../../shared/games.ts';
import { air } from '../bridge.ts';

export type DraftPlayer = Omit<PlayerInfo, 'id'> & { id?: string };
export type Lineups = [DraftPlayer[], DraftPlayer[]];

export const emptyPlayer = (): DraftPlayer => ({ name: '', realName: '', gameId: '', photo: '' });

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

export function TalentFields({ casters, onCasters, event, onEvent, sponsors, onSponsors }: { casters: Caster[]; onCasters: (c: Caster[]) => void; event: { name: string; stage: string }; onEvent: (e: { name: string; stage: string }) => void; sponsors: string[]; onSponsors: (s: string[]) => void }) {
  const [sponsor, setSponsor] = useState('');
  const c = [casters[0] ?? { name: '', handle: '' }, casters[1] ?? { name: '', handle: '' }];
  const setC = (i: number, patch: Partial<Caster>) => onCasters(c.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <section className="panel body-pad stack" style={{ gap: 12 }}>
        <span className="cap">Casters</span>
        {c.map((x, i) => (
          <div className="grid2" key={i}>
            <label className="field"><span>{i ? 'Analyst' : 'Play-by-play'}</span><input value={x.name} onChange={(e) => setC(i, { name: e.target.value })} maxLength={40} /></label>
            <label className="field"><span>Handle</span><input value={x.handle} onChange={(e) => setC(i, { handle: e.target.value })} maxLength={40} placeholder="@handle" /></label>
          </div>
        ))}
      </section>
      <section className="panel body-pad stack" style={{ gap: 12 }}>
        <span className="cap">Event</span>
        <label className="field"><span>Event name (event bug)</span><input value={event.name} onChange={(e) => onEvent({ ...event, name: e.target.value })} maxLength={60} placeholder="e.g. Community Cup" /></label>
        <label className="field"><span>Stage (lower thirds)</span><input value={event.stage} onChange={(e) => onEvent({ ...event, stage: e.target.value })} maxLength={60} placeholder="e.g. Playoffs" /></label>
        <span className="cap" style={{ marginTop: 4 }}>Sponsors</span>
        <div className="chips-row">
          {sponsors.map((n) => <span key={n} className="pill">{n}<button type="button" aria-label={`Remove ${n}`} onClick={() => onSponsors(sponsors.filter((x) => x !== n))}>✕</button></span>)}
          {sponsors.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>None yet.</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="cell" aria-label="Sponsor name" value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="Sponsor name" maxLength={40} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (sponsor.trim()) { onSponsors([...sponsors, sponsor.trim()]); setSponsor(''); } } }} />
          <button type="button" className="btn" disabled={!sponsor.trim() || sponsors.length >= 12} onClick={() => { onSponsors([...sponsors, sponsor.trim()]); setSponsor(''); }}>Add</button>
        </div>
      </section>
    </div>
  );
}
