import { useEffect, useRef, useState } from 'react';
import type { LayerRow, Snapshot } from '../../shared/api.ts';
import { hotkeyLabel, hotkeyMatches, nextMode } from '../../shared/layers.ts';
import { air } from '../bridge.ts';
import { sceneLabel, useMonitor } from '../components/Monitor.tsx';
import { Composite } from '../components/Preview.tsx';
import { Cap, Tally } from '../components/ui.tsx';
import { AutopilotCard } from '../components/Autopilot.tsx';
import { CamerasPanel } from '../components/Cameras.tsx';
import type { PageProps } from '../App.tsx';
import { ROLE_NAME, onAir } from '../../shared/model.ts';

const sponsorsOn = (s: Snapshot) => (s.match ? onAir(s.match, s.event).sponsors : []);

function nextSponsor(s: Snapshot) {
  const list = sponsorsOn(s);
  if (!list.length) return null;
  const i = s.triggers.sponsor ? list.findIndex((x) => x.id === s.triggers.sponsor) : -1;
  return list[(i + 1) % list.length] ?? null;
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

interface Trigger {
  key: string;
  label: string;
  detail: string;
  state: 'idle' | 'live' | 'warn';
  built: boolean;
  fire?: () => void;
}

function LayerList({ rows, fire }: { rows: LayerRow[]; fire: (row: LayerRow) => void }) {
  return (
    <>
      {rows.map((row) => (
        <button key={row.id} className={`layer ${row.mode === 'off' && !row.cued ? 'off' : ''} ${row.cued ? 'cued' : ''}`} disabled={!row.available} onClick={() => fire(row)} aria-label={`${row.label}: ${row.mode}${row.cued ? `, cued ${row.cued}` : ''}${row.manual ? ', set by hand' : ''}`} aria-keyshortcuts={row.hotkey}>
          <span>{row.label}{row.manual && <small>Manual</small>}</span>
          <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            {row.cued && <><span className={`chip-mode ${row.mode} was`}>{row.mode.toUpperCase()}</span><span className="muted" aria-hidden="true">→</span></>}
            <span className={`chip-mode ${row.cued ?? row.mode} ${row.cued ? 'next' : ''}`}>{(row.cued ?? row.mode).toUpperCase()}</span>
          </span>
          <span className="hotkey">{hotkeyLabel(row.hotkey)}</span>
        </button>
      ))}
    </>
  );
}

function ToastForm({ run, close }: Pick<PageProps, 'run'> & { close: () => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => air.toast(text))) close(); }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><Cap>Toast · F4</Cap><button type="button" className="btn quiet small" onClick={close}>Esc</button></div>
      <label className="field"><span>Short on-screen update (shown for seven seconds)</span><input ref={ref} value={text} onChange={(e) => setText(e.target.value)} maxLength={180} placeholder="e.g. Map 2 starts in two minutes" onKeyDown={(e) => e.key === 'Escape' && close()} /></label>
      <div><button className="btn primary" type="submit" disabled={!text.trim()}>Show toast</button></div>
    </form>
  );
}

function PollForm({ run, close, active }: Pick<PageProps, 'run'> & { close: () => void; active: boolean }) {
  const [question, setQuestion] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [pct, setPct] = useState(50);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => air.poll({ question, options: [a, b], firstPercent: pct }))) close(); }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><Cap>Poll · F6</Cap><button type="button" className="btn quiet small" onClick={close}>Esc</button></div>
      <label className="field"><span>Question</span><input ref={ref} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={120} placeholder="Who takes the decider on Lotus?" onKeyDown={(e) => e.key === 'Escape' && close()} /></label>
      <div className="grid2">
        <label className="field"><span>Option 1</span><input value={a} onChange={(e) => setA(e.target.value)} maxLength={40} /></label>
        <label className="field"><span>Option 2</span><input value={b} onChange={(e) => setB(e.target.value)} maxLength={40} /></label>
      </div>
      <label className="field"><span>Option 1 share: {pct}% / {100 - pct}%</span><input type="range" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} /></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" type="submit" disabled={!question.trim() || !a.trim() || !b.trim()}>Show poll</button>
        {active && <button type="button" className="btn" onClick={() => void run(() => air.poll(null)).then(close)}>Hide poll</button>}
      </div>
    </form>
  );
}

/** Esportra graphics as they look together: the in-game HUD and the full-screen host, over the OBS program picture. */
function GraphicMonitor({ s, room, kind, image, empty }: { s: Snapshot; room: string; kind: 'cued' | 'onair'; image: string | null; empty?: string }) {
  const url = (overlay: string) => `http://127.0.0.1:${s.engine.port}/overlays/${overlay}.html?${new URLSearchParams({ match: room, screen: '1' })}`;
  const onAir = kind === 'onair';
  return (
    <figure className={`gmon ${kind}`} aria-label={onAir ? 'On air graphics' : 'Cued graphics'}>
      <div style={{ position: 'relative' }}>
        <Composite srcs={[url('ingame'), url('fullscreen')]} label={onAir ? 'Graphics on air' : 'Graphics after the next take'} image={image} />
        <span className="tag"><Tally kind={onAir ? 'onair' : 'pvw'}>{onAir ? 'On air' : 'Cued'}</Tally></span>
        {empty && <div className="empty-cue">{empty}</div>}
      </div>
      <figcaption className="mono muted">
        <span>{onAir ? 'What viewers see now' : 'After the next take'}</span>
        <span>{image ? `Over OBS · ${sceneLabel(s.obs.programScene)}` : 'Over a sample backdrop'}</span>
      </figcaption>
    </figure>
  );
}

export function ConsoleScreen({ s, run, go, openFix, openCasters }: PageProps) {
  const ref = useRef(s);
  ref.current = s;
  const [form, setForm] = useState<'toast' | 'poll' | null>(null);
  const frame = useMonitor(s.obs.state === 'connected');
  const now = useNow(!!s.readout);
  const cued = s.cue.pending.length > 0;
  const casters = s.match ? onAir(s.match, s.event).talent : [];

  const triggers = (snap: Snapshot): Trigger[] => [
    { key: 'F1', label: 'Tech pause', detail: snap.triggers.pause === 'technical' ? 'On screen · press again to resume' : 'Pause panel with a running clock', state: snap.triggers.pause === 'technical' ? 'warn' : 'idle', built: true, fire: () => void run(() => air.pause(snap.triggers.pause === 'technical' ? null : 'technical')) },
    { key: 'F2', label: 'Timeout', detail: snap.triggers.pause === 'timeout' ? 'On screen · press again to end' : 'Team timeout panel', state: snap.triggers.pause === 'timeout' ? 'warn' : 'idle', built: true, fire: () => void run(() => air.pause(snap.triggers.pause === 'timeout' ? null : 'timeout')) },
    { key: 'F3', label: 'Replay', detail: snap.obs.replay.bufferActive === false ? 'Replay buffer is off in OBS' : snap.obs.replay.bufferActive === null ? 'Set up the replay buffer in OBS' : 'Save the last moments in OBS', state: 'idle', built: snap.obs.state === 'connected', fire: () => void run(() => air.replay()) },
    { key: 'F4', label: 'Toast', detail: 'Short on-screen update', state: form === 'toast' ? 'warn' : 'idle', built: true, fire: () => setForm(form === 'toast' ? null : 'toast') },
    { key: 'F5', label: 'Caster lower third', detail: casters.length ? (snap.triggers.strap ? 'On screen · press again to hide' : casters.map((c) => c.name).join(' & ')) : 'Add people in Event first', state: snap.triggers.strap ? 'live' : 'idle', built: true, fire: () => (casters.length ? void run(() => air.casterStrap(!snap.triggers.strap)) : openCasters()) },
    { key: 'F6', label: 'Poll', detail: snap.triggers.poll ? 'On screen' : 'Two options with a split', state: snap.triggers.poll ? 'live' : form === 'poll' ? 'warn' : 'idle', built: true, fire: () => setForm(form === 'poll' ? null : 'poll') },
    { key: 'F7', label: 'Stinger', detail: snap.cue.pending.length ? 'Take the cue behind the HUD wipe' : 'Graphic wipe over the HUD', state: snap.cue.pending.length ? 'warn' : 'idle', built: true, fire: () => void run(() => (snap.cue.pending.length ? air.cueTake('stinger') : air.stingerPlay())) },
    { key: 'F8', label: 'Sponsor read', detail: sponsorsOn(snap).length ? (snap.triggers.sponsor ? `${sponsorsOn(snap).find((x) => x.id === snap.triggers.sponsor)?.name ?? 'Sponsor'} on screen` : `Next: ${nextSponsor(snap)?.name}`) : 'Add sponsors in Event', state: snap.triggers.sponsor ? 'live' : 'idle', built: sponsorsOn(snap).length > 0, fire: () => void run(() => air.sponsorRead(snap.triggers.sponsor ? null : nextSponsor(snap)?.id ?? null)) },
  ];

  // Steps on from the cued mode, so pressing a key twice while cueing moves two steps.
  const cycle = (row: LayerRow) => {
    const from = row.cued ?? row.mode;
    void run(() => air.setLayer(row.id, row.id.startsWith('fs:') ? (from === 'on' ? 'off' : 'on') : nextMode(row.id, from)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.altKey || e.metaKey || el?.tagName === 'INPUT' || el?.tagName === 'SELECT' || el?.tagName === 'TEXTAREA') return;
      const snap = ref.current;
      if (e.key === 'Escape' && form) return setForm(null);
      if (e.repeat) return;
      if (e.ctrlKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        return openFix();
      }
      if (e.ctrlKey) return;
      // Space takes, unless a focused button would also handle it. With autopilot on and a step
      // waiting, it takes that step now; otherwise it puts the cued graphics on air.
      if (e.key === ' ' && el?.tagName !== 'BUTTON') {
        e.preventDefault();
        const ap = snap.autopilot;
        if (ap.enabled && ap.next && ap.next.state !== 'taking') void run(() => air.autopilotTake());
        else if (snap.cue.pending.length) void run(() => air.cueTake('take'));
        return;
      }
      // H holds and S skips the next autopilot segment (plain keys; the Agent select and Series layers use Shift).
      if (!e.shiftKey && snap.autopilot.enabled && snap.autopilot.next && (e.key === 'h' || e.key === 'H' || e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void run(() => (e.key.toLowerCase() === 'h' ? air.autopilotHold() : air.autopilotSkip()));
        return;
      }
      if (/^F[1-8]$/.test(e.key)) {
        if (!snap.match) return;
        const t = triggers(snap).find((x) => x.key === e.key);
        if (t?.built && t.fire) {
          e.preventDefault();
          t.fire();
        }
        return;
      }
      // Layer hotkeys: 1–8, Q–I, A–J.
      const row = snap.layers.find((l) => hotkeyMatches(l.hotkey, e));
      if (row?.available) {
        e.preventDefault();
        cycle(row);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const r = s.readout;
  const live = s.feed.state === 'live' || s.testRound.running;
  const open = s.checks.filter((c) => c.health === 'warn' || c.health === 'bad').length;
  const list = triggers(s);
  const noObs = s.obs.state !== 'connected';
  const rows = (g: LayerRow['group']) => s.layers.filter((l) => l.group === g);
  const observed = r?.observed ?? null;

  return (
    <div className="console">
      <div className="stack">
        {!s.match && <div className="notice">No match selected. <button className="btn fix" onClick={() => go('ready')}>Choose a match</button></div>}

        <section aria-label="Monitors" className="stack" style={{ gap: 12 }}>
          {s.match && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 128px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
              <GraphicMonitor s={s} kind="cued" room={s.cue.mode && s.cue.room ? s.cue.room : s.match.code} image={frame?.pgm ?? null} empty={!s.cue.mode ? 'Cueing is off · changes go straight on air' : cued ? undefined : 'Nothing cued · pick a layer, graphic or trigger'} />
              <div className="take-col">
                <button className="btn take big" disabled={!cued} onClick={() => void run(() => air.cueTake('take'))} aria-keyshortcuts="Space">Take</button>
                <span className="mono muted" style={{ fontSize: 10, textAlign: 'center', letterSpacing: '0.12em' }}>SPACE</span>
                <button className="btn" disabled={!cued} onClick={() => void run(() => air.cueTake('cut'))}>Cut</button>
                <button className="btn" disabled={!cued} title="The HUD stinger wipes, the cued graphics land behind it" onClick={() => void run(() => air.cueTake('stinger'))} aria-keyshortcuts="F7">Stinger</button>
              </div>
              <GraphicMonitor s={s} kind="onair" room={s.match.code} image={frame?.pgm ?? null} />
            </div>
          )}
          {s.match && (
            <div className="panel">
              <div className="head">
                <Cap>{s.cue.mode ? `Cued · ${s.cue.pending.length || 'nothing'}` : 'Straight to air'}</Cap>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <span className="muted">Cue changes before they go on air</span>
                  <button type="button" className="switch" role="switch" aria-checked={s.cue.mode} aria-label="Cue changes before they go on air" onClick={() => void run(() => air.cueMode(!s.cue.mode))} />
                </label>
              </div>
              <div className="body-pad cue-list" aria-live="polite">
                {s.cue.mode ? (
                  cued ? (
                    <>
                      {s.cue.pending.map((label, i) => <span key={`${label}-${i}`} className="cue-chip">{label}</span>)}
                      <button className="btn quiet small" style={{ marginLeft: 'auto' }} onClick={() => void run(() => air.cueClear())}>Clear cue</button>
                    </>
                  ) : <span className="muted" style={{ fontSize: 12.5 }}>Layers, full-screen graphics, lower thirds, toasts and polls wait here until you take them. Autopilot and pauses go straight on air.</span>
                ) : <span className="muted" style={{ fontSize: 12.5 }}>Every change goes on air the moment you make it.</span>}
              </div>
            </div>
          )}
          {noObs ? (
            <p className="muted" style={{ fontSize: 12.5 }}>OBS is not connected, so the monitors show a sample backdrop instead of your program picture. Air never switches OBS scenes. <button className="btn quiet small" onClick={() => go('settings')}>Connect OBS</button></p>
          ) : !s.obs.installed ? (
            <div className="notice">The Esportra scenes are not in OBS yet. <button className="btn fix" onClick={() => void run(() => air.installGraphics())}>Add for me</button></div>
          ) : null}
        </section>

        <section className="panel" aria-label="Graphic layers and triggers">
          <div className="layers-grid">
            <section><Cap>In-game layers</Cap><LayerList rows={rows('ingame')} fire={cycle} /></section>
            <section><Cap>Between rounds</Cap><LayerList rows={rows('between')} fire={cycle} /></section>
            <section><Cap>Full screen</Cap><LayerList rows={rows('fullscreen')} fire={cycle} /></section>
            <section>
              <Cap>Triggers</Cap>
              <div className="trig-col">
                <div className="triggers">
                  {list.map((t) => (
                    <button key={t.key} className={`trig ${t.state}`} disabled={!t.built || !s.match} onClick={t.fire} aria-pressed={t.state !== 'idle'} style={!t.built ? { opacity: 0.45 } : undefined}>
                      <strong>{t.label}</strong>
                      <span className="muted" style={{ fontSize: 11 }}>{t.detail}</span>
                      <span className="kbd">{t.key}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
          {form === 'toast' && <ToastForm run={run} close={() => setForm(null)} />}
          {form === 'poll' && <PollForm run={run} close={() => setForm(null)} active={s.triggers.poll} />}
        </section>

        <CamerasPanel s={s} run={run} />

        <div className="datastrip" aria-label="Live data">
          <span className="k">Live data</span>
          {live && r ? (
            <>
              <span>R{r.round ?? '—'} · {(r.phase ?? '—').toUpperCase()}{r.clockEndsAt && ['live', 'buy', 'planted'].includes(r.phase ?? '') ? ` ~${clock(r.clockEndsAt - now)}` : ''}</span>
              <span className="sc">{r.score[0] ?? '–'} – {r.score[1] ?? '–'}</span>
              <span><span className="k">Alive</span>{r.alive[0]}v{r.alive[1]}</span>
              <span><span className="k">Bank</span>{r.bank[0].toLocaleString('en-US')} / {r.bank[1].toLocaleString('en-US')}</span>
              {r.spikePlanted && r.clockEndsAt && <span style={{ color: 'var(--amber)' }}><span className="k">Spike (inferred)</span>~{clock(r.clockEndsAt - now)}</span>}
              <span>{r.map ?? '—'}</span>
              {s.testRound.running && <Tally kind="covered">Test round</Tally>}
            </>
          ) : (
            <span className="muted">Waiting for game data</span>
          )}
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }} title="The game gives no round timer or spike event. Air estimates the clock from the phase and infers the plant from a credit change.">~ estimated</span>
          <span><button className="btn small" onClick={openFix}>Fix data</button></span>
        </div>
      </div>

      <aside className="stack">
        <AutopilotCard s={s} run={run} />
        <section className="panel">
          <div className="head"><Cap>Show</Cap></div>
          <div className="body-pad stack" style={{ gap: 10 }}>
            <div><h2 className="title-sm">{s.match?.title ?? 'No match'}</h2>{s.match && <p className="muted" style={{ fontSize: 12.5 }}>Best of {s.match.bestOf} · {s.setup.name}</p>}</div>
            <button className="btn" onClick={() => go('ready')}>{open ? `${open} need attention · Readiness` : 'Readiness'}</button>
          </div>
        </section>
        <section className="panel">
          <div className="head"><Cap>Lower thirds · one click</Cap></div>
          <div className="body-pad stack" style={{ gap: 8 }}>
            {casters.map((c) => {
              const on = s.triggers.person === c.name;
              return (
                <div key={c.id} className="row-item" style={{ border: '1px solid var(--hair)', minHeight: 52 }}>
                  <span><b>{c.name}</b><br /><span className="muted" style={{ fontSize: 11.5 }}>{ROLE_NAME[c.role]}</span></span>
                  <button className="btn small" aria-pressed={on} onClick={() => void run(() => air.lowerThird(on ? null : { kind: 'person', name: c.name, role: ROLE_NAME[c.role] }))}>{on ? 'Hide' : 'Show'}</button>
                </div>
              );
            })}
            <div className="row-item" style={{ border: '1px solid var(--hair)', minHeight: 52 }}>
              <span><b>Spotlight{observed ? ` · ${observed.name}` : ''}</b><br /><span className="muted" style={{ fontSize: 11.5 }}>{observed ? 'Player · live stats' : 'Needs the game’s roster'}</span></span>
              <button className="btn small" disabled={!observed} aria-pressed={s.triggers.player} onClick={() => void run(() => air.lowerThird(s.triggers.player ? null : { kind: 'player' }))}>{s.triggers.player ? 'Hide' : 'Show'}</button>
            </div>
            {!casters.length && <p className="muted">No casters yet.</p>}
            <button className="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={openCasters}>Edit casters</button>
          </div>
        </section>
        <section className="panel">
          <div className="head"><Cap>Event log</Cap></div>
          <div className="body-pad log" aria-live="polite">
            {s.log.length === 0 ? <span className="muted">Nothing yet. Kills, plants, cues, takes and triggers appear here.</span> : s.log.slice(0, 30).map((e, i) => (
              <div key={`${e.t}-${i}`}><time>{new Date(e.t).toLocaleTimeString('en-GB')}</time><span>{e.text}</span></div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
