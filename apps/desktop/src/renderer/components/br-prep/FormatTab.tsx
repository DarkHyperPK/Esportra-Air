// A lobby's Format (28 Nov, approved mock "Format"): the lobby's teams, its days, the match generator (how many, when the
// first starts, the gap, the map rotation), each match's time and map, the points table, and Copy this lobby.
import { useEffect, useState } from 'react';
import type { Lobby, Snapshot } from '../../../shared/api.ts';
import { gameState } from '../../../shared/br.ts';
import { parseTime, slotsOf } from '../../../shared/br-format.ts';
import { nextTitle } from '../../../shared/br-format.ts';
import { matchesOfDay } from '../../../shared/br-run.ts';
import { gameOf } from '../../../shared/games.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { PointsTable } from './PointsTable.tsx';

const free = (g: Lobby['games'][number]) => gameState(g) === 'scheduled' && !g.results?.length;

export function FormatTab({ s, run, lobby, goTeams }: { s: Snapshot; run: Run; lobby: Lobby; goTeams: () => void }) {
  const game = gameOf(lobby.game);
  const pool = game?.maps ?? [];
  const days = lobby.days ?? [];
  const [dayId, setDayId] = useState(days[0]?.id ?? '');
  const day = days.find((d) => d.id === dayId) ?? days[0];
  const matches = day ? matchesOfDay(lobby, day) : [];
  const [count, setCount] = useState(String(matches.length || 6));
  const [start, setStart] = useState(matches[0]?.scheduledAt ?? '16:00');
  const [gap, setGap] = useState('30');
  const [rot, setRot] = useState<string[]>(() => [...new Set(matches.map((g) => g.map).filter(Boolean))].slice(0, 6).concat(pool).filter((m, i, a) => a.indexOf(m) === i).slice(0, 3));
  const [copying, setCopying] = useState(false);
  const [title, setTitle] = useState('');
  // Another day shows its own numbers.
  useEffect(() => { setCount(String(matches.length || 6)); setStart(matches[0]?.scheduledAt ?? '16:00'); }, [day?.id]);
  if (!day) return <section className="card body-pad"><p className="muted">This lobby has no day yet. Add one on the Run sheet.</p></section>;
  const n = Number(count), g = Number(gap);
  const valid = Number.isInteger(n) && n >= 1 && n <= 24 && parseTime(start) !== null && Number.isInteger(g) && g >= 0 && g <= 600;
  const preview = valid ? slotsOf({ count: n, start, gap: g, maps: rot }) : [];
  const saveGame = (num: number, patch: { map?: string; startsAt?: string }) => run(() => air.lobbyUpdate(lobby.id, { games: lobby.games.map((x) => ({ map: x.n === num ? patch.map ?? x.map : x.map, startsAt: x.n === num ? patch.startsAt ?? x.startsAt ?? '' : x.startsAt ?? '' })) }));
  const moveMap = (i: number, d: -1 | 1) => setRot((r) => { const t = [...r]; const j = i + d; if (j < 0 || j >= t.length) return r; [t[i], t[j]] = [t[j]!, t[i]!]; return t; });
  const missing = matches.filter((m) => !m.map.trim()).length;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card body-pad stack g-2" aria-label="Lobby">
        <div className="between">
          <div><h2 className="title-md">{lobby.title} · {day.title}</h2><span className="muted t-sm">{[lobby.stage, `${lobby.teams.length} teams`, `${matches.length} matches`, day.date].filter(Boolean).join(' · ')}</span></div>
          {!copying
            ? <button className="btn" onClick={() => { setCopying(true); setTitle(nextTitle(lobby.title)); }}>Copy this lobby</button>
            : <form className="row g-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await air.lobbyCopy(lobby.id, title); setCopying(false); }); }}>
                <input className="cell" autoFocus aria-label="Name of the new lobby" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
                <button className="btn primary small" disabled={!title.trim()}>Copy</button><button type="button" className="btn quiet small" onClick={() => setCopying(false)}>Cancel</button></form>}
        </div>
        <div className="rb-chips" role="tablist" aria-label="Days">
          {days.map((d) => <button key={d.id} role="tab" type="button" className="rb-chip" aria-selected={d.id === day.id} aria-pressed={d.id === day.id} onClick={() => setDayId(d.id)}>{d.title} · {d.matchIds.length}</button>)}
          <button type="button" className="rb-chip" onClick={() => void run(async () => { await air.lobbyDayAdd(lobby.id, {}); })}>+ Day</button>
        </div>
        <div className="row g-2" style={{ flexWrap: 'wrap' }}>
          <span className="cap">Teams in this lobby · {lobby.teams.length}</span>
          {lobby.teams.map((t) => <span key={t.id} className="pp-chip"><span className="lb-tag" style={{ background: t.color || '#555' }}>{t.tag}</span>{t.name}</span>)}
          <button className="btn quiet small" onClick={goTeams}>Edit teams</button>
        </div>
      </section>
      <div className="pp-two">
        <section className="card body-pad stack g-2" aria-label="Matches">
          <div className="between"><span className="cap">Matches · {matches.length}</span><span className="faint t-xs">{day.closedAt ? 'Day closed' : ''}</span></div>
          <div className="row g-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="stack g-1"><span className="cap">Matches</span><input className="cell mono" inputMode="numeric" aria-label="Number of matches" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 2))} style={{ width: 70 }} /></label>
            <label className="stack g-1"><span className="cap">First match</span><input className="cell mono" aria-label="First match starts at" placeholder="16:00" value={start} onChange={(e) => setStart(e.target.value.replace(/[^\d:]/g, '').slice(0, 5))} style={{ width: 90 }} /></label>
            <label className="stack g-1"><span className="cap">Every</span><span className="row g-1"><input className="cell mono" inputMode="numeric" aria-label="Minutes between matches" value={gap} onChange={(e) => setGap(e.target.value.replace(/\D/g, '').slice(0, 3))} style={{ width: 70 }} /><span className="muted t-sm">min</span></span></label>
            <button className="btn primary" disabled={!valid || !!day.closedAt} onClick={() => void run(() => air.lobbyFormat(lobby.id, day.id, { count: n, start, gap: g, maps: rot }))}>Fill the list</button>
          </div>
          <span className="cap">Map rotation · repeats</span>
          <div className="row g-2" style={{ flexWrap: 'wrap' }}>
            {rot.map((m, i) => <span key={`${m}${i}`} className="pp-tie"><b>{i + 1}</b> {m}<button type="button" aria-label={`Move ${m} earlier`} disabled={i === 0} onClick={() => moveMap(i, -1)}>‹</button><button type="button" aria-label={`Move ${m} later`} disabled={i === rot.length - 1} onClick={() => moveMap(i, 1)}>›</button><button type="button" aria-label={`Remove ${m}`} onClick={() => setRot((r) => r.filter((_, j) => j !== i))}>×</button></span>)}
            <select className="cell" aria-label="Add a map to the rotation" value="" onChange={(e) => { if (e.target.value) setRot((r) => [...r, e.target.value]); }} style={{ width: 130 }}><option value="">+ Map</option>{pool.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          </div>
          {!rot.length && <span className="warn-text t-xs">With no map in the rotation the matches are made without maps; type each one below.</span>}
          {valid && <span className="faint t-xs">Will make: {preview.map((p) => `${p.time}${p.map ? ` ${p.map}` : ''}`).join(' · ')}</span>}
          <div className="pp-matches">
            {matches.map((m) => (
              <div key={m.id} className={`pp-match ${m.map.trim() ? '' : 'nomap'}`}>
                <b>Match {m.n}</b>
                <input className="cell mono" aria-label={`Match ${m.n} time`} defaultValue={m.scheduledAt ?? m.startsAt ?? ''} key={`${m.id}${m.scheduledAt}`} disabled={!free(m)} placeholder="16:00" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (m.scheduledAt ?? m.startsAt ?? '')) void saveGame(m.n, { startsAt: v }); }} style={{ width: 90 }} />
                <select className="cell" aria-label={`Match ${m.n} map`} value={m.map} disabled={!free(m)} onChange={(e) => void saveGame(m.n, { map: e.target.value })}>
                  <option value="">Map not set yet</option>
                  {[...new Set([...pool, ...(m.map ? [m.map] : [])])].map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
                {!free(m) && <span className="faint t-xs">{gameState(m)}</span>}
              </div>
            ))}
          </div>
          <p className="faint t-xs">Time and map stay editable after filling.{missing ? ` ${missing === 1 ? 'One match has' : `${missing} matches have`} no map yet: it shows as “Map to be announced”. Air never blocks the show over a missing map; it only flags it.` : ''}</p>
        </section>
        <PointsTable s={s} run={run} lobby={lobby} />
      </div>
    </div>
  );
}
