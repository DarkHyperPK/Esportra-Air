import { keyLabel, keyOf } from '../../shared/keymap.ts';
import { useEffect, useState } from 'react';
import { PRESETS, TRIGGER_LABEL, WHEN_LABEL, type Preset, type RundownRow, type Segment } from '../../shared/autopilot.ts';
import type { Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import { ScreenRule, mapText, onScreenText, holdText } from './ScreenRule.tsx';
import { Cap, Tally } from './ui.tsx';

type Run = (fn: () => Promise<Snapshot | void>) => Promise<boolean>;

const GRAPHIC_TITLE: Record<string, string> = { 'match-intro': 'Match intro', 'map-veto': 'Map veto', 'agent-select': 'Agent select', 'map-result': 'Map result', series: 'Series', halftime: 'Halftime', standings: 'Standings', 'player-profile': 'Player profile', champion: 'Champion', 'cam-grid': 'Player cams' };
export const graphicTitle = (id: string | null) => (id ? GRAPHIC_TITLE[id] ?? id : 'the game');

/** "Stinger · Map result for 15 s", "Cut · back to the game": what taking the step does. */
export function action(seg: Segment): string {
  const how = seg.transition === 'stinger' ? 'Stinger' : 'Cut';
  return seg.show ? `${how} · ${graphicTitle(seg.show)}${seg.forSeconds ? ` for ${seg.forSeconds} s` : ''}` : `${how} · back to the game`;
}

export function triggerLine(seg: Segment): string {
  if (seg.mode === 'manual' || seg.trigger === 'manual') return 'Manual · press Take';
  const map = seg.mapNumber ? ` · map ${seg.mapNumber}` : '';
  return seg.trigger === 'delay' ? `${seg.delaySeconds} s after the previous step` : `${TRIGGER_LABEL[seg.trigger]}${map}`;
}

export function useClock(active: boolean, every = 100) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}

/** The hold countdown: amber ring draining over the window; frozen when held; rose while taking. */
export function HoldRing({ seg, endsAt, totalMs, now }: { seg: Segment; endsAt: number | null; totalMs: number | null; now: number }) {
  const R = 24;
  const C = 2 * Math.PI * R;
  const counting = endsAt !== null && totalMs !== null;
  const remaining = counting ? Math.max(0, endsAt - now) : 0;
  const fraction = seg.state === 'taking' ? 1 : counting ? remaining / totalMs : seg.heldBy ? 1 : 0;
  const colour = seg.state === 'taking' ? 'var(--rose)' : 'var(--amber)';
  const label = seg.state === 'taking' ? '…' : counting ? String(Math.ceil(remaining / 1000)) : seg.heldBy ? 'HELD' : '';
  return (
    <svg className={`ring ${seg.heldBy ? 'held' : ''}`} width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={counting ? `Taking in ${Math.ceil(remaining / 1000)} seconds` : seg.heldBy ? 'Held' : 'Waiting for trigger'}>
      <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle cx="32" cy="32" r={R} fill="none" stroke={colour} strokeWidth="4" strokeDasharray={C} strokeDashoffset={C * (1 - fraction)} transform="rotate(-90 32 32)" strokeLinecap="butt" />
      <text x="32" y="37" textAnchor="middle" fontFamily="var(--mono)" fontSize={label.length > 2 ? 11 : 17} fontWeight="700" fill="var(--text)">{label}</text>
    </svg>
  );
}

const PAUSE_TEXT = {
  tech: 'Technical pause. Nothing takes itself until you resume.',
  timeout: 'Team timeout. Nothing takes itself until it ends.',
} as const;

export function AutopilotCard({ s, run }: { s: Snapshot; run: Run }) {
  const a = s.autopilot;
  const now = useClock(a.holdEndsAt !== null);
  if (!a.enabled) {
    return (
      <section className="panel" aria-label="Autopilot">
        <div className="head"><Cap>Autopilot</Cap><Tally kind="off">Off</Tally></div>
        <div className="body-pad stack" style={{ gap: 10 }}>
          <p className="muted" style={{ fontSize: 12.5 }}>Graphics change only when you take them. Autopilot follows the match and puts the right full-screen graphic up after a hold window you can stop. OBS scenes are never switched.</p>
          {a.resumeAt ? (
            <>
              <button className="btn primary" disabled={!!s.autopilotBlock} onClick={() => void run(() => air.autopilotStart())}>Resume autopilot at {a.resumeAt}</button>
              <button className="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={() => void run(() => air.autopilotRestart())}>Start the rundown again from the first step</button>
            </>
          ) : <button className="btn" disabled={!!s.autopilotBlock} onClick={() => void run(() => air.autopilotStart())}>Start autopilot</button>}
          {s.autopilotBlock && <p className="muted" style={{ fontSize: 12 }}>{s.autopilotBlock}</p>}
        </div>
      </section>
    );
  }
  const next = a.next;
  const held = next?.heldBy === 'operator';
  return (
    <section className={`panel autopilot ${a.paused ? 'paused' : ''}`} aria-label="Autopilot">
      <div className="head"><Cap>Autopilot</Cap>{a.paused ? <Tally kind="covered">Paused</Tally> : <Tally kind="ok">On</Tally>}<button className="btn quiet small" onClick={() => void run(() => air.autopilotStop())}>Run manually</button></div>
      <div className="body-pad stack" style={{ gap: 12 }}>
        {a.paused && (
          <div className="paused-tile" role="status">
            <span>{PAUSE_TEXT[a.paused]}</span>
            <button className="btn fix" onClick={() => void run(() => air.autopilotResume())}>Resume autopilot</button>
          </div>
        )}
        <div>
          <Cap>Now</Cap>
          <p style={{ marginTop: 4, fontWeight: 600 }}>{a.now ? <>{a.now.name} <Tally kind="onair" /></> : <span className="muted">Nothing taken yet</span>}</p>
        </div>
        {next ? (
          <div className="next-card">
            <HoldRing seg={next} endsAt={a.holdEndsAt} totalMs={a.holdTotalMs} now={now} />
            <div style={{ minWidth: 0 }}>
              <Cap>Next</Cap>
              <h3 className="title-sm" style={{ marginTop: 2 }}>{next.name}</h3>
              <p className="muted" style={{ fontSize: 12 }}>{action(next)}</p>
              <p style={{ fontSize: 12, color: held || next.state === 'holding' ? 'var(--amber)' : 'var(--text-2)' }}>
                {next.state === 'taking' ? 'Taking…' : held ? 'Held by operator · Take or Skip' : next.state === 'holding' ? (a.holdEndsAt ? 'Taking when the ring ends' : 'Waiting for you to take') : `Waiting · ${triggerLine(next)}`}
              </p>
            </div>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12.5 }}>The rundown is finished.</p>
        )}
        <div className="triple">
          <button className="btn hold" disabled={!next || held || next.state === 'taking' || !!a.paused} onClick={() => void run(() => air.autopilotHold())} aria-keyshortcuts={keyOf(s.keymap, 'hold')}>Hold <span className="kbd">{keyLabel(keyOf(s.keymap, 'hold'))}</span></button>
          <button className="btn" disabled={!next || next.state === 'taking'} onClick={() => void run(() => air.autopilotSkip())} aria-keyshortcuts={keyOf(s.keymap, 'skip')}>Skip <span className="kbd">{keyLabel(keyOf(s.keymap, 'skip'))}</span></button>
          <button className="btn take" disabled={!next || next.state === 'taking' || !!a.paused} onClick={() => void run(() => air.autopilotTake())} aria-keyshortcuts={keyOf(s.keymap, 'take')}>Take now <span className="kbd">{keyLabel(keyOf(s.keymap, 'take'))}</span></button>
        </div>
        {a.comingUp.length > 0 && (
          <div>
            <Cap>Coming up</Cap>
            <ol className="coming">
              {a.comingUp.map((c) => <li key={c.id}><span>{c.name}</span><span className="muted">{triggerLine(c)}</span></li>)}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

/** "What autopilot does next": the next few segments with their trigger and action (Readiness). */
export function NextFive({ s }: { s: Snapshot }) {
  const list = s.autopilot.segments.filter((x) => x.state !== 'done').slice(0, 5);
  if (!list.length) return null;
  return (
    <section className="panel" aria-label="What autopilot does next">
      <div className="head"><Cap>What autopilot does next</Cap></div>
      <p className="muted" style={{ fontSize: 12, padding: '6px 16px 0' }}>A starting point, not a rule. Change presets, triggers and hold times on the Autopilot tab before you start.</p>
      <ol className="coming wide">
        {list.map((x) => <li key={x.id}><span><b>{x.name}</b></span><span className="muted">{triggerLine(x)}</span><span className="mono muted" style={{ fontSize: 11 }}>{action(x)}</span></li>)}
      </ol>
    </section>
  );
}

const PRESET_TEXT: Record<Preset, [string, string]> = {
  standard: ['Standard show', 'Intro, then on every map back to the game, halftime, result and series, then the champion.'],
  minimal: ['Results only', 'Only the map result and the return to the game come up by themselves.'],
  manual: ['Manual', 'Every screen waits for your Take.'],
  empty: ['Empty', 'No screens. Add your own.'],
};

const whenText = (r: RundownRow) => (r.trigger === 'delay' ? `${r.delaySeconds} s after previous` : r.trigger === 'manual' ? 'When I press Take' : WHEN_LABEL[r.trigger]);

/** The match's rundown: screens from My show in show order, each with the producer's own rule (approved mock). */
export function AutopilotRules({ s, run, rehearse }: { s: Snapshot; run: Run; rehearse?: () => void }) {
  const a = s.autopilot;
  const locked = a.enabled;
  const [editing, setEditing] = useState<RundownRow | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Preset | null>(null);
  const title = (id: string | null) => (id === null ? 'Back to the game' : s.setup.screens.find((x) => x.id === id)?.title ?? graphicTitle(id));
  const rows = s.rundown;
  const startFrom = (p: Preset) => {
    if (rows.length && confirm !== p) return setConfirm(p);
    setConfirm(null);
    void run(() => air.rundownStartFrom(p));
  };
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="between">
        <div className="row-gap" role="radiogroup" aria-label="Start from">
          <span className="muted t-sm">Start from</span>
          {PRESETS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={a.preset === p} className="rb-chip" disabled={locked} title={PRESET_TEXT[p][1]} onClick={() => startFrom(p)}>{PRESET_TEXT[p][0]}</button>
          ))}
        </div>
        {rehearse && <button className="btn" onClick={rehearse}>Try it in Rehearse</button>}
      </div>
      {confirm && (
        <div className="notice" role="alert">
          <span>Replace your {rows.length} rows with {PRESET_TEXT[confirm][0]}? {PRESET_TEXT[confirm][1]}</span>
          <span className="row-gap"><button className="btn quiet small" onClick={() => setConfirm(null)}>Keep my rows</button><button className="btn small" onClick={() => startFrom(confirm)}>Replace</button></span>
        </div>
      )}
      {locked && <p className="muted t-sm">Autopilot is running. Choose Run manually on Live to change the rundown.</p>}

      <section aria-label="Rundown">
        <div className="rd rd-head" aria-hidden="true"><span /><span>Screen</span><span>When</span><span>Map</span><span>On screen</span><span>Via</span><span>Hold</span><span /><span /></div>
        <ol className="rd-list">
          {rows.map((r, i) => (
            <li key={r.id} className={`rd ${r.enabled ? '' : 'off'}`}>
              <span className="rd-move">
                <button className="btn quiet small" disabled={locked || i === 0} aria-label={`Move ${title(r.show)} up`} onClick={() => void run(() => air.rundownMove(r.id, -1))}>↑</button>
                <button className="btn quiet small" disabled={locked || i === rows.length - 1} aria-label={`Move ${title(r.show)} down`} onClick={() => void run(() => air.rundownMove(r.id, 1))}>↓</button>
              </span>
              <b>{title(r.show)}</b>
              <span>{whenText(r)}</span>
              <span>{mapText(r.map)}</span>
              <span>{r.show === null ? '—' : onScreenText(r.forSeconds)}</span>
              <span>{r.transition === 'stinger' ? 'Stinger' : 'Cut'}</span>
              <span>{holdText(r)}</span>
              <button className="btn quiet small" disabled={locked} onClick={() => setEditing(r)} aria-label={`Edit ${title(r.show)}`}>Edit</button>
              <button type="button" className="switch" role="switch" aria-checked={r.enabled} disabled={locked} aria-label={`${title(r.show)} in the rundown`} onClick={() => void run(() => air.rundownEnable(r.id, !r.enabled))} />
            </li>
          ))}
        </ol>
        {!rows.length && <p className="muted ap-empty">No screens yet. Add one, or start from Standard show.</p>}
      </section>
      <div className="row-gap">
        <button className="btn" disabled={locked} onClick={() => setEditing('new')}>Add a screen</button>
        <span className="faint t-xs">Screens come from your My show. Switch one off to put it up yourself. Autopilot never switches OBS scenes.</span>
      </div>
      <p className="faint t-xs">Economy in the buy phase, the round recap, the spike timer and kill callouts are part of the in-game HUD (Auto layers on Live), not rows here.</p>
      {editing && <ScreenRule s={s} run={run} row={editing === 'new' ? null : editing} close={() => setEditing(null)} />}
    </div>
  );
}
