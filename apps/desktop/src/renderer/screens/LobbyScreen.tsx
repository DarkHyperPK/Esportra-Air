// A battle royale lobby (approved mock, 21 Nov): results typed per match with live standings, the lobby's
// teams from Teams/Players, its matches and maps, and its scoring. Standings use src/shared/br.ts, the same
// rule the room's `br` field is worked out with.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lobby, Snapshot } from '../../shared/api.ts';
import { SCORING_PRESETS, gamePoints, standings, type Scoring, type TeamResult } from '../../shared/br.ts';
import { gameOf } from '../../shared/games.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';

type Tab = 'results' | 'teams' | 'games' | 'scoring';
type Draft = Record<string, { place: string; elims: string }>;

const MAPS: Record<string, string[]> = { pubgm: ['Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Livik', 'Rondo', 'Nusa', 'Karakin'], freefire: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'Nexterra'] };

function Tag({ color, tag }: { color: string; tag: string }) {
  return <span className="lb-tag" style={{ background: color || '#555' }}>{tag || '—'}</span>;
}

export function LobbyScreen({ s, run, lobby, back }: { s: Snapshot; run: Run; lobby: Lobby; back: () => void }) {
  const [tab, setTab] = useState<Tab>(lobby.teams.length ? 'results' : 'teams');
  const game = gameOf(lobby.game);
  const word = game?.words?.game ?? 'Match';
  return (
    <div className="stack" style={{ gap: 18 }}>
      <nav className="crumb-back"><button className="btn quiet small" onClick={back}>← Lobbies</button></nav>
      <header className="between">
        <div>
          <input className="lb-title" aria-label="Lobby name" defaultValue={lobby.title} maxLength={60} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== lobby.title) void run(() => air.lobbyUpdate(lobby.id, { title: v })); }} />
          <p className="muted">{game?.name} · {lobby.teams.length} teams · {lobby.games.length} {word.toLowerCase()}es · {scoringLine(lobby.scoring)}</p>
        </div>
        {s.selectedLobbyId === lobby.id
          ? <span className="state ok"><i className="dot ok" />On the graphics</span>
          : <button className="btn primary" onClick={() => void run(() => air.lobbySelect(lobby.id))}>Use this lobby on the graphics</button>}
      </header>
      <div className="tabs" role="tablist" aria-label="Lobby">
        {([['results', 'Results'], ['teams', `Teams · ${lobby.teams.length}`], ['games', `${word}es and maps`], ['scoring', 'Scoring']] as Array<[Tab, string]>).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'results' && <Results run={run} lobby={lobby} word={word} goTeams={() => setTab('teams')} />}
      {tab === 'teams' && <Teams s={s} run={run} lobby={lobby} />}
      {tab === 'games' && <Games run={run} lobby={lobby} word={word} />}
      {tab === 'scoring' && <ScoringTab run={run} lobby={lobby} />}
    </div>
  );
}

const scoringLine = (sc: Scoring) => `${sc.placement.join('-')} + ${sc.perElim}/elim${sc.matchPoint ? `, match point ${sc.matchPoint}` : ''}`;

function Results({ run, lobby, word, goTeams }: { run: Run; lobby: Lobby; word: string; goTeams: () => void }) {
  const firstOpen = lobby.games.find((g) => !g.results?.length)?.n ?? lobby.games.at(-1)?.n ?? 1;
  const [n, setN] = useState(firstOpen);
  const game = lobby.games.find((g) => g.n === n) ?? lobby.games[0]!;
  const fromSaved = (): Draft => Object.fromEntries(lobby.teams.map((t) => { const r = game?.results?.find((x) => x.team === t.id); return [t.id, { place: r ? String(r.place) : '', elims: r ? String(r.elims) : '' }]; }));
  const [draft, setDraft] = useState<Draft>(fromSaved);
  const savedKey = JSON.stringify(game?.results ?? null) + lobby.teams.map((t) => t.id).join();
  useEffect(() => { setDraft(fromSaved()); }, [n, savedKey]);
  const grid = useRef<HTMLTableSectionElement>(null);
  if (!lobby.teams.length) return <section className="card body-pad"><p className="muted">This lobby has no teams yet.</p><button className="btn primary" onClick={goTeams}>Pick the teams</button></section>;

  const rows: TeamResult[] = lobby.teams.filter((t) => draft[t.id]?.place).map((t) => ({ team: t.id, place: Number(draft[t.id]!.place), elims: Number(draft[t.id]!.elims) || 0 }));
  const places = rows.map((r) => r.place);
  const dup = new Set(places.filter((p, i) => places.indexOf(p) !== i));
  const outOfRange = rows.some((r) => r.place < 1 || r.place > lobby.teams.length);
  const missing = lobby.teams.length - rows.length;
  const changed = JSON.stringify(rows.slice().sort((a, b) => a.place - b.place)) !== JSON.stringify((game?.results ?? []).map(({ team, place, elims }) => ({ team, place, elims })));
  const preview = useMemo(() => standings({ ...lobby, games: lobby.games.map((g) => (g.n === n ? { ...g, results: rows } : g)) }), [lobby, n, JSON.stringify(rows)]);
  const team = (id: string) => lobby.teams.find((t) => t.id === id)!;
  const set = (id: string, k: 'place' | 'elims', v: string) => setDraft((d) => ({ ...d, [id]: { ...d[id]!, [k]: v.replace(/\D/g, '').slice(0, 2) } }));
  const down = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const el = e.currentTarget, list = [...(grid.current?.querySelectorAll<HTMLInputElement>(`input[data-k="${el.dataset.k}"]`) ?? [])];
    const next = list[list.indexOf(el) + 1];
    if (next) { e.preventDefault(); next.focus(); next.select(); }
  };
  const canSave = rows.length > 0 && !dup.size && !outOfRange && changed;
  return (
    <div className="lb-grid">
      <section className="card" aria-label="Results">
        <div className="lb-head"><h2 className="title-sm">{word} {game.n}{game.map ? ` · ${game.map}` : ''}</h2>{changed && <span className="chip warn">Not saved</span>}<span style={{ flex: 1 }} />
          {!!game.results?.length && <button className="btn small" onClick={() => void run(() => air.lobbyClearResult(lobby.id, game.n))}>Clear</button>}
          <button className="btn primary small" disabled={!canSave} onClick={() => void run(() => air.lobbyResult(lobby.id, game.n, rows))}>Save and put on air</button></div>
        <div className="lb-games" role="tablist" aria-label={`${word}es`}>
          {lobby.games.map((g) => (
            <button key={g.n} role="tab" aria-selected={g.n === n} className={`lb-g ${g.results?.length ? 'done' : ''} ${g.n === n ? 'on' : ''}`} onClick={() => setN(g.n)}>
              {word} {g.n}{g.map ? ` · ${g.map}` : ''}<small>{g.results?.length ? 'Saved' : g.n === n ? 'Entering' : 'To play'}</small>
            </button>
          ))}
        </div>
        <div className="scroll-x"><table className="lb-tbl"><thead><tr><th>Team</th><th>Place</th><th>Elims</th><th className="r">Points</th></tr></thead>
          <tbody ref={grid}>{lobby.teams.map((t) => {
            const d = draft[t.id] ?? { place: '', elims: '' };
            const pts = d.place ? gamePoints({ team: t.id, place: Number(d.place), elims: Number(d.elims) || 0 }, lobby.scoring).total : null;
            return (
              <tr key={t.id}>
                <td className="tm"><Tag color={t.color} tag={t.tag} />{t.name}</td>
                <td><input className={`lb-n ${d.place && dup.has(Number(d.place)) ? 'dup' : ''}`} inputMode="numeric" data-k="place" aria-label={`${t.name} place`} value={d.place} onChange={(e) => set(t.id, 'place', e.target.value)} onKeyDown={down} /></td>
                <td><input className="lb-n" inputMode="numeric" data-k="elims" aria-label={`${t.name} elims`} value={d.elims} onChange={(e) => set(t.id, 'elims', e.target.value)} onKeyDown={down} /></td>
                <td className="r mono">{pts ?? <span className="faint">—</span>}</td>
              </tr>
            );
          })}</tbody></table></div>
        <div className="lb-foot" role="status">
          {!!dup.size && <span className="bad-text">Place {[...dup].join(', ')} is used twice.</span>}
          {outOfRange && <span className="bad-text">Places go from 1 to {lobby.teams.length}.</span>}
          <span>{missing ? `${missing} ${missing === 1 ? 'team still needs' : 'teams still need'} a place.` : 'Every team has a place.'}</span>
          <span style={{ flex: 1 }} /><span className="faint t-xs">Type down the column · Enter for the next team</span>
        </div>
      </section>
      <section className="card" aria-label="Standings">
        <div className="lb-head"><h2 className="title-sm">Standings</h2><span style={{ flex: 1 }} /><span className="chip">{changed ? 'with this draft' : `after ${lobby.games.filter((g) => g.results?.length).length} played`}</span></div>
        <table className="lb-st"><tbody>{preview.map((r) => (
          <tr key={r.team}><td className="faint">{r.rank}</td><td><Tag color={team(r.team).color} tag={team(r.team).tag} /> {team(r.team).name}{r.matchPoint && <span className="lb-mp">MATCH PT</span>}</td><td className="faint t-xs">{r.wins ? `${r.wins} win${r.wins > 1 ? 's' : ''}` : ''}</td><td className="r mono"><b>{r.total}</b></td></tr>
        ))}</tbody></table>
        <p className="faint t-xs" style={{ padding: '0 14px 12px' }}>Ties: {lobby.scoring.tiebreak.map((t) => ({ wins: 'wins', placementPts: 'placement points', elims: 'elims', lastGame: 'last match' })[t]).join(', then ')}. Saving puts it on the lobby’s graphics.</p>
      </section>
    </div>
  );
}

function Teams({ s, run, lobby }: { s: Snapshot; run: Run; lobby: Lobby }) {
  const [picked, setPicked] = useState<string[]>(lobby.teams.map((t) => t.teamId).filter((x): x is string => !!x));
  const [q, setQ] = useState('');
  const lib = s.library.teams.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()) || t.tag.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const same = JSON.stringify(picked) === JSON.stringify(lobby.teams.map((t) => t.teamId));
  return (
    <section className="card body-pad stack" style={{ gap: 12 }}>
      <div className="row g-2" style={{ flexWrap: 'wrap' }}>
        <input className="cell" type="search" placeholder="Search teams" aria-label="Search teams" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
        <span className="muted t-sm">{picked.length} picked{picked.length > 25 ? ' · a lobby has up to 25' : ''}</span>
        <span style={{ flex: 1 }} />
        <button className="btn primary small" disabled={same || picked.length > 25} onClick={() => void run(() => air.lobbyTeams(lobby.id, picked))}>Save teams</button>
      </div>
      {!s.library.teams.length && <p className="muted">No teams yet. Add them in Teams/Players.</p>}
      <div className="lb-teams">
        {lib.map((t) => (
          <label key={t.id} className={`lb-team ${picked.includes(t.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />
            <Tag color={t.color} tag={t.tag} /><span>{t.name}</span>
            {picked.includes(t.id) && <small className="faint">#{picked.indexOf(t.id) + 1}</small>}
          </label>
        ))}
      </div>
      <p className="faint t-xs">Teams keep following Teams/Players: renaming a team or changing its players there updates this lobby. Results stay with the team.</p>
    </section>
  );
}

function Games({ run, lobby, word }: { run: Run; lobby: Lobby; word: string }) {
  const [games, setGames] = useState(lobby.games.map((g) => ({ map: g.map, startsAt: g.startsAt ?? '' })));
  const maps = MAPS[lobby.game] ?? [];
  const same = JSON.stringify(games) === JSON.stringify(lobby.games.map((g) => ({ map: g.map, startsAt: g.startsAt ?? '' })));
  const played = (i: number) => !!lobby.games[i]?.results?.length;
  return (
    <section className="card body-pad stack" style={{ gap: 10 }}>
      <datalist id="lb-maps">{maps.map((m) => <option key={m} value={m} />)}</datalist>
      {games.map((g, i) => (
        <div key={i} className="row g-2">
          <b style={{ width: 90 }}>{word} {i + 1}</b>
          <input className="cell" list="lb-maps" placeholder="Map" aria-label={`${word} ${i + 1} map`} value={g.map} maxLength={30} onChange={(e) => setGames((x) => x.map((y, j) => (j === i ? { ...y, map: e.target.value } : y)))} style={{ maxWidth: 200 }} />
          <input className="cell" placeholder="Time, e.g. 19:40" aria-label={`${word} ${i + 1} time`} value={g.startsAt} maxLength={20} onChange={(e) => setGames((x) => x.map((y, j) => (j === i ? { ...y, startsAt: e.target.value } : y)))} style={{ maxWidth: 160 }} />
          {played(i) && <span className="chip ok">Results saved</span>}
        </div>
      ))}
      <div className="row g-2">
        <button className="btn small" disabled={games.length >= 24} onClick={() => setGames((x) => [...x, { map: '', startsAt: '' }])}>+ Add {word.toLowerCase()}</button>
        <button className="btn small" disabled={games.length <= 1 || played(games.length - 1)} title={played(games.length - 1) ? 'The last one already has results' : undefined} onClick={() => setGames((x) => x.slice(0, -1))}>Remove the last</button>
        <span style={{ flex: 1 }} />
        <button className="btn primary small" disabled={same} onClick={() => void run(() => air.lobbyUpdate(lobby.id, { games }))}>Save</button>
      </div>
    </section>
  );
}

function ScoringTab({ run, lobby }: { run: Run; lobby: Lobby }) {
  const [sc, setSc] = useState<Scoring>(lobby.scoring);
  const [places, setPlaces] = useState(lobby.scoring.placement.join(', '));
  const parsed = places.split(/[\s,]+/).filter(Boolean).map(Number);
  const bad = !parsed.length || parsed.some((x) => !Number.isInteger(x) || x < 0 || x > 100);
  const next: Scoring = { ...sc, placement: bad ? sc.placement : parsed };
  const same = JSON.stringify(next) === JSON.stringify(lobby.scoring);
  const preset = (k: keyof typeof SCORING_PRESETS) => { const p = SCORING_PRESETS[k].scoring; setSc({ ...p, ...(sc.matchPoint ? { matchPoint: sc.matchPoint } : {}) }); setPlaces(p.placement.join(', ')); };
  return (
    <section className="card body-pad stack" style={{ gap: 12, maxWidth: 640 }}>
      <div className="row g-2"><span className="cap">Start from</span>{(Object.keys(SCORING_PRESETS) as Array<keyof typeof SCORING_PRESETS>).map((k) => <button key={k} className="btn small" onClick={() => preset(k)}>{SCORING_PRESETS[k].name}</button>)}</div>
      <label className="stack g-1"><span className="cap">Points for 1st, 2nd, 3rd…</span><input className={`cell ${bad ? 'bad' : ''}`} value={places} onChange={(e) => setPlaces(e.target.value)} aria-invalid={bad} /></label>
      <div className="row g-2" style={{ flexWrap: 'wrap' }}>
        <label className="stack g-1"><span className="cap">Points per elim</span><input className="cell" type="number" min={0} max={10} value={sc.perElim} onChange={(e) => setSc({ ...sc, perElim: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} /></label>
        <label className="stack g-1"><span className="cap">Elim cap per match · optional</span><input className="cell" type="number" min={0} max={100} value={sc.elimCap ?? ''} onChange={(e) => { const v = e.target.value; setSc(({ elimCap: _x, ...rest }) => (v === '' ? rest : { ...rest, elimCap: Number(v) })); }} /></label>
        <label className="stack g-1"><span className="cap">Match point · optional</span><input className="cell" type="number" min={1} max={1000} value={sc.matchPoint ?? ''} onChange={(e) => { const v = e.target.value; setSc(({ matchPoint: _x, ...rest }) => (v === '' ? rest : { ...rest, matchPoint: Number(v) })); }} /></label>
      </div>
      <p className="faint t-xs">Match point: a team at or over it that then wins a match takes the title (PMGC Smash, FFWS Champions Rush). Scoring rules differ per event; check yours.</p>
      <div><button className="btn primary small" disabled={same || bad} onClick={() => void run(() => air.lobbyUpdate(lobby.id, { scoring: next }))}>Save scoring</button></div>
    </section>
  );
}

/** The event's Lobbies tab (lobby games): its lobbies and New lobby. */
export function LobbyList({ s, run, eventId, open }: { s: Snapshot; run: Run; eventId: string; open: (id: string) => void }) {
  const lobbies = s.lobbies.filter((l) => l.eventId === eventId);
  const game = gameOf(s.setup.game);
  const [name, setName] = useState('');
  const [count, setCount] = useState(6);
  return (
    <section className="stack" style={{ gap: 10 }}>
      <div className="card body-pad row g-2" style={{ flexWrap: 'wrap' }}>
        <input className="cell" placeholder="Lobby name, e.g. Group A · Day 2" aria-label="Lobby name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 300 }} />
        <label className="row g-1"><span className="muted t-sm">{game?.words?.game ?? 'Match'}es</span><input className="cell" type="number" min={1} max={24} value={count} onChange={(e) => setCount(Math.max(1, Math.min(24, Number(e.target.value) || 1)))} style={{ width: 70 }} aria-label="Number of matches" /></label>
        <button className="btn primary" onClick={() => void run(async () => { await air.lobbyCreate({ eventId, game: s.setup.game!, title: name.trim() || 'Lobby', games: count }); setName(''); })}>New lobby</button>
      </div>
      {!lobbies.length && <p className="muted ap-empty">No lobbies in this event yet.</p>}
      <div className="lst">
        {lobbies.map((l) => {
          const done = l.games.filter((g) => g.results?.length).length;
          const lead = standings(l)[0];
          const leader = done && lead ? l.teams.find((t) => t.id === lead.team) : null;
          return (
            <div key={l.id} className="li ev-match" aria-current={s.selectedLobbyId === l.id ? 'true' : undefined}>
              <span className="mono t-sm">{done}/{l.games.length}</span>
              <button className="ev-match-open" onClick={() => open(l.id)}><b>{l.title}</b></button>
              <span className="muted t-sm">{l.teams.length} teams{leader ? ` · ${leader.name} leads on ${lead!.total}` : ''}</span>
              <span className={`state ${s.selectedLobbyId === l.id ? 'ok' : ''}`}><i className={`dot ${s.selectedLobbyId === l.id ? 'ok' : 'off'}`} />{s.selectedLobbyId === l.id ? 'On the graphics' : 'Ready'}</span>
              <span className="row-gap"><button className="btn small" onClick={() => open(l.id)}>Open</button><button className="btn quiet small danger" onClick={() => void run(() => air.lobbyDelete(l.id))}>Delete</button></span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
