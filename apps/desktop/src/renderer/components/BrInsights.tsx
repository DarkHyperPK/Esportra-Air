// Live › Insights for a battle royale lobby (24 Nov, approved mock 9, folded into one view for the producer's
// "few pages" rule): one scrolling page with a scope switch (Now while a match runs, the whole day, or one saved
// match). Every number comes from the observer feed Air saved with each match (`LobbyGame.feed`, totals from
// src/shared/br-stats.ts) or the live read (`snapshot.pcobLive`). Each MVP, leader, player and team row can put
// its graphic on air in one click (the pick is saved as the lobby's `show.pick`). Events › lobby opens it read-only.
import { useMemo, useState } from 'react';
import type { Lobby, Snapshot } from '../../shared/api.ts';
import { standings } from '../../shared/br.ts';
import { playerTotals, teamTotals, type PlayerTotals } from '../../shared/br-stats.ts';
import type { BrScreen } from '../../shared/br-screens.ts';
import { gameOf } from '../../shared/games.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';

type Scope = 'now' | 'day' | number;
type SortKey = 'rating' | 'kills' | 'knockouts' | 'assists' | 'damage' | 'damageTaken' | 'heal' | 'headshots' | 'survival' | 'maxKillDistance' | 'rescues';
const COLS: Array<[SortKey, string]> = [['kills', 'Elims'], ['knockouts', 'Knocks'], ['assists', 'Assists'], ['damage', 'Damage'], ['damageTaken', 'Taken'], ['heal', 'Heals'], ['headshots', 'HS'], ['survival', 'Alive'], ['maxKillDistance', 'Longest'], ['rescues', 'Revives'], ['rating', 'Rating']];
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

export function BrInsights({ s, run, l, readOnly = false }: { s: Snapshot; run: Run; l: Lobby; readOnly?: boolean }) {
  const live = s.pcobLive ?? null;
  const fed = l.games.filter((g) => g.feed?.stats.length);
  const [scope, setScope] = useState<Scope>(live ? 'now' : 'day');
  const [sort, setSort] = useState<SortKey>('rating');
  const [find, setFind] = useState('');
  const cur: Scope = scope === 'now' && !live ? 'day' : typeof scope === 'number' && !fed.some((g) => g.n === scope) ? 'day' : scope;
  const team = (id: string | null | undefined) => l.teams.find((t) => t.id === id) ?? null;
  const Tag = ({ id }: { id: string | null | undefined }) => { const t = team(id); return <span className="ins-tag" style={{ ['--c' as string]: t?.color || '#555' }}>{t?.tag || '—'}</span>; };
  const games = typeof cur === 'number' ? fed.filter((g) => g.n === cur) : fed;
  const players = useMemo(() => playerTotals(games.map((g) => g.feed!)), [games]);
  const teams = useMemo(() => teamTotals(games.map((g) => g.feed!)), [games]);
  const table = standings(l);
  const word = gameOf(l.game)?.words;
  /** Saves what the graphic should show, then puts it on air. */
  const onAir = (screen: BrScreen, pick: { player?: string; vs?: string; scope?: 'match' | 'day'; game?: number } = {}) => run(async () => {
    await air.lobbyShow(l.id, { pick: { scope: pick.scope ?? (typeof cur === 'number' ? 'match' : 'day'), ...(typeof cur === 'number' ? { game: cur } : {}), ...pick } });
    return air.lobbyTake(l.id, screen);
  });
  const Air = ({ label, screen, pick }: { label: string; screen: BrScreen; pick?: { player?: string; vs?: string; scope?: 'match' | 'day'; game?: number } }) =>
    readOnly ? null : <button className="btn small ins-air" onClick={() => void onAir(screen, pick)}>On air · {label}</button>;

  if (!fed.length && !live) {
    return (
      <div className="ins">
        <div className="ins-note">{gameOf(l.game)?.feed ? <><b>Insights fill in from the game.</b> Connect Game data in Live: every player&rsquo;s numbers are read live and saved with each match.</> : <><b>{gameOf(l.game)?.name} has no official live data.</b> Standings from the results you type.</>}</div>
        <TeamsTable l={l} table={table} teams={[]} Tag={Tag} />
      </div>
    );
  }
  const sorted = [...players].sort((a, b) => (b[sort] as number) - (a[sort] as number)).filter((p) => !find || `${p.name} ${team(p.team)?.name ?? ''} ${team(p.team)?.tag ?? ''}`.toLowerCase().includes(find.toLowerCase()));
  const maxDmg = Math.max(1, ...players.map((p) => p.damage));
  const top = (k: SortKey) => [...players].sort((a, b) => (b[k] as number) - (a[k] as number))[0];
  const mvp = players[0];
  const g = typeof cur === 'number' ? fed.find((x) => x.n === cur)! : null;
  return (
    <div className="ins">
      <div className="ins-top">
        <div className="seg" role="group" aria-label="Show">
          {live && <button aria-pressed={cur === 'now'} onClick={() => setScope('now')}><i className="ins-live" /> Now · M{live.game}</button>}
          <button aria-pressed={cur === 'day'} onClick={() => setScope('day')}>Whole day</button>
          {fed.map((x) => <button key={x.n} aria-pressed={cur === x.n} onClick={() => setScope(x.n)}>{word?.game ?? 'Match'} {x.n}</button>)}
        </div>
        <span className="ins-note"><b>From the game</b> · {fed.length} {fed.length === 1 ? 'match' : 'matches'} read from the observer PC · every number is saved with its match</span>
      </div>

      {cur === 'now' && live && <LiveNow l={l} live={live} Tag={Tag} readOnly={readOnly} run={run} />}

      {cur !== 'now' && mvp && (
        <div className="ins-grid two">
          <section className="ins-card" style={{ ['--c' as string]: team(mvp.team)?.color || '#555' }}>
            <span className="ins-eb">{g ? `MVP · ${word?.game?.toUpperCase() ?? 'MATCH'} ${g.n}${g.map ? ` · ${g.map.toUpperCase()}` : ''}` : 'MVP OF THE DAY'}</span>
            <b className="ins-big">{mvp.name}</b>
            <span className="ins-who"><Tag id={mvp.team} />{team(mvp.team)?.name}</span>
            <div className="ins-mini"><div><b>{mvp.kills}</b>ELIMS</div><div><b>{mvp.damage}</b>DAMAGE</div><div><b>{mvp.knockouts}</b>KNOCKS</div><div><b>{clock(mvp.survival / Math.max(1, mvp.games))}</b>AVG ALIVE</div><div><b>{mvp.rating}</b>RATING</div></div>
            <div className="row g-2">{g && <Air label="Match MVP" screen="br-mvp" />}<Air label="Player profile" screen="br-profile" pick={{ player: mvp.name }} /></div>
          </section>
          <section className="ins-card">
            <span className="ins-eb">LEADERS · {g ? `${word?.game?.toUpperCase() ?? 'MATCH'} ${g.n}` : 'WHOLE DAY'}</span>
            <div className="ins-tiles">
              {([['kills', 'Most elims', ''], ['damage', 'Most damage', ''], ['maxKillDistance', 'Longest kill', 'm'], ['knockouts', 'Most knocks', ''], ['heal', 'Most healing', ''], ['rescues', 'Most revives', '']] as Array<[SortKey, string, string]>).map(([k, label, unit]) => {
                const p = top(k);
                return p ? <div key={k} className="ins-tile"><span className="ins-eb">{label}</span><b className="ins-v">{p[k] as number}<small>{unit}</small></b><span className="ins-who"><Tag id={p.team} />{p.name}</span></div> : null;
              })}
            </div>
            <Air label={g ? 'Top fraggers' : 'Top fraggers · day'} screen="br-fraggers" pick={{ scope: g ? 'match' : 'day' }} />
          </section>
        </div>
      )}

      {cur !== 'now' && (
        <section className="ins-card">
          <div className="between"><span className="ins-eb">EVERY PLAYER · {g ? `${word?.game?.toUpperCase() ?? 'MATCH'} ${g.n}` : 'WHOLE DAY'} · {players.length}</span>
            <input className="cell" style={{ width: 240 }} placeholder="Find a player or team" aria-label="Find a player or team" value={find} onChange={(e) => setFind(e.target.value)} /></div>
          <div className="scroll-x"><table className="ins-tbl">
            <thead><tr><th>#</th><th>Player</th>{COLS.map(([k, label]) => <th key={k} className={sort === k ? 'sorted' : ''}><button onClick={() => setSort(k)} aria-label={`Sort by ${label}`}>{label}{sort === k ? ' ▾' : ''}</button></th>)}{!readOnly && <th />}</tr></thead>
            <tbody>{sorted.map((p, i) => (
              <tr key={p.openId || p.name}>
                <td className="mute">{i + 1}</td>
                <td className="pn"><Tag id={p.team} /><b>{p.name}</b></td>
                {COLS.map(([k]) => <td key={k} className={k === 'damage' ? 'bar' : ''}>{cell(p, k, maxDmg)}</td>)}
                {!readOnly && <td className="row-gap"><button className="btn quiet small" onClick={() => void onAir('br-profile', { player: p.name })}>On air · Profile</button>
                  <button className="btn quiet small" title="Player vs player against the best by MVP rating" onClick={() => void onAir('br-pvp', { player: p.name, vs: (players[0]?.name === p.name ? players[1] : players[0])?.name })}>vs leader</button></td>}
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {cur !== 'now' && (
        <TeamsTable l={l} table={table} teams={teams} Tag={Tag} game={g} air={readOnly ? undefined : g ? () => void onAir('br-tom') : undefined} stats={readOnly || !g ? undefined : () => void onAir('br-mstats')} />
      )}

      {g?.feed && g.feed.kills.length > 0 && (
        <section className="ins-card">
          <span className="ins-eb">KNOCKS AND KILLS · {word?.game?.toUpperCase() ?? 'MATCH'} {g.n} · {g.feed.kills.length}</span>
          <Feed kills={g.feed.kills} />
        </section>
      )}
    </div>
  );
}

function cell(p: PlayerTotals, k: SortKey, maxDmg: number) {
  if (k === 'survival') return clock(p.survival / Math.max(1, p.games));
  if (k === 'maxKillDistance') return `${p.maxKillDistance}m`;
  if (k === 'damage') return <><span className="ins-bar"><i style={{ width: `${Math.round((p.damage / maxDmg) * 100)}%` }} /></span><b>{p.damage}</b></>;
  if (k === 'rating') return <b>{p.rating}</b>;
  return p[k] as number;
}

type TagC = (p: { id: string | null | undefined }) => JSX.Element;

function TeamsTable({ l, table, teams, Tag, game, air: onTom, stats }: { l: Lobby; table: ReturnType<typeof standings>; teams: ReturnType<typeof teamTotals>; Tag: TagC; game?: Lobby['games'][number] | null; air?: () => void; stats?: () => void }) {
  const by = new Map(teams.map((t) => [t.team, t]));
  const rows = game ? (game.results ?? []).slice().sort((a, b) => a.place - b.place).map((r) => ({ team: r.team, place: r.place, elims: r.elims })) : null;
  const max = Math.max(1, ...table.map((r) => r.total));
  const name = (id: string) => l.teams.find((t) => t.id === id)?.name ?? '—';
  return (
    <section className="ins-card">
      <div className="between"><span className="ins-eb">TEAMS · {game ? `MATCH ${game.n}` : 'WHOLE DAY'}</span><span className="row g-2">{onTom && <button className="btn small ins-air" onClick={onTom}>On air · Team of the match</button>}{stats && <button className="btn small ins-air" onClick={stats}>On air · Match stats</button>}</span></div>
      <div className="scroll-x"><table className="ins-tbl teams">
        {rows ? (
          <>
            <thead><tr><th>#</th><th>Team</th><th>Elims</th><th>Knocks</th><th>Assists</th><th>Damage</th><th>Taken</th><th>Heals</th><th>Revives</th><th>Avg alive</th></tr></thead>
            <tbody>{rows.map((r) => { const x = by.get(r.team); return <tr key={r.team}><td className="mute">{r.place}</td><td className="pn"><Tag id={r.team} /><b>{name(r.team)}</b></td><td>{r.elims}</td><td>{x?.knockouts ?? '—'}</td><td>{x?.assists ?? '—'}</td><td>{x?.damage ?? '—'}</td><td>{x?.damageTaken ?? '—'}</td><td>{x?.heal ?? '—'}</td><td>{x?.rescues ?? '—'}</td><td>{x ? clock(x.survival / 4) : '—'}</td></tr>; })}</tbody>
          </>
        ) : (
          <>
            <thead><tr><th>#</th><th>Team</th><th>Points</th><th>WWCD</th><th>Place pts</th><th>Elims</th><th>Knocks</th><th>Damage</th><th>Revives</th></tr></thead>
            <tbody>{table.map((r) => { const x = by.get(r.team); const t = l.teams.find((y) => y.id === r.team); return <tr key={r.team}><td className="mute">{r.rank}</td><td className="pn"><Tag id={r.team} /><b>{name(r.team)}</b></td><td className="bar"><span className="ins-bar wide"><i style={{ width: `${Math.round((r.total / max) * 100)}%`, background: t?.color || undefined }} /></span><b>{r.total}</b></td><td>{r.wins || '–'}</td><td>{r.placementPts}</td><td>{r.elims}</td><td>{x?.knockouts ?? '—'}</td><td>{x?.damage ?? '—'}</td><td>{x?.rescues ?? '—'}</td></tr>; })}</tbody>
          </>
        )}
      </table></div>
    </section>
  );
}

function Feed({ kills }: { kills: Array<{ causer: string; victim: string; kind: 'knock' | 'kill'; time: number; distance: number }> }) {
  return <div className="ins-feed">{kills.map((k, i) => <div key={i} className={`ins-k ${k.kind}`}><span className="t">{clock(k.time)}</span><b>{k.causer}</b><span className="a">{k.kind === 'kill' ? '✕' : '↓'}</span><span>{k.victim}</span><span className="mute">{Math.round(k.distance)}m</span></div>)}</div>;
}

function LiveNow({ l, live, Tag, readOnly, run }: { l: Lobby; live: NonNullable<Snapshot['pcobLive']>; Tag: TagC; readOnly: boolean; run: Run }) {
  const rows = Object.entries(live.teams).map(([id, v]) => ({ id, ...v, name: l.teams.find((t) => t.id === id)?.name ?? '—' })).sort((a, b) => (a.place ?? 0) - (b.place ?? 0) || b.elims - a.elims);
  const elims = live.players.slice(0, 6), dmg = [...live.players].sort((a, b) => b.damage - a.damage).slice(0, 6);
  const z = live.zone;
  return (
    <div className="ins-grid two">
      <section className="ins-card">
        <span className="ins-eb"><i className="ins-live" /> MATCH {live.game} · LIVE FROM THE OBSERVER PC</span>
        <div className="ins-kpis"><div><b>{live.teamsAlive}</b><span>TEAMS ALIVE</span></div><div><b>{live.playersAlive}</b><span>PLAYERS ALIVE</span></div><div><b>{z?.index ?? '—'}</b><span>ZONE · {z?.status === 'move' ? 'CLOSING' : 'WAITING'}</span></div><div><b>{z ? clock(z.counter) : '—'}</b><span>ZONE TIMER</span></div></div>
        <span className="ins-eb">TEAM STATUS</span>
        <div className="ins-ts">{rows.map((x) => <div key={x.id} className={`ins-tsr ${x.place ? 'out' : ''}`}><Tag id={x.id} /><b>{x.name}</b><span className="ins-marks">{x.players.split('').map((c, i) => <i key={i} className={c} />)}</span><span>{x.elims}<small>K</small></span><span className="mute">{x.place ? `#${x.place}` : ''}</span></div>)}</div>
      </section>
      <section className="ins-card">
        <span className="ins-eb">LIVE LEADERS</span>
        <div className="ins-two">
          <div><span className="mute">Elims</span>{elims.map((p, i) => <div key={p.name} className="ins-lr"><i>{i + 1}</i><Tag id={p.team} /><b>{p.name}</b><em>{p.elims}</em></div>)}</div>
          <div><span className="mute">Damage</span>{dmg.map((p, i) => <div key={p.name} className="ins-lr"><i>{i + 1}</i><Tag id={p.team} /><b>{p.name}</b><em>{p.damage}</em></div>)}</div>
        </div>
        {!readOnly && <button className="btn small ins-air" onClick={() => void run(() => air.lobbyShow(l.id, { ltf: !(l.show?.ltf ?? false) }))}>{l.show?.ltf ? 'Hide live top fraggers' : 'On air · Live top fraggers'}</button>}
        <span className="ins-eb">LAST KNOCKS AND KILLS</span>
        <Feed kills={live.kills.slice(-10).reverse()} />
      </section>
    </div>
  );
}
