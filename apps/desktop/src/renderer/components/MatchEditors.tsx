// Editors shared by the New match wizard and a match's own pages: teams, lineups and pictures.
import { useRef, useState } from 'react';
import type { Match, PlayerInfo, Snapshot, Team } from '../../shared/api.ts';
import { gameOf, type GameId } from '../../shared/games.ts';
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
  const id = gameOf(game)?.identity;
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
      {id && <p className="muted" style={{ fontSize: 12.5, gridColumn: '1 / -1' }}>{id.help} Players without one appear under the name the game reports.</p>}
    </div>
  );
}

