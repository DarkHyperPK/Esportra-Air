// Teams/Players (approved mocks, 12 Nov): teams and players kept once, with a Teams | Players filter.
// Matches pick their two teams and starters from here; edits flow into every match that plays them.
import { riotLabel } from '../../shared/riot.ts';
import { useState } from 'react';
import type { LibPlayer, LibTeam } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import type { PageProps } from '../App.tsx';
import { LibPlayerEditor, LibTeamEditor } from '../components/TeamEditors.tsx';
import { Face, TeamMark } from './MatchWorkspace.tsx';

type Filter = 'teams' | 'players';

export function TeamsScreen({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const [filter, setFilter] = useState<Filter>('teams');
  const [chosen, setChosen] = useState<string | null>(null);
  // A team just added is chosen by name once the snapshot carries it.
  const [pending, setPending] = useState<string | null>(null);
  const [teamEdit, setTeamEdit] = useState<LibTeam | 'new' | null>(null);
  const [playerEdit, setPlayerEdit] = useState<{ player: LibPlayer | null; teamId?: string | null } | null>(null);
  const [query, setQuery] = useState('');
  const [teamChip, setTeamChip] = useState<string>('all');
  const { teams, players } = s.library;
  const team = teams.find((t) => t.id === chosen) ?? (pending ? teams.find((t) => t.name.toLowerCase() === pending.toLowerCase()) : undefined) ?? teams[0] ?? null;
  const roster = (id: string) => players.filter((p) => p.teamId === id);
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? 'No team';
  const shown = players.filter((p) => (teamChip === 'all' || (teamChip === 'none' ? !p.teamId : p.teamId === teamChip)) && (!query.trim() || `${p.name} ${p.realName} ${p.gameId}`.toLowerCase().includes(query.trim().toLowerCase())));
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="between">
        <div><h1 className="title-lg">Teams/Players</h1><p className="muted">Add them once; every match not yet finished follows your changes.</p></div>
        <div className="row-gap">
          <div className="seg" role="tablist" aria-label="Show">
            <button role="tab" aria-selected={filter === 'teams'} aria-pressed={filter === 'teams'} onClick={() => setFilter('teams')}>Teams</button>
            <button role="tab" aria-selected={filter === 'players'} aria-pressed={filter === 'players'} onClick={() => setFilter('players')}>Players</button>
          </div>
          {filter === 'teams' ? <button className="btn primary" onClick={() => setTeamEdit('new')}>Add team</button> : <button className="btn primary" onClick={() => setPlayerEdit({ player: null, teamId: teamChip !== 'all' && teamChip !== 'none' ? teamChip : null })}>Add player</button>}
        </div>
      </div>

      {filter === 'teams' && (teams.length === 0 ? <p className="muted ap-empty">No teams yet. Press Add team, or create a match: its teams are added here.</p> : (
        <div className="tp-grid">
          <div className="stack" style={{ gap: 6 }} role="listbox" aria-label="Teams">
            {teams.map((t) => (
              <button key={t.id} role="option" aria-selected={team?.id === t.id} className="tp-team" onClick={() => { setChosen(t.id); setPending(null); }}>
                <TeamMark s={s} team={t} size={34} />
                <span className="ev-name"><b>{t.name}</b><span className="faint t-xs">{t.tag} · {roster(t.id).length} player{roster(t.id).length === 1 ? '' : 's'}</span></span>
              </button>
            ))}
            {players.some((p) => !p.teamId) && (
              <button className="tp-team dashed" onClick={() => { setFilter('players'); setTeamChip('none'); }}>
                <span className="faint" aria-hidden="true">+</span>
                <span className="ev-name"><b>Players without a team</b><span className="faint t-xs">{players.filter((p) => !p.teamId).length} players</span></span>
              </button>
            )}
          </div>
          {team && (
            <section className="stack" style={{ gap: 14 }} aria-label={team.name}>
              <div className="between tp-head" style={{ ['--team' as string]: team.color }}>
                <span className="row-gap" style={{ gap: 14 }}><TeamMark s={s} team={team} size={56} /><span><h2 className="title-md">{team.name}</h2><span className="muted t-sm">{team.tag} · {team.color.toUpperCase()}</span></span></span>
                <span className="row-gap">
                  <button className="btn quiet small danger" onClick={() => void run(() => air.removeTeam(team.id))}>Delete team</button>
                  <button className="btn small" onClick={() => setTeamEdit(team)}>Edit team</button>
                </span>
              </div>
              <div className="between"><h3 className="title-sm">Players</h3><button className="btn small" onClick={() => setPlayerEdit({ player: null, teamId: team.id })}>Add a player to {team.name}</button></div>
              <div className="lst">
                {roster(team.id).length === 0 && <p className="muted li">No players yet.</p>}
                {roster(team.id).map((p) => (
                  <div key={p.id} className="li tp-player">
                    <Face s={s} photo={p.photo} name={p.name} size={34} />
                    <b>{p.name}</b>
                    <span className="mono faint t-xs">{riotLabel(p)}</span>
                    <span className="muted t-sm">{p.role || '—'}</span>
                    <span className="row-gap">
                      <button className="btn quiet small" onClick={() => setPlayerEdit({ player: p })}>Edit</button>
                      <button className="btn quiet small" onClick={() => void run(() => air.savePlayer({ ...p, teamId: null }))}>Remove from team</button>
                    </span>
                  </div>
                ))}
              </div>
              <span className="faint t-xs">{s.game?.shape === 'lobby' ? 'The in-game name links the player to the game. Photos show on the squad graphics; without one, a grey player shadow.' : 'The Riot ID links the player to the game. Photos show on player cards and lower thirds.'}</span>
            </section>
          )}
        </div>
      ))}

      {filter === 'players' && (
        <section className="stack" style={{ gap: 12 }}>
          <div className="row-gap" style={{ flexWrap: 'wrap' }}>
            <input className="cell" aria-label="Search players" placeholder="Search players" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 260 }} />
            <span className="muted t-sm">Team</span>
            <div className="rb-chips" role="radiogroup" aria-label="Team">
              {[['all', 'All'], ...teams.map((t) => [t.id, t.name]), ['none', 'No team']].map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={teamChip === id} className="rb-chip" onClick={() => setTeamChip(id!)}>{label}</button>)}
            </div>
          </div>
          <div className="lst">
            {shown.length === 0 && <p className="muted li">{players.length ? 'No player matches.' : 'No players yet. Press Add player.'}</p>}
            {shown.map((p) => (
              <div key={p.id} className="li tp-row">
                <Face s={s} photo={p.photo} name={p.name} size={34} />
                <b>{p.name}</b>
                <span className="mono faint t-xs">{riotLabel(p)}</span>
                <span className="muted t-sm">{p.role || '—'}</span>
                <select className="cell" aria-label={`Team of ${p.name}`} value={p.teamId ?? ''} onChange={(e) => void run(() => air.savePlayer({ ...p, teamId: e.target.value || null }))}>
                  <option value="">No team</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button className="btn quiet small" onClick={() => setPlayerEdit({ player: p })}>Edit</button>
              </div>
            ))}
          </div>
          <span className="faint t-xs">Pick a team in the list to move a player. {shown.length} of {players.length} shown{teamChip !== 'all' ? ` · ${teamChip === 'none' ? 'No team' : teamName(teamChip)}` : ''}.</span>
        </section>
      )}

      {teamEdit && <LibTeamEditor s={s} run={run} team={teamEdit === 'new' ? null : teamEdit} close={() => setTeamEdit(null)} onSaved={(name) => { setChosen(null); setPending(name.trim()); }} />}
      {playerEdit && <LibPlayerEditor s={s} run={run} player={playerEdit.player} teamId={playerEdit.teamId} close={() => setPlayerEdit(null)} />}
    </div>
  );
}
