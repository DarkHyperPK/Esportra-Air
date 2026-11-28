// Start day N (27 Nov, approved mock 2): the same checks every day. Roster changes since the last day, the points carried
// in, the data checks, the day's matches, and a saved starting point. Nothing starts by itself: Start arms the first match
// and game data stays off until the producer ticks consent on Live.
import { useEffect, useState } from 'react';
import type { Lobby, Snapshot } from '../../../shared/api.ts';
import type { DayStart } from '../../../main/br-run.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { TeamTag, matchTime } from './parts.tsx';
import { ReadinessStrip } from '../br-prep/Readiness.tsx';

const Row = ({ ok, title, note, aside }: { ok: boolean | null; title: string; note?: string; aside?: string }) => (
  <div className="run-check"><i className={`run-tick ${ok === null ? 'na' : ok ? 'ok' : 'warn'}`}>{ok === null ? '–' : ok ? '✓' : '!'}</i><span><b>{title}</b>{note && <><br /><span className="muted t-sm">{note}</span></>}</span>{aside && <span className="faint t-sm">{aside}</span>}</div>
);

export function StartDay({ s, run, lobby, dayId, close }: { s: Snapshot; run: Run; lobby: Lobby; dayId: string; close: () => void }) {
  const [d, setD] = useState<DayStart | null>(null);
  const [error, setError] = useState('');
  const [all, setAll] = useState(false);
  useEffect(() => { air.lobbyDayStart(lobby.id, dayId).then(setD, (e: Error) => setError(e.message)); }, [lobby.id, dayId, lobby.games.map((g) => g.state).join()]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && close(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [close]);
  const table = d ? (all ? d.standingsIn : d.standingsIn.slice(0, 8)) : [];
  const pcobOk = d?.data.pcob === 'live' || d?.data.pcob === 'waiting';
  return (
    <div className="scrim right" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="editor match-drawer" role="dialog" aria-modal="true" aria-label={`Start ${d?.day.title ?? 'day'}`}>
        <header><h2 className="title-md">Start {d?.day.title ?? 'day'}</h2><button className="btn quiet small" onClick={close}>Esc</button></header>
        <div className="editor-body">
          {error && <div className="notice bad" role="alert">{error}</div>}
          {d && (
            <>
              <p className="muted t-sm">{d.day.date}{d.day.opensAt ? ` · doors ${d.day.opensAt}` : ''} · {lobby.title} · {d.matches.length} matches. The same checks open every day.</p>
              <section className="card run-sec"><h3 className="cap">1 · Roster changes since the last day · {d.roster.length}</h3>
                {d.roster.length ? d.roster.map((r) => <Row key={r.at + r.team} ok title={r.name} note={`${r.added.length ? `In: ${r.added.join(', ')}. ` : ''}${r.removed.length ? `Out: ${r.removed.join(', ')}.` : ''}`} />) : <Row ok={null} title="No roster changes recorded" note="Changes made in Teams/Players after the last day show here." />}
              </section>
              <section className="card run-sec"><h3 className="cap">2 · Points carried in</h3>
                <table className="lb-st"><tbody>{table.map((r) => <tr key={r.team}><td className="faint">{r.rank}</td><td><TeamTag lobby={lobby} id={r.team} /></td><td className="r mono"><b>{r.total}</b></td></tr>)}</tbody></table>
                {d.standingsIn.length > 8 && <button className="btn quiet small" onClick={() => setAll(!all)}>{all ? 'Show top 8' : `Show all ${d.standingsIn.length}`}</button>}
              </section>
              <section className="card run-sec"><h3 className="cap">3 · Data checks</h3>
                <Row ok={pcobOk} title={pcobOk ? 'Game data connected' : 'Game data not connected'} note={pcobOk ? 'Reading the observer PC.' : 'Connect on Live (with the consent tick). Nothing starts by itself.'} />
                <Row ok={!d.data.test} title={d.data.test ? 'A test is running' : 'No test running'} note={d.data.test ? 'Stop it before the show.' : undefined} />
              </section>
              <section className="card run-sec"><h3 className="cap">3b · Ready before the show</h3>
                <ReadinessStrip s={s} lobby={lobby} compact />
                <span className="faint t-xs">Nothing here stops the day: a missing UID or map is flagged, never blocked.</span>
              </section>
              <section className="card run-sec"><h3 className="cap">4 · Run sheet · {d.matches.length} matches</h3>
                {d.matches.map((m) => <div key={m.id} className="run-check"><b className="mono">M{m.n}</b><span>{m.map || 'Map to be announced'} <span className="faint">{matchTime(lobby.games.find((g) => g.id === m.id)!)}</span></span><span className="faint t-sm">{m.state}</span></div>)}
              </section>
              <section className="card run-sec"><h3 className="cap">5 · Backup</h3>
                <Row ok title="The starting point is saved when you start" note="Roster, points and run sheet go to the event journal and a daily copy on this PC." />
                <button className="btn small" onClick={() => void air.eventExport(lobby.eventId)}>Save event file now</button>
              </section>
              {d.problems.map((p) => <div key={p} className="notice bad" role="alert">{p}</div>)}
            </>
          )}
        </div>
        <footer><span className="muted t-sm">{d?.problems.length ? 'Fix what is listed first.' : 'Starting arms the first match. Game data stays off until you tick consent on Live.'}</span>
          <span className="row-gap"><button className="btn" onClick={close}>Not yet</button>
            <button className="btn primary" disabled={!d || d.problems.length > 0} onClick={() => void run(async () => { await air.lobbyDayStart(lobby.id, dayId, true); close(); })}>{d?.started ? 'Arm the first match' : `Start ${d?.day.title.toLowerCase() ?? 'day'}`}</button></span></footer>
      </div>
    </div>
  );
}
