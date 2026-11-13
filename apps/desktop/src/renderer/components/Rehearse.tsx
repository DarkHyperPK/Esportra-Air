// Rehearse: the match plays privately inside Air, with its own teams, players and photos, through the
// chosen graphics, and autopilot fires as it would on the night. Nothing here reaches OBS or viewers.
import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { BEATS, SPEEDS, type RehearsalOptions } from '../../shared/rehearsal.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { action } from './Autopilot.tsx';
import { Composite } from './Preview.tsx';
import { Cap, Tally } from './ui.tsx';

export function RehearsePanel({ s, run, compact = false }: { s: Snapshot; run: Run; compact?: boolean }) {
  const r = s.rehearsal;
  const ap = r.autopilot;
  const ref = useRef(s);
  ref.current = s;
  const url = (overlay: string) => `http://127.0.0.1:${s.engine.port}/overlays/${overlay}.html?${new URLSearchParams({ match: r.room ?? '', screen: '1' })}`;
  const waiting = r.running && ap?.next && ap.next.state !== 'taking' && (ap.next.mode === 'manual' || ap.next.trigger === 'manual' || ap.next.state === 'holding');
  // Choices apply at the next Play; a new speed while playing restarts the rehearsal at that speed.
  const [opts, setOpts] = useState<RehearsalOptions>({ speed: r.speed, autopilot: r.autopilotOn, handsFree: r.handsFree });
  const play = (next: RehearsalOptions = opts) => void run(() => air.rehearsalStart(next));
  const pick = (patch: Partial<RehearsalOptions>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    if (r.running && patch.speed) play(next);
  };

  // Space takes the step the rehearsal's autopilot is waiting on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== ' ' || e.repeat || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(el?.tagName ?? '')) return;
      const cur = ref.current.rehearsal;
      if (!cur.running || !cur.autopilot?.next) return;
      e.preventDefault();
      void run(() => air.rehearsalTake());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  const firedIn = (beat: number) => r.log.filter((l) => l.beat === beat && l.text.startsWith('On air · ')).map((l) => l.text.slice(9)).reverse();

  return (
    <section className={`rehearse ${compact ? 'compact' : ''}`} aria-label="Rehearse">
      <div className="reh-stage">
        <div className="reh-monitor">
          {r.room ? <Composite srcs={[url('ingame'), url('fullscreen')]} label="Rehearsal preview" /> : (
            <div className="pv pv-bg reh-poster"><div><b>{s.match?.title ?? 'Your match'}</b><span>Press Play to watch it run through your graphics.</span></div></div>
          )}
          <span className="reh-tag"><Tally kind={r.running ? 'pvw' : 'off'}>{r.running ? 'Rehearsal · private' : 'Rehearsal'}</Tally></span>
        </div>
        <ol className="beats" aria-label="Rehearsal beats">
          {BEATS.map((b, i) => {
            const state = r.beat > i ? 'done' : r.beat === i ? 'now' : '';
            const fired = firedIn(i);
            return (
              <li key={b.id} className={state} aria-current={state === 'now' ? 'step' : undefined}>
                <span className="beat-dot" aria-hidden="true" />
                <b>{b.label}</b>
                <span className="beat-fired">{fired.length ? fired.map((f) => `→ ${f}`).join('  ') : state ? 'No graphic' : ''}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <aside className="reh-side stack" style={{ gap: 14 }}>
        <div className="stack" style={{ gap: 8 }}>
          {r.running
            ? <button className="btn big" onClick={() => void run(() => air.rehearsalStop())}>Stop rehearsal</button>
            : <button className="btn primary big" disabled={!s.match} onClick={() => play()}>{r.beat >= BEATS.length ? 'Play again' : 'Play rehearsal'}</button>}
          <p className="muted" style={{ fontSize: 12 }}>Private: nothing here reaches OBS or viewers. About {Math.round(160 / opts.speed / 10) * 10} seconds.</p>
        </div>
        <div className="row-item" style={{ padding: 0, border: 0 }}>
          <Cap>Speed</Cap>
          <div className="seg" role="group" aria-label="Rehearsal speed">
            {SPEEDS.map((n) => <button type="button" key={n} aria-pressed={opts.speed === n} onClick={() => pick({ speed: n })}>{n}×</button>)}
          </div>
        </div>
        <label className="row-item" style={{ padding: 0, border: 0 }}>
          <span>Autopilot in rehearsal<br /><span className="muted" style={{ fontSize: 12 }}>Your Rundown, from the Rundown step</span></span>
          <button type="button" className="switch" role="switch" aria-checked={opts.autopilot} aria-label="Autopilot in rehearsal" disabled={r.running} onClick={() => pick({ autopilot: !opts.autopilot })} />
        </label>
        <label className="row-item" style={{ padding: 0, border: 0 }}>
          <span>Take manual steps for me<br /><span className="muted" style={{ fontSize: 12 }}>Intro and winner go up after 3 s</span></span>
          <button type="button" className="switch" role="switch" aria-checked={opts.handsFree} aria-label="Take manual steps for me" disabled={r.running || !opts.autopilot} onClick={() => pick({ handsFree: !opts.handsFree })} />
        </label>

        {ap && (
          <div className="reh-ap">
            <div><Cap>Now</Cap><p>{ap.now ? <>{ap.now.name} <Tally kind="onair" /></> : <span className="muted">Nothing yet</span>}</p></div>
            <div><Cap>Next</Cap><p>{ap.next ? <>{ap.next.name}<br /><span className="muted" style={{ fontSize: 12 }}>{action(ap.next)}</span></> : <span className="muted">Done</span>}</p></div>
            <button className="btn take" disabled={!waiting} onClick={() => void run(() => air.rehearsalTake())} aria-keyshortcuts="Space">Take <span className="kbd">Space</span></button>
          </div>
        )}
        {r.error && <p style={{ color: 'var(--bad)', fontSize: 12.5 }}>{r.error}</p>}
        {!compact && (
          <div className="log reh-log" aria-live="polite">
            {r.log.slice(0, 12).map((l, i) => <div key={`${l.t}-${i}`}><time>{new Date(l.t).toLocaleTimeString('en-GB')}</time><span>{l.text}</span></div>)}
          </div>
        )}
      </aside>
    </section>
  );
}
