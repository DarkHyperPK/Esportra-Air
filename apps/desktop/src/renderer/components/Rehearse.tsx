// Rehearse (approved mock, 14 Nov): the match plays privately inside Air, with its own teams, players
// and photos, on a sample map that adds up (7–5 at halftime, 13–9 at the end). One big picture; on the
// right, only the screens of this match's Rundown, in show order: shown, on screen, next. Click one to
// jump to it. Nothing here reaches OBS or viewers.
import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { HUD_ROW, rowTitle, takesItself, type RundownRow, type Segment } from '../../shared/autopilot.ts';
import { BEATS, SPEEDS, type RehearsalOptions } from '../../shared/rehearsal.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { Composite, Preview, screenUrl } from './Preview.tsx';

type ItemState = 'done' | 'now' | 'next' | '';

export function RehearsePanel({ s, run, focus = null }: { s: Snapshot; run: Run; compact?: boolean; focus?: string | null }) {
  const r = s.rehearsal;
  const ap = r.autopilot;
  const ref = useRef(s);
  ref.current = s;
  const room = (overlay: string) => `http://127.0.0.1:${s.engine.port}/overlays/${overlay}.html?${new URLSearchParams({ match: r.room ?? '', screen: '1' })}`;
  const overlayOf = (id: string) => s.setup.screens.find((x) => x.id === id)?.overlay ?? id;
  const titleOf = (id: string) => s.setup.screens.find((x) => x.id === id)?.title ?? id;
  // Your show: the Rundown's screens (not the "back to the game" steps), in show order.
  const rows = s.rundown.filter((x) => x.enabled && x.show !== null);
  // A scene screen (Starting soon, Desk) is its own OBS scene: the rehearsal shows it as a still.
  const [still, setStill] = useState<string | null>(null);
  const [auto, setAuto] = useState(r.autopilotOn && r.handsFree);
  const [speed, setSpeed] = useState(r.speed);
  const options = (patch: Partial<RehearsalOptions> = {}): RehearsalOptions => ({ speed, autopilot: auto, handsFree: auto, ...patch });
  const play = (patch: Partial<RehearsalOptions> = {}) => run(() => air.rehearsalStart(options(patch)));

  const segsOf = (row: RundownRow): Segment[] => (ap?.segments ?? []).filter((x) => x.id === row.id || x.id.endsWith(`-${row.id}`));
  const stateOf = (row: RundownRow): ItemState => {
    if (!r.running && r.beat < 0) return '';
    if (row.show === HUD_ROW) return r.beat >= 4 ? 'done' : r.beat >= 1 && !r.showing && !still ? 'now' : '';
    if (!takesItself(row.show)) return still === row.show ? 'now' : '';
    const segs = segsOf(row);
    if (r.showing === row.show && !still) return 'now';
    if (ap?.next && segs.some((x) => x.id === ap.next!.id)) return 'next';
    if (segs.some((x) => x.state === 'done' || x.state === 'on_air')) return 'done';
    return '';
  };
  const label = (row: RundownRow, state: ItemState) => {
    if (state === 'now') return 'On screen';
    if (state === 'next') return 'Next';
    if (state === 'done') return 'Shown';
    if (row.show === HUD_ROW) return 'During the rounds';
    if (!takesItself(row.show)) return 'Its own OBS scene: shown as a still';
    return row.trigger === 'manual' ? 'On Take' : 'On its moment';
  };

  // Jump: a full-screen graphic goes up in the rehearsal; the HUD row goes back to the game.
  const show = async (row: RundownRow) => {
    if (!takesItself(row.show)) { setStill(row.show); return; }
    setStill(null);
    const screen = row.show === HUD_ROW ? null : row.show;
    if (!r.running) await play();
    await run(() => air.rehearsalShow(screen));
  };
  const jumpable = rows.filter((x) => x.show !== HUD_ROW);
  const current = jumpable.findIndex((x) => stateOf(x) === 'now');
  const step = (dir: 1 | -1) => {
    const next = jumpable[current < 0 ? (dir > 0 ? 0 : jumpable.length - 1) : current + dir];
    if (next) void show(next);
  };

  // "Rehearse this" from Graphics: play and go straight to that screen.
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || focused.current === focus) return;
    focused.current = focus;
    const row = rows.find((x) => x.show === focus);
    if (row) void show(row);
    else void (async () => { if (!r.running) await play(); await run(() => air.rehearsalShow(focus)); })();
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const progress = r.beat < 0 ? 0 : Math.min(1, (r.beat + 0.5) / BEATS.length);
  const a = s.match?.teams[0].name ?? 'Team A';
  const b = s.match?.teams[1].name ?? 'Team B';
  const nowRow = rows.find((x) => stateOf(x) === 'now');

  return (
    <section className="rehearse2" aria-label="Rehearse">
      <div className="reh2-stage">
        <div className="reh2-screen">
          {still ? <Preview src={r.room ? room(overlayOf(still)) : screenUrl(s, still)} label={titleOf(still)} />
            : r.room ? <Composite srcs={[room('ingame'), room('fullscreen')]} label="Rehearsal preview" />
            : <div className="pv pv-bg reh-poster"><div><b>{s.match?.title ?? 'Your match'}</b><span>Press Play to watch it run through your screens.</span></div></div>}
          <span className="reh2-tag">Rehearsal · private · never in OBS</span>
          {nowRow && <span className="reh2-now">{rowTitle(nowRow.show, nowRow.section, titleOf)} · {rows.indexOf(nowRow) + 1} of {rows.length}</span>}
        </div>
        <div className="reh2-transport">
          <button type="button" className="btn icon" aria-label="Previous screen" onClick={() => step(-1)} disabled={!jumpable.length}>⏮</button>
          {r.running
            ? <button type="button" className="btn primary reh2-play" onClick={() => void run(() => air.rehearsalStop())}>■ Stop</button>
            : <button type="button" className="btn primary reh2-play" disabled={!s.match} onClick={() => { setStill(null); void play(); }}>▶ {r.beat >= BEATS.length ? 'Play again' : 'Play'}</button>}
          <button type="button" className="btn icon" aria-label="Next screen" onClick={() => step(1)} disabled={!jumpable.length}>⏭</button>
          <div className="reh2-scrub" role="progressbar" aria-label="The sample game" aria-valuemin={0} aria-valuemax={BEATS.length} aria-valuenow={Math.max(0, r.beat)}>
            <b style={{ width: `${progress * 100}%` }} />
            {BEATS.map((x, i) => <i key={x.id} style={{ left: `${(i / BEATS.length) * 100}%` }} title={x.label} />)}
          </div>
          <div className="seg" role="group" aria-label="Rehearsal speed">
            {SPEEDS.map((n) => <button type="button" key={n} aria-pressed={speed === n} onClick={() => { setSpeed(n); if (r.running) void play({ speed: n }); }}>{n}×</button>)}
          </div>
        </div>
        <p className="reh2-story"><b>Sample game:</b> {a} vs {b} · Map 1 · {a} win <b>13–9</b> (halftime 7–5) · your players, photos, casters and sponsors{r.beat >= 0 && r.beat < BEATS.length ? <> · <b>{BEATS[r.beat]!.label}</b></> : null}.</p>
        {r.error && <p style={{ color: 'var(--bad)', fontSize: 12.5 }}>{r.error}</p>}
      </div>

      <aside className="reh2-list card-plain" aria-label="Your show">
        <h4>Your show · {rows.length} screen{rows.length === 1 ? '' : 's'}</h4>
        {rows.length === 0 && <p className="faint t-sm">Nothing in the Rundown yet. Add screens in the Rundown step.</p>}
        <ol>
          {rows.map((row) => {
            const st = stateOf(row);
            const id = row.show!;
            return (
              <li key={row.id}>
                <button type="button" className={`reh2-item ${st}`} aria-current={st === 'now' ? 'step' : undefined} onClick={() => void show(row)}>
                  <span className="reh2-th"><Preview src={screenUrl(s, id)} label={rowTitle(row.show, row.section, titleOf)} /></span>
                  <span><b>{rowTitle(row.show, row.section, titleOf)}</b><span>{label(row, st)}</span></span>
                </button>
              </li>
            );
          })}
        </ol>
        <label className="reh2-auto">
          <span>Run it as autopilot will<br /><span className="faint t-xs">Screens come up on their moments from the Rundown. Off: step through them yourself.</span></span>
          <button type="button" className="switch" role="switch" aria-checked={auto} aria-label="Run it as autopilot will" onClick={() => { const next = !auto; setAuto(next); if (r.running) void play({ autopilot: next, handsFree: next }); }} />
        </label>
      </aside>
    </section>
  );
}
