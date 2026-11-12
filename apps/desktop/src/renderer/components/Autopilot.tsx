import { keyLabel, keyOf } from '../../shared/keymap.ts';
import { useEffect, useState } from 'react';
import { PRESETS, TRIGGERS, TRIGGER_LABEL, type Preset, type Segment } from '../../shared/autopilot.ts';
import type { Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import { HOLD_TEXT, ruleSentence, type Rule } from '../../shared/rules.ts';
import { MOMENT_CHIP, RuleBuilder } from './RuleBuilder.tsx';
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

/** A moment rule in its hold window: what fires, the countdown, and Hold, Skip or Take. */
export function RuleCard({ s, run }: { s: Snapshot; run: Run }) {
  const p = s.rules.pending!;
  const now = useClock(p.endsAt !== null);
  const left = p.endsAt !== null ? Math.max(0, Math.ceil((p.endsAt - now) / 1000)) : null;
  return (
    <section className="panel rule-card" aria-label="Moment rule" role="status">
      <div className="head"><Cap>Moment rule</Cap>{p.held ? <Tally kind="covered">Held</Tally> : <Tally kind="covered">Taking in {left} s</Tally>}</div>
      <div className="body-pad stack" style={{ gap: 10 }}>
        <p style={{ fontWeight: 600 }}>{p.label}</p>
        <p className="muted t-xs">{p.held ? 'Held in Cued until you take or skip it.' : 'Goes on air when the countdown ends.'}</p>
        <div className="triple">
          <button className="btn hold" disabled={p.held} onClick={() => void run(() => air.ruleHold())}>Hold <span className="kbd">{keyLabel(keyOf(s.keymap, 'hold'))}</span></button>
          <button className="btn" onClick={() => void run(() => air.ruleSkip())}>Skip <span className="kbd">{keyLabel(keyOf(s.keymap, 'skip'))}</span></button>
          <button className="btn take" onClick={() => void run(() => air.ruleTake())}>Take now <span className="kbd">{keyLabel(keyOf(s.keymap, 'take'))}</span></button>
        </div>
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
  standard: ['Standard show', 'Hold windows on every automatic step, and moment rules on.'],
  minimal: ['Results only', 'Only the map result and the return to the game are automatic. Moment rules are off.'],
  manual: ['Manual', 'Nothing happens by itself: each step and each rule waits in Cued for your Take.'],
};

/** A step as a sentence: "When the map ends, show Map result after a 5 s hold window." */
function sentence(seg: Segment): { when: string; rest: string } {
  const when = seg.mode === 'manual' || seg.trigger === 'manual' ? 'When you press Take' : seg.trigger === 'delay' ? `${seg.delaySeconds} s after the previous step` : `When ${TRIGGER_LABEL[seg.trigger].toLowerCase()}${seg.mapNumber ? ` on map ${seg.mapNumber}` : ''}`;
  const what = seg.show ? `show ${graphicTitle(seg.show)}${seg.forSeconds ? ` for ${seg.forSeconds} s, then back to the game` : ''}` : 'go back to the game';
  return { when, rest: `, ${what}.` };
}

const segHold = (seg: Segment) => (seg.mode === 'manual' || seg.trigger === 'manual' || seg.holdMode === 'manual' ? 'waits for you' : `${seg.holdSeconds} s hold`);
const ruleHold = (r: Rule) => (r.hold === 'none' ? 'no hold' : r.hold === 'wait' ? 'waits for you' : `${r.holdSeconds} s hold`);

/** One rundown step: the sentence, its hold, by itself or not, and its settings behind Edit. */
function StepRow({ seg, s, run }: { seg: Segment; s: Snapshot; run: Run }) {
  const [open, setOpen] = useState(false);
  const started = seg.state !== 'queued';
  const auto = seg.mode === 'automatic' && seg.trigger !== 'manual';
  const edit = (patch: Parameters<typeof air.segmentUpdate>[1]) => void run(() => air.segmentUpdate(seg.id, patch));
  const graphics = s.setup.screens.filter((x) => x.hosted && x.enabled);
  const text = sentence(seg);
  return (
    <li className={`ap-row ${seg.state}`}>
      <div className="ap-row-main">
        <p><b>{text.when}</b>{text.rest}{started && <span className="faint"> · {seg.state === 'on_air' ? 'on air' : seg.state === 'done' ? 'done' : 'next'}</span>}</p>
        <span className="ap-hold">{auto ? segHold(seg) : 'waits for you'}</span>
        <button className="btn quiet small" aria-expanded={open} onClick={() => setOpen(!open)} aria-label={`Edit ${seg.name}`}>{open ? 'Done' : 'Edit'}</button>
        <button type="button" className="switch" role="switch" aria-checked={auto} aria-label={`${seg.name} happens by itself`} disabled={started || seg.trigger === 'manual'} onClick={() => edit({ mode: auto ? 'manual' : 'automatic' })} />
      </div>
      {open && (
        <div className="ap-rule-edit">
          <label className="field"><span>Shows</span>
            <select className="cell" disabled={started} value={seg.show ?? ''} onChange={(e) => edit({ show: e.target.value || null })}>
              <option value="">Back to the game</option>
              {graphics.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </label>
          <label className="field"><span>When</span>
            <select className="cell" disabled={started} value={seg.trigger} onChange={(e) => edit({ trigger: e.target.value as Segment['trigger'], ...(e.target.value === 'manual' ? { mode: 'manual' as const } : {}) })}>
              {TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="field"><span>Hold</span>
            <select className="cell" disabled={started} value={seg.holdMode === 'manual' ? 'manual' : String(seg.holdSeconds)} onChange={(e) => edit(e.target.value === 'manual' ? { holdMode: 'manual' } : { holdMode: 'window', holdSeconds: Number(e.target.value) })}>
              <option value="manual">Wait for me</option>
              {[...new Set([1, 3, 5, 10, 15, seg.holdSeconds])].filter((n) => n > 0).sort((x, y) => x - y).map((n) => <option key={n} value={n}>{n} s</option>)}
            </select>
          </label>
          <label className="field"><span>For</span>
            <select className="cell" disabled={started || !seg.show} value={String(seg.forSeconds)} onChange={(e) => edit({ forSeconds: Number(e.target.value) })}>
              <option value="0">Until the next step</option>
              {[...new Set([8, 10, 15, 20, 30, seg.forSeconds])].filter((n) => n > 0).sort((x, y) => x - y).map((n) => <option key={n} value={n}>{n} s</option>)}
            </select>
          </label>
          <label className="field"><span>Via</span>
            <select className="cell" disabled={started} value={seg.transition} onChange={(e) => edit({ transition: e.target.value as Segment['transition'] })}>
              <option value="cut">Cut</option><option value="stinger">Stinger</option>
            </select>
          </label>
        </div>
      )}
    </li>
  );
}

/** The match's autopilot: the preset, the rundown in order, and moment rules (approved mock). */
export function AutopilotRules({ s, run, rehearse }: { s: Snapshot; run: Run; rehearse?: () => void }) {
  const a = s.autopilot;
  const locked = a.enabled;
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const teams = s.match ? s.match.teams.map((t) => t.name) : ['Team A', 'Team B'];
  const graphic = (id: string) => s.setup.screens.find((x) => x.id === id)?.title ?? id;
  const rulesOff = a.preset === 'minimal';
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="between">
        <div className="seg" role="radiogroup" aria-label="Autopilot preset">
          {PRESETS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={a.preset === p} aria-pressed={a.preset === p} disabled={locked} title={PRESET_TEXT[p][1]} onClick={() => void run(() => air.autopilotPreset(p))}>{PRESET_TEXT[p][0]}</button>
          ))}
        </div>
        {rehearse && <button className="btn" onClick={rehearse}>Try it in Rehearse</button>}
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginTop: -12 }}>
        {PRESET_TEXT[a.preset][1]} {locked ? 'Autopilot is running: choose Run manually on Live to change the preset or a started step.' : ''}
      </p>

      <section className="stack" style={{ gap: 6 }} aria-label="Rundown">
        <div className="between"><h2 className="title-sm">Rundown</h2><span className="faint t-xs">The show in order. H holds a step, S skips it, Space takes it now.</span></div>
        <ol className="ap-list">{a.segments.map((seg) => <StepRow key={seg.id} seg={seg} s={s} run={run} />)}</ol>
      </section>

      <section className="stack" style={{ gap: 6 }} aria-label="Moment rules">
        <div className="between"><h2 className="title-sm">Moment rules</h2><span className="faint t-xs">{rulesOff ? 'Off with Results only.' : 'They react to the game whenever it happens, beside the rundown.'}</span></div>
        {s.rules.list.length ? (
          <ol className={`ap-list ${rulesOff ? 'off' : ''}`}>
            {s.rules.list.map((r) => {
              const text = ruleSentence(r, { teams, graphic });
              return (
                <li key={r.id} className="ap-row">
                  <div className="ap-row-main">
                    <p><b>{text.when}</b>{text.rest.slice(0, text.rest.length - HOLD_TEXT(r).length - 1)}</p>
                    <span className="ap-hold">{ruleHold(r)}</span>
                    <span className="row-gap">
                      <button className="btn quiet small" onClick={() => setEditing(r)} aria-label={`Edit rule: ${MOMENT_CHIP[r.when]}`}>Edit</button>
                      <button className="btn quiet small danger" onClick={() => void run(() => air.removeRule(r.id))} aria-label={`Delete rule: ${MOMENT_CHIP[r.when]}`}>Delete</button>
                    </span>
                    <button type="button" className="switch" role="switch" aria-checked={r.enabled} aria-label={`Rule on: ${MOMENT_CHIP[r.when]}`} onClick={() => void run(() => air.setRuleEnabled(r.id, !r.enabled))} />
                  </div>
                </li>
              );
            })}
          </ol>
        ) : <p className="muted ap-empty">No moment rules. Add one to react to aces, clutches, match point or overtime.</p>}
        <div className="row-gap" style={{ marginTop: 8 }}>
          <button className="btn" onClick={() => setEditing('new')}>Add a rule</button>
          <span className="faint t-xs">Switch a rule off to do that step yourself. Autopilot never switches OBS scenes.</span>
        </div>
      </section>
      <p className="faint t-xs">Economy in the buy phase, the round recap, the spike timer and kill callouts are Auto layers on Live, separate from autopilot.</p>
      {editing && <RuleBuilder s={s} run={run} rule={editing === 'new' ? null : editing} close={() => setEditing(null)} rehearse={rehearse ?? (() => {})} />}
    </div>
  );
}
