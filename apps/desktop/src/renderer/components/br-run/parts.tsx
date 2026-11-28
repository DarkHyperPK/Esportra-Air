// Small pieces the run sheet screens share (27 Nov): a match's state badge, a team's tag, the time of a match.
import type { Lobby } from '../../../shared/api.ts';
import { STATE_LABEL, STATE_WHAT } from '../../../shared/br-run.ts';
import { gameState, type LobbyGame, type MatchState } from '../../../shared/br.ts';

export function StateBadge({ state, attempt }: { state: MatchState; attempt?: number }) {
  return <span className={`run-st ${state}`} title={STATE_WHAT[state]}>{state === 'live' && <i className="dot" />}{STATE_LABEL[state]}{attempt && attempt > 1 ? ` · attempt ${attempt}` : ''}</span>;
}

export function TeamTag({ lobby, id }: { lobby: Lobby; id: string }) {
  const t = lobby.teams.find((x) => x.id === id);
  return <span className="run-team"><span className="lb-tag" style={{ background: t?.color || '#555' }}>{t?.tag || '—'}</span>{t?.name ?? 'A team'}</span>;
}

export const matchTime = (g: LobbyGame) => g.scheduledAt ?? g.startsAt ?? '';
export const matchLabel = (g: LobbyGame) => `Match ${g.n}${g.map ? ` · ${g.map}` : ''}${matchTime(g) ? ` · ${matchTime(g)}` : ''}`;
export const stateOf = gameState;

/** A chip per match of a day, coloured by state: M1 ✓, M2 Armed … */
export function DayChips({ lobby, dayId }: { lobby: Lobby; dayId: string }) {
  const day = lobby.days?.find((d) => d.id === dayId);
  const games = (day?.matchIds ?? []).map((id) => lobby.games.find((g) => g.id === id)).filter((g): g is LobbyGame => !!g);
  return (
    <span className="run-chips" role="list" aria-label={day?.title}>
      {games.map((g) => { const st = gameState(g); return <span key={g.id} role="listitem" className={`run-chip ${st}`} title={`${matchLabel(g)} · ${STATE_LABEL[st]}`}>M{g.n}{st === 'confirmed' ? ' ✓' : st === 'scheduled' ? '' : ` ${STATE_LABEL[st]}`}</span>; })}
    </span>
  );
}
