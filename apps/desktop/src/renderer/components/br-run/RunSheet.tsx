// Events › lobby › Run sheet (27 Nov, approved mock): the days of the event as columns, each with its matches in run
// order, their states, and Start day / Close day. Matches move between days here; maps and times are in Matches and maps.
import { useState } from 'react';
import type { Lobby, Snapshot } from '../../../shared/api.ts';
import { gameState, type LobbyDay } from '../../../shared/br.ts';
import { isBusy, matchesOfDay, standingsView } from '../../../shared/br-run.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { StateBadge, matchLabel } from './parts.tsx';
import { StartDay } from './StartDay.tsx';
import { CloseDay } from './CloseDay.tsx';

const today = () => new Date().toISOString().slice(0, 10);

function DayHead({ lobby, day, run }: { lobby: Lobby; day: LobbyDay; run: Run }) {
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(day.title), [date, setDate] = useState(day.date), [opens, setOpens] = useState(day.opensAt ?? '');
  const games = matchesOfDay(lobby, day);
  const confirmed = games.filter((g) => gameState(g) === 'confirmed').length;
  const status = day.closedAt ? 'Closed' : day.startedAt ? 'Started' : day.date === today() ? 'Today' : day.date > today() ? 'Upcoming' : 'Not started';
  return (
    <div className="run-day-head">
      <div className="between"><h3 className="title-sm">{day.title}</h3><span className={`pill ${day.closedAt ? 'ok' : day.startedAt ? 'warn' : ''}`}>{status}</span></div>
      <div className="faint t-sm">{day.date}{day.opensAt ? ` · doors ${day.opensAt}` : ''} <button className="btn quiet small" onClick={() => setEdit(!edit)}>{edit ? 'Close' : 'Edit'}</button></div>
      {edit && (
        <div className="row-gap" style={{ flexWrap: 'wrap' }}>
          <input className="cell" aria-label="Day name" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} style={{ width: 120 }} />
          <input className="cell" aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
          <input className="cell" aria-label="Doors open" placeholder="15:30" value={opens} onChange={(e) => setOpens(e.target.value)} style={{ width: 80 }} />
          <button className="btn primary small" onClick={() => void run(async () => { await air.lobbyDayEdit(lobby.id, day.id, { title, date, opensAt: opens }); setEdit(false); })}>Save</button>
        </div>
      )}
      <div className="pill-row" style={{ padding: 0 }}><span className="pill">{confirmed} of {games.length} confirmed</span></div>
    </div>
  );
}

function Column({ lobby, day, run, start, close }: { lobby: Lobby; day: LobbyDay; run: Run; start: () => void; close: () => void }) {
  const games = matchesOfDay(lobby, day);
  const busy = isBusy(lobby);
  const open = games.some((g) => !['confirmed', 'void'].includes(gameState(g)));
  return (
    <section className={`card run-day ${day.closedAt ? 'ok' : ''}`} aria-label={day.title}>
      <DayHead lobby={lobby} day={day} run={run} />
      <div className="run-matches">
        {!games.length && <p className="faint t-sm" style={{ padding: '10px 14px' }}>No matches in this day. Move one here from another day.</p>}
        {games.map((g) => {
          const st = gameState(g);
          return (
            <div key={g.id} className={`run-match ${st}`}>
              <b className="mono">M{g.n}</b>
              <span className="run-match-name">{matchLabel(g)}{st === 'void' && g.voidReason ? <span className="faint t-xs"> · {g.voidReason}</span> : null}{g.edits?.length ? <span className="faint t-xs"> · {g.edits.length} edit{g.edits.length > 1 ? 's' : ''}</span> : null}</span>
              <StateBadge state={st} attempt={g.attempts?.length} />
              <select className="cell run-move" aria-label={`Move match ${g.n} to another day`} value={day.id} disabled={st === 'live' || st === 'finishing'} onChange={(e) => void run(async () => { const to = lobby.days!.find((d) => d.id === e.target.value)!; await air.lobbyDayEdit(lobby.id, to.id, { matchIds: [...to.matchIds, g.id!] }); })}>
                {lobby.days!.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
              {(st === 'scheduled' || st === 'void') && <button className="btn quiet small" disabled={busy || !!day.closedAt} onClick={() => void run(async () => { await air.lobbyArm(lobby.id, g.id!); })}>Arm</button>}
            </div>
          );
        })}
      </div>
      <div className="run-day-foot">
        {day.closedAt ? (
          <><button className="btn small" onClick={close}>Day summary</button><button className="btn quiet small" onClick={() => void run(async () => { await air.lobbyDayEdit(lobby.id, day.id, { reopen: true }); })}>Reopen day</button></>
        ) : day.startedAt ? (
          <button className="btn primary" onClick={close} disabled={!games.length}>Close {day.title.toLowerCase()}</button>
        ) : (
          <button className="btn primary" onClick={start} disabled={!games.length}>Start {day.title.toLowerCase()}</button>
        )}
        {!day.closedAt && open && day.startedAt && <span className="faint t-xs">{games.filter((g) => !['confirmed', 'void'].includes(gameState(g))).length} not confirmed or void yet</span>}
      </div>
    </section>
  );
}

export function RunSheet({ s, run, lobby }: { s: Snapshot; run: Run; lobby: Lobby }) {
  const [start, setStart] = useState<string | null>(null);
  const [close, setClose] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const days = lobby.days ?? [];
  const view = standingsView(lobby);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="card body-pad row g-2" style={{ flexWrap: 'wrap' }}>
        <span className="muted t-sm">Points {lobby.scoring.placement.join('-')} and {lobby.scoring.perElim} per elim, carried across days.{view.provisionalGames.length ? ` Match ${view.provisionalGames.join(', ')} provisional.` : ''}</span>
        <span style={{ flex: 1 }} />
        <input className="cell" type="date" aria-label="Date of the new day" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
        <button className="btn small" onClick={() => void run(async () => { await air.lobbyDayAdd(lobby.id, { date }); })}>Add a day</button>
        <button className="btn small" onClick={() => void air.eventExport(lobby.eventId)}>Save event file</button>
      </div>
      <div className="run-days">
        {days.map((d) => <Column key={d.id} lobby={lobby} day={d} run={run} start={() => setStart(d.id)} close={() => setClose(d.id)} />)}
      </div>
      <section className="card body-pad run-legend" aria-label="What each match state means">
        <h3 className="cap">What each match state means</h3>
        <p className="muted t-sm">A match moves one step at a time. Remake and Void are the two ways out.</p>
        <div className="run-legend-grid">
          {(['confirmed', 'provisional', 'live', 'armed', 'scheduled', 'void'] as const).map((st) => <div key={st}><StateBadge state={st} /><span className="muted t-sm">{legend[st]}</span></div>)}
        </div>
      </section>
      {start && <StartDay s={s} run={run} lobby={lobby} dayId={start} close={() => setStart(null)} />}
      {close && <CloseDay s={s} run={run} lobby={lobby} dayId={close} close={() => setClose(null)} />}
    </div>
  );
}

const legend = {
  confirmed: 'Locked. Counts in the official standings.', provisional: 'Saved from the game, not yet confirmed. Shown marked on standings.', live: 'The game is being read now.',
  armed: 'Air will save game data into this match, and only this one.', scheduled: 'On the run sheet, not armed yet.', void: 'Cancelled on purpose. Not counted, and the day can still close.',
} as const;
