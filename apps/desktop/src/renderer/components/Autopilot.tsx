import { useEffect, useState } from 'react';
import { TRIGGER_LABEL, type Segment } from '../../shared/autopilot.ts';
import type { Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import { Cap, Tally } from './ui.tsx';

type Run = (fn: () => Promise<Snapshot | void>) => Promise<boolean>;

const short = (scene: string) => scene.replace(/^Esportra · /, '');

/** "Cut to Gameplay", "Stinger to Fullscreen · Map result" — what taking the segment does. */
export function action(seg: Segment): string {
  const how = seg.transition === 'stinger' ? 'Stinger to' : seg.transition === 'cut' ? 'Cut to' : 'Take';
  return `${how} ${short(seg.scene)}${seg.graphic ? ` · ${seg.graphic.replace(/-/g, ' ')}` : ''}`;
}

export function triggerLine(seg: Segment): string {
  if (seg.mode === 'manual' || seg.trigger === 'manual') return 'Manual · press Take';
  const map = seg.mapNumber ? ` · map ${seg.mapNumber}` : '';
  return seg.trigger === 'delay' ? `${seg.delaySeconds} s after the last take` : `${TRIGGER_LABEL[seg.trigger]}${map}`;
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
  obs: 'OBS is disconnected. Autopilot resumes when it reconnects.',
} as const;

export function AutopilotCard({ s, run }: { s: Snapshot; run: Run }) {
  const a = s.autopilot;
  const now = useClock(a.holdEndsAt !== null);
  if (!a.enabled) {
    return (
      <section className="panel" aria-label="Autopilot">
        <div className="head"><Cap>Autopilot</Cap><Tally kind="off">Off</Tally></div>
        <div className="body-pad stack" style={{ gap: 10 }}>
          <p className="muted" style={{ fontSize: 12.5 }}>You take every scene yourself. Autopilot arms the next segment and takes it after a hold window you can stop.</p>
          <button className="btn" disabled={!!s.autopilotBlock} onClick={() => void run(() => air.autopilotStart())}>Start autopilot</button>
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
            {a.paused !== 'obs' && <button className="btn fix" onClick={() => void run(() => air.autopilotResume())}>Resume autopilot</button>}
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
          <button className="btn hold" disabled={!next || held || next.state === 'taking' || !!a.paused} onClick={() => void run(() => air.autopilotHold())} aria-keyshortcuts="H">Hold <span className="kbd">H</span></button>
          <button className="btn" disabled={!next || next.state === 'taking'} onClick={() => void run(() => air.autopilotSkip())} aria-keyshortcuts="S">Skip <span className="kbd">S</span></button>
          <button className="btn take" disabled={!next || next.state === 'taking' || !!a.paused} onClick={() => void run(() => air.autopilotTake())} aria-keyshortcuts="Space">Take now</button>
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
      <p className="muted" style={{ fontSize: 12, padding: '6px 16px 0' }}>A starting point, not a rule. Change triggers, hold times and scenes in Scenes › Segment → Scene before you start.</p>
      <ol className="coming wide">
        {list.map((x) => <li key={x.id}><span><b>{x.name}</b></span><span className="muted">{triggerLine(x)}</span><span className="mono muted" style={{ fontSize: 11 }}>{action(x)}</span></li>)}
      </ol>
    </section>
  );
}
