// Live › the match strip (27 Nov, approved mock): which match Air is reading, its state, and what the producer can do with
// it: Arm another, Skip (void with a reason), Remake, End match, Confirm. The warnings that matter while live are here too:
// a game with nothing armed, a game that ended before a winner, no data for 10 s, and the resume prompt after a restart.
import { useEffect, useState } from 'react';
import type { Lobby, Snapshot } from '../../../shared/api.ts';
import { gameState, type LobbyGame } from '../../../shared/br.ts';
import { armedMatch, liveMatch, matchesOfDay, targetMatch } from '../../../shared/br-run.ts';
import { keyLabel, keyOf } from '../../../shared/keymap.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { DayChips, StateBadge, matchLabel } from './parts.tsx';

type Ask = null | { kind: 'void' | 'remake' | 'end'; id: string };

/** "No data for N s", counting while the warning is up. */
function useSeconds(since: number | null, on: boolean) {
  const [, tick] = useState(0);
  useEffect(() => { if (!on) return; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, [on]);
  return since ? Math.max(0, Math.round((Date.now() - since) / 1000)) : 0;
}

function Resume({ s, run }: { s: Snapshot; run: Run }) {
  const r = s.brResume;
  if (!r) return null;
  return (
    <div className="notice run-warn" role="status">
      <span><b>Air closed {r.n ? `during Match ${r.n}` : 'while the autopilot was running'}.</b> Resume?{' '}
        <span className="muted">{r.n ? `Resume carries on with ${r.title}: ${r.placed} teams out, ${r.moments} moments already shown (they will not fire again). ` : ''}{r.autopilot.length ? `Autopilot carries on with ${r.autopilot.join(', ')}. ` : ''}Game data still needs your consent: connect it again.</span></span>
      <span className="row-gap"><button className="btn primary small" onClick={() => void run(async () => { await air.lobbyResume(); })}>Resume</button><button className="btn small" onClick={() => void run(async () => { await air.lobbyResumeDismiss(); })}>Not now</button></span>
    </div>
  );
}

function Hints({ s, run, l }: { s: Snapshot; run: Run; l: Lobby }) {
  const p = s.pcob;
  const live = liveMatch(l);
  const next = l.games.find((g) => gameState(g) === 'scheduled');
  const secs = useSeconds(p.lastChangeAt, p.noData);
  return (
    <>
      {p.unarmed && (
        <div className="notice run-warn" role="status">
          <span><b>A game started but no match is armed.</b> {next ? `Arm Match ${next.n}?` : 'Add or reopen a match to save it.'} <span className="muted">Air is reading it and keeping the data in memory; nothing is saved until a match is armed.</span></span>
          {next && <button className="btn primary small" onClick={() => void run(async () => { await air.lobbyArm(l.id, next.id!); })}>Arm Match {next.n}</button>}
        </div>
      )}
      {live && p.noWinner && (
        <div className="notice run-warn" role="status">
          <span><b>The game ended before a winner — remake?</b> <span className="muted">Air never remakes by itself. Remake keeps this attempt for the record; End match saves what the game had as provisional.</span></span>
          <span className="row-gap"><button className="btn small" onClick={() => void run(async () => { await air.lobbyRemake(l.id, live.id!); })}>Remake</button><button className="btn small" onClick={() => void run(async () => { await air.lobbyEndMatch(l.id, live.id!); })}>End match</button></span>
        </div>
      )}
      {live && p.restarted && !p.noWinner && (
        <div className="notice run-warn" role="status"><span><b>A new game started while Match {live.n} was still live.</b> <span className="muted">If the earlier game was thrown away, remake it so its numbers and moments start clean.</span></span>
          <button className="btn small" onClick={() => void run(async () => { await air.lobbyRemake(l.id, live.id!); })}>Remake</button></div>
      )}
      {live && p.noData && <div className="notice run-warn" role="status"><b>No data for {secs} s.</b> <span className="muted">PCOB pushes changes every 2 s. The match stays live and carries on when data returns; Air never ends it by itself. If it will not come back, use End match and type the missing places.</span></div>}
    </>
  );
}

function ReasonRow({ ask, g, run, l, done }: { ask: NonNullable<Ask>; g: LobbyGame; run: Run; l: Lobby; done: () => void }) {
  const [reason, setReason] = useState('');
  const text = ask.kind === 'void' ? `Void Match ${g.n}? It is not counted and the day can still close.` : ask.kind === 'remake' ? `Remake Match ${g.n}? This attempt is kept for the record and not counted; a new attempt starts clean.` : `End Match ${g.n}? What the game has becomes provisional and you type any missing places.`;
  const go = () => run(async () => { await (ask.kind === 'void' ? air.lobbyVoid(l.id, g.id!, reason) : ask.kind === 'remake' ? air.lobbyRemake(l.id, g.id!) : air.lobbyEndMatch(l.id, g.id!)); done(); });
  return (
    <div className="run-ask" role="group" aria-label={text}>
      <span className="t-sm">{text}</span>
      {ask.kind === 'void' && <input className="cell" autoFocus aria-label="Why" placeholder="Why (kept with the match)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reason.trim() && void go()} style={{ minWidth: 240 }} />}
      <button className="btn primary small" disabled={ask.kind === 'void' && !reason.trim()} onClick={() => void go()}>{ask.kind === 'void' ? 'Void match' : ask.kind === 'remake' ? 'Remake' : 'End match'}</button>
      <button className="btn quiet small" onClick={done}>Cancel</button>
    </div>
  );
}

export function MatchStrip({ s, run, l, review }: { s: Snapshot; run: Run; l: Lobby; review: () => void }) {
  const [ask, setAsk] = useState<Ask>(null);
  const live = liveMatch(l), armed = armedMatch(l);
  const provisional = l.games.find((g) => gameState(g) === 'provisional');
  const scheduled = l.games.filter((g) => gameState(g) === 'scheduled' || gameState(g) === 'void');
  const first = scheduled.find((g) => gameState(g) === 'scheduled') ?? null;
  const shown = live ?? provisional ?? armed ?? first;
  const state = shown ? gameState(shown) : null;
  const label = live ? 'Now playing' : provisional ? 'Just finished' : armed ? 'Up next' : first ? 'Not armed' : 'Run sheet';
  const day = shown ? l.days?.find((d) => d.id === shown.dayId) ?? null : l.days?.[0] ?? null;
  const pl = s.pcobLive;
  const kills = pl ? Object.values(pl.teams).reduce((n, t) => n + t.elims, 0) : 0;
  const t = targetMatch(l);
  const confirmKey = keyLabel(keyOf(s.keymap, 'confirm'));
  const others = scheduled.filter((g) => g.id !== armed?.id);
  return (
    <section className={`card run-strip ${state ?? ''}`} aria-label="Match strip">
      <Resume s={s} run={run} />
      <Hints s={s} run={run} l={l} />
      <div className="between" style={{ gap: 14, flexWrap: 'wrap' }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="cap">{label}</span>
          <div className="row-gap" style={{ flexWrap: 'wrap' }}>
            <h2 className="title-md">{shown ? matchLabel(shown) : 'No matches left to play'}</h2>
            {state && <StateBadge state={state} attempt={shown!.attempts?.length} />}
            {shown && (shown.attempts?.filter((a) => a.reason === 'remake').length ?? 0) > 0 && <span className="pill">{shown.attempts!.filter((a) => a.reason === 'remake').length} earlier attempt{shown.attempts!.filter((a) => a.reason === 'remake').length > 1 ? 's' : ''} kept</span>}
          </div>
          <span className="muted t-sm">
            {live ? <>PCOB {s.pcob.state === 'live' ? 'in game' : s.pcob.state}{pl ? <> · <b className="mono">{pl.teamsAlive}</b> teams alive · <b className="mono">{kills}</b> kills</> : null}{s.pcob.lastChangeAt ? <> · last change {Math.max(0, Math.round((Date.now() - s.pcob.lastChangeAt) / 1000))} s ago</> : null}</>
              : state === 'provisional' ? <>Saved from {shown!.source === 'pcob' ? 'the game' : 'typed results'}. Nothing here changes the official standings until you confirm.</>
              : armed ? <>Air saves game data only into this match. After you confirm a match, Air arms the next one.</>
              : first ? <>Arm a match so Air knows where to save the next game.</> : 'Every match is confirmed or void.'}
          </span>
        </div>
        <div className="row-gap" style={{ flexWrap: 'wrap' }}>
          {live && <><button className="btn" onClick={() => setAsk({ kind: 'remake', id: live.id! })}>Remake</button><button className="btn danger" onClick={() => setAsk({ kind: 'end', id: live.id! })}>End match</button></>}
          {!live && provisional && <>
            <button className="btn" onClick={review}>Review results</button>
            <button className="btn" onClick={() => setAsk({ kind: 'remake', id: provisional.id! })}>Remake</button>
            <button className="btn primary" title={`Confirm (${confirmKey})`} onClick={() => void run(async () => { await air.lobbyConfirm(l.id, provisional.id!); })}>Confirm match {provisional.n} <span className="kbd">{confirmKey}</span></button></>}
          {!live && !provisional && !armed && first && <button className="btn primary" onClick={() => void run(async () => { await air.lobbyArm(l.id, first.id!); })}>Arm Match {first.n}</button>}
          {!live && armed && <>
            {others.length > 0 && <select className="cell" aria-label="Arm another match" value="" onChange={(e) => e.target.value && void run(async () => { await air.lobbyArm(l.id, e.target.value); })}><option value="">Arm another ▾</option>{others.map((g) => <option key={g.id} value={g.id}>{matchLabel(g)}{gameState(g) === 'void' ? ' (void)' : ''}</option>)}</select>}
            <button className="btn quiet" onClick={() => void run(async () => { await air.lobbyDisarm(l.id); })}>Disarm</button>
            <button className="btn" onClick={() => setAsk({ kind: 'void', id: armed.id! })}>Skip</button></>}
        </div>
      </div>
      {ask && l.games.find((g) => g.id === ask.id) && <ReasonRow ask={ask} g={l.games.find((g) => g.id === ask.id)!} run={run} l={l} done={() => setAsk(null)} />}
      <div className="run-strip-foot">
        {day && <><span className="faint t-sm">{day.title}</span><DayChips lobby={l} dayId={day.id} /></>}
        {(l.days?.length ?? 0) > 1 && l.days!.filter((d) => d.id !== day?.id).slice(0, 2).map((d) => <span key={d.id} className="faint t-xs">{d.title} · {matchesOfDay(l, d).filter((g) => gameState(g) === 'confirmed').length}/{d.matchIds.length}</span>)}
        <span style={{ flex: 1 }} />
        <span className="faint t-xs">{t ? 'Switching match, day or lobby is blocked while a match is live.' : 'Air saves data only into the armed match.'}</span>
      </div>
    </section>
  );
}
