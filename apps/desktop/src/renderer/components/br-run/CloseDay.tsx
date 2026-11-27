// Close day N (27 Nov, approved mock 7): the standings after the day, the day's MVP and top fraggers, every match, every
// adjustment and edit. Refused while a match is not confirmed or void. Print summary prints this page.
import { useEffect, useState } from 'react';
import type { Lobby, Snapshot } from '../../../shared/api.ts';
import type { DaySummary } from '../../../shared/br-run.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { StateBadge, TeamTag } from './parts.tsx';

type Check = DaySummary & { problems: string[] };

export function CloseDay({ run, lobby, dayId, close }: { s: Snapshot; run: Run; lobby: Lobby; dayId: string; close: () => void }) {
  const [d, setD] = useState<Check | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { air.lobbyDayClose(lobby.id, dayId).then(setD, (e: Error) => setError(e.message)); }, [lobby.id, dayId, lobby.games.map((g) => g.state).join(), (lobby.adjustments ?? []).length]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && close(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [close]);
  const closed = !!lobby.days?.find((x) => x.id === dayId)?.closedAt;
  const name = (id: string) => lobby.teams.find((t) => t.id === id)?.name ?? id;
  const print = () => { document.body.classList.add('print-run'); window.print(); setTimeout(() => document.body.classList.remove('print-run'), 500); };
  return (
    <div className="scrim right" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="editor match-drawer run-print" role="dialog" aria-modal="true" aria-label={`Close ${d?.day.title ?? 'day'}`}>
        <header><h2 className="title-md">{closed ? '' : 'Close '}{d?.day.title ?? 'day'} · {lobby.title}</h2><button className="btn quiet small" onClick={close}>Esc</button></header>
        <div className="editor-body">
          {error && <div className="notice bad" role="alert">{error}</div>}
          {d && (
            <>
              <p className="muted t-sm">{d.day.date} · {d.matches.length} matches. This is what goes on the record for the day.</p>
              <section className="card run-sec"><h3 className="cap">Before you close · {d.problems.length ? `${d.problems.length} to fix` : 'all clear'}</h3>
                {d.problems.length === 0 && <div className="run-check"><i className="run-tick ok">✓</i><span><b>Every match is confirmed or void</b><br /><span className="muted t-sm">{d.matches.filter((m) => m.state === 'confirmed').length} confirmed, {d.matches.filter((m) => m.state === 'void').length} void.</span></span></div>}
                {d.problems.map((p) => <div key={p} className="run-check"><i className="run-tick warn">!</i><span><b>{p}</b></span></div>)}
                <div className="run-check"><i className={`run-tick ${d.edits.length ? 'ok' : 'na'}`}>{d.edits.length ? '✓' : '–'}</i><span><b>{d.edits.length} edit{d.edits.length === 1 ? '' : 's'} after confirm</b>{d.edits.map((e) => <><br key={e.at} /><span className="muted t-sm">Match {e.n} · “{e.reason}”</span></>)}</span></div>
                <div className="run-check"><i className={`run-tick ${d.adjustments.length ? 'ok' : 'na'}`}>{d.adjustments.length ? '✓' : '–'}</i><span><b>{d.adjustments.length} adjustment{d.adjustments.length === 1 ? '' : 's'}</b>{d.adjustments.map((a) => <><br key={a.id} /><span className="muted t-sm">{name(a.team)} {a.points > 0 ? '+' : ''}{a.points} · “{a.reason}”</span></>)}</span></div>
              </section>
              <div className="run-two">
                <section className="card run-sec"><h3 className="cap">Standings after {d.day.title} <span className="pill ok">Official</span></h3>
                  <table className="lb-st"><thead><tr><th>#</th><th>Team</th><th className="r">Day</th><th className="r">Adj</th><th className="r">Total</th></tr></thead>
                    <tbody>{d.table.map((r) => <tr key={r.team}><td className="faint">{r.rank}</td><td><TeamTag lobby={lobby} id={r.team} /></td><td className="r mono">{r.today}</td><td className="r mono">{r.adjusted || '–'}</td><td className="r mono"><b>{r.total}</b></td></tr>)}</tbody></table>
                </section>
                <div className="stack" style={{ gap: 12 }}>
                  <section className="card run-sec"><h3 className="cap">Day MVP</h3>{d.mvp ? <p><b>{d.mvp.name}</b>{d.mvp.team && <span className="muted"> · {name(d.mvp.team)}</span>}<br /><span className="muted t-sm">{d.mvp.kills} elims · {d.mvp.damage.toLocaleString()} damage</span></p> : <p className="faint t-sm">Comes from the observer PC’s numbers; none were saved today.</p>}</section>
                  <section className="card run-sec"><h3 className="cap">Top fraggers</h3>{d.fraggers.length ? d.fraggers.map((f, i) => <div key={f.name} className="between t-sm"><span>{i + 1} · {f.name}{f.team && <span className="muted"> · {name(f.team)}</span>}</span><b className="mono">{f.kills}</b></div>) : <p className="faint t-sm">No player numbers saved.</p>}</section>
                  <section className="card run-sec"><h3 className="cap">The day’s matches</h3>{d.matches.map((m) => <div key={m.n} className="between t-sm"><span><b className="mono">M{m.n}</b> {m.map}{m.winner && <span className="muted"> · {name(m.winner)} · {m.kills} kills</span>}{m.attempts > 1 && <span className="faint"> · {m.attempts} attempts</span>}</span><StateBadge state={m.state} /></div>)}</section>
                </div>
              </div>
            </>
          )}
        </div>
        <footer><span className="muted t-sm">{closed ? 'Closed. Reopen it from the run sheet if something changes.' : 'Closing locks the day; you can reopen it from the run sheet.'}</span>
          <span className="row-gap"><button className="btn" onClick={print}>Print summary</button><button className="btn" onClick={() => void air.eventExport(lobby.eventId)}>Save event file</button>
            {!closed && <button className="btn primary" disabled={!d || d.problems.length > 0} onClick={() => void run(async () => { await air.lobbyDayClose(lobby.id, dayId, true); close(); })}>Close {d?.day.title.toLowerCase() ?? 'day'}</button>}</span></footer>
      </div>
    </div>
  );
}
