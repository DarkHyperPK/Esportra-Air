import { keyLabel, keyOf } from '../../shared/keymap.ts';
import { useEffect, useState } from 'react';
import { PRESETS, TRIGGERS, TRIGGER_LABEL, type Preset, type Segment } from '../../shared/autopilot.ts';
import type { Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
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
  standard: ['Standard show', 'Intro, back to the game when rounds go live, halftime, map result, then the series. Hold windows on every automatic step.'],
  minimal: ['Results only', 'Only the map result and the return to the game are automatic. Everything else waits for you.'],
  manual: ['Manual', 'Nothing happens by itself. Autopilot still lines up the next step so Space takes it.'],
};

/** A step as a sentence: "When the map ends, show Map result after a 5 s hold window." */
function sentence(seg: Segment) {
  const when = seg.mode === 'manual' || seg.trigger === 'manual' ? 'When you press Take' : seg.trigger === 'delay' ? `${seg.delaySeconds} s after the previous step` : `When ${TRIGGER_LABEL[seg.trigger].toLowerCase()}${seg.mapNumber ? ` on map ${seg.mapNumber}` : ''}`;
  const what = seg.show ? `show ${graphicTitle(seg.show)}${seg.forSeconds ? ` for ${seg.forSeconds} s, then back to the game` : ''}` : 'go back to the game';
  const hold = seg.mode === 'manual' || seg.trigger === 'manual' ? '' : seg.holdMode === 'manual' ? ', after you confirm' : `, after a ${seg.holdSeconds} s hold window`;
  return `${when}, ${what}${hold}.`;
}

/** The match's autopilot: presets, how it works, and every step as an editable sentence. */
export function AutopilotRules({ s, run, rehearse }: { s: Snapshot; run: Run; rehearse?: () => void }) {
  const a = s.autopilot;
  const locked = a.enabled;
  const edit = (seg: Segment, patch: Parameters<typeof air.segmentUpdate>[1]) => void run(() => air.segmentUpdate(seg.id, patch));
  const graphics = s.setup.screens.filter((x) => x.hosted && x.enabled);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="ap-explainer">
        <div className="ap-steps">
          <div><span className="ap-num">1</span><b>A step arms</b><span className="muted">The next step waits for its moment: a round going live, halftime, the map ending, or your Take.</span></div>
          <div><span className="ap-num amber">2</span><b>A hold window counts down</b><span className="muted">An amber ring shows how long until it happens. <span className="kbd">H</span> holds it, <span className="kbd">S</span> skips it, <span className="kbd">Space</span> takes it now.</span></div>
          <div><span className="ap-num rose">3</span><b>The graphic goes on air</b><span className="muted">Over the game, through Air’s own outputs. OBS scenes are never switched.</span></div>
        </div>
        {rehearse && <div><button className="btn" onClick={rehearse}>Try it in Rehearse</button> <span className="muted" style={{ fontSize: 12.5 }}>Watch these steps fire on a private run of this match.</span></div>}
        <p className="muted" style={{ fontSize: 12.5 }}>Economy in the buy phase, the round recap, the spike timer and kill callouts are separate: they are Auto layers on Live and work whether autopilot is on or not.</p>
      </section>

      <section className="stack" style={{ gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 className="title-sm">Preset</h2>
          {locked && <span className="muted" style={{ fontSize: 12.5 }}>Autopilot is running. Choose Run manually on Live to change it.</span>}
        </div>
        <div className="presets" role="radiogroup" aria-label="Autopilot preset">
          {PRESETS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={a.preset === p} disabled={locked} className="preset" onClick={() => void run(() => air.autopilotPreset(p))}>
              <b>{PRESET_TEXT[p][0]}</b><span className="muted">{PRESET_TEXT[p][1]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <h2 className="title-sm">Steps for {s.match?.title}</h2>
        <ol className="ap-rules">
          {a.segments.map((seg) => {
            const started = seg.state !== 'queued';
            const auto = seg.mode === 'automatic' && seg.trigger !== 'manual';
            return (
              <li key={seg.id} className={`ap-rule ${seg.state}`}>
                <div className="ap-rule-main">
                  <span className={`ap-dot ${auto ? 'auto' : ''}`} aria-hidden="true" />
                  <div><b>{seg.name}</b><p>{sentence(seg)}</p></div>
                </div>
                <div className="ap-rule-edit">
                  <label className="field"><span>Shows</span>
                    <select className="cell" disabled={started} value={seg.show ?? ''} onChange={(e) => edit(seg, { show: e.target.value || null })}>
                      <option value="">Back to the game</option>
                      {graphics.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>When</span>
                    <select className="cell" disabled={started} value={seg.trigger} onChange={(e) => edit(seg, { trigger: e.target.value as Segment['trigger'], ...(e.target.value === 'manual' ? { mode: 'manual' as const } : {}) })}>
                      {TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>Hold</span>
                    <select className="cell" disabled={started} value={seg.holdMode === 'manual' ? 'manual' : String(seg.holdSeconds)} onChange={(e) => edit(seg, e.target.value === 'manual' ? { holdMode: 'manual' } : { holdMode: 'window', holdSeconds: Number(e.target.value) })}>
                      <option value="manual">Wait for me</option>
                      {[...new Set([1, 3, 5, 10, 15, seg.holdSeconds])].filter((n) => n > 0).sort((x, y) => x - y).map((n) => <option key={n} value={n}>{n} s</option>)}
                    </select>
                  </label>
                  <label className="field"><span>For</span>
                    <select className="cell" disabled={started || !seg.show} value={String(seg.forSeconds)} onChange={(e) => edit(seg, { forSeconds: Number(e.target.value) })}>
                      <option value="0">Until the next step</option>
                      {[...new Set([8, 10, 15, 20, 30, seg.forSeconds])].filter((n) => n > 0).sort((x, y) => x - y).map((n) => <option key={n} value={n}>{n} s</option>)}
                    </select>
                  </label>
                  <label className="field"><span>Arrives</span>
                    <select className="cell" disabled={started} value={seg.transition} onChange={(e) => edit(seg, { transition: e.target.value as Segment['transition'] })}>
                      <option value="cut">Cut</option><option value="stinger">Stinger</option>
                    </select>
                  </label>
                  <div className="field"><span>By itself</span>
                    <button type="button" className="switch" role="switch" aria-checked={auto} aria-label={`${seg.name} happens by itself`} disabled={started || seg.trigger === 'manual'} onClick={() => edit(seg, { mode: auto ? 'manual' : 'automatic' })} style={{ marginTop: 8 }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
