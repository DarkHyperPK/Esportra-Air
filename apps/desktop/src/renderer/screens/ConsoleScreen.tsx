import { useEffect, useRef, useState } from 'react';
import type { LayerRow, Snapshot } from '../../shared/api.ts';
import { nextMode } from '../../shared/layers.ts';
import { SCENE_KEYS, SCENES } from '../../shared/scenes.ts';
import { air } from '../bridge.ts';
import { Monitor, sceneLabel, useMonitor } from '../components/Monitor.tsx';
import { Cap, Tally } from '../components/ui.tsx';
import type { PageProps } from '../App.tsx';

function nextSponsor(s: Snapshot) {
  if (!s.setup.sponsors.length) return null;
  const i = s.triggers.sponsor ? s.setup.sponsors.indexOf(s.triggers.sponsor) : -1;
  return s.setup.sponsors[(i + 1) % s.setup.sponsors.length] ?? null;
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
        <button key={row.id} className={`layer ${row.mode === 'off' ? 'off' : ''}`} disabled={!row.available} onClick={() => fire(row)} aria-label={`${row.label}: ${row.mode}${row.manual ? ', set by hand' : ''}`} aria-keyshortcuts={row.hotkey}>
          <span>{row.label}{row.manual && <small>Manual</small>}</span>
          <span className={`chip-mode ${row.mode}`}>{row.mode.toUpperCase()}</span>
          <span className="hotkey">{row.hotkey}</span>
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

export function ConsoleScreen({ s, run, go, openFix, openCasters }: PageProps) {
  const ref = useRef(s);
  ref.current = s;
  const [form, setForm] = useState<'toast' | 'poll' | null>(null);
  const frame = useMonitor(s.obs.state === 'connected');
  const now = useNow(!!s.readout);
  const hasStinger = s.obs.transitions.some((t) => t.kind === 'stinger');
  const hasCut = s.obs.transitions.some((t) => t.kind === 'cut');
  const canTake = s.obs.state === 'connected' && s.obs.studioMode && !s.obs.transitionActive && !!s.obs.previewScene;
  const casters = (s.match?.casters ?? []).filter((c) => c.name);

  const triggers = (snap: Snapshot): Trigger[] => [
    { key: 'F1', label: 'Tech pause', detail: snap.triggers.pause === 'technical' ? 'On screen · press again to resume' : 'Pause panel with a running clock', state: snap.triggers.pause === 'technical' ? 'warn' : 'idle', built: true, fire: () => void run(() => air.pause(snap.triggers.pause === 'technical' ? null : 'technical')) },
    { key: 'F2', label: 'Timeout', detail: snap.triggers.pause === 'timeout' ? 'On screen · press again to end' : 'Team timeout panel', state: snap.triggers.pause === 'timeout' ? 'warn' : 'idle', built: true, fire: () => void run(() => air.pause(snap.triggers.pause === 'timeout' ? null : 'timeout')) },
    { key: 'F3', label: 'Replay', detail: snap.obs.replay.busy ? 'Saving or playing…' : snap.obs.replay.bufferActive === false ? 'Replay buffer is off in OBS' : snap.obs.replay.bufferActive === null ? 'Set up the replay buffer in OBS' : 'Last clip, through the stinger', state: snap.obs.replay.busy ? 'warn' : 'idle', built: snap.obs.state === 'connected', fire: () => void run(() => air.replay()) },
    { key: 'F4', label: 'Toast', detail: 'Short on-screen update', state: form === 'toast' ? 'warn' : 'idle', built: true, fire: () => setForm(form === 'toast' ? null : 'toast') },
    { key: 'F5', label: 'Caster lower third', detail: casters.length ? (snap.triggers.strap ? 'On screen · press again to hide' : casters.map((c) => c.name).join(' & ')) : 'Add casters first', state: snap.triggers.strap ? 'live' : 'idle', built: true, fire: () => (casters.length ? void run(() => air.casterStrap(!snap.triggers.strap)) : openCasters()) },
    { key: 'F6', label: 'Poll', detail: snap.triggers.poll ? 'On screen' : 'Two options with a split', state: snap.triggers.poll ? 'live' : form === 'poll' ? 'warn' : 'idle', built: true, fire: () => setForm(form === 'poll' ? null : 'poll') },
    { key: 'F7', label: 'Stinger', detail: 'Graphic wipe over the HUD', state: 'idle', built: true, fire: () => void run(() => air.stingerPlay()) },
    { key: 'F8', label: 'Sponsor read', detail: snap.setup.sponsors.length ? (snap.triggers.sponsor ? `${snap.triggers.sponsor} on screen` : `Next: ${nextSponsor(snap)}`) : 'Add sponsors in Setup', state: snap.triggers.sponsor ? 'live' : 'idle', built: snap.setup.sponsors.length > 0, fire: () => void run(() => air.sponsorRead(snap.triggers.sponsor ? null : nextSponsor(snap))) },
  ];

  const cycle = (row: LayerRow) => void run(() => air.setLayer(row.id, row.id.startsWith('fs:') ? (row.mode === 'on' ? 'off' : 'on') : nextMode(row.id, row.mode)));

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
      // Space takes, unless a focused button would also handle it.
      if (e.key === ' ' && el?.tagName !== 'BUTTON') {
        e.preventDefault();
        if (snap.obs.state === 'connected' && snap.obs.studioMode && snap.obs.previewScene) void run(() => air.obsTake());
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
      const row = snap.layers.find((l) => l.hotkey.toLowerCase() === e.key.toLowerCase());
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

        <section aria-label="Monitors">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 128px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
            <Monitor kind="pvw" scene={s.obs.previewScene} image={frame?.pvw ?? null} note={noObs ? 'OBS not connected' : !s.obs.studioMode ? 'Studio Mode is off' : 'No picture'} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 30 }}>
              <button className="btn take big" disabled={!canTake} onClick={() => void run(() => air.obsTake())} aria-keyshortcuts="Space">Take</button>
              <span className="mono muted" style={{ fontSize: 10, textAlign: 'center', letterSpacing: '0.12em' }}>SPACE</span>
              <button className="btn" disabled={!canTake || !hasCut} onClick={() => void run(() => air.obsCut())}>Cut</button>
              <button className="btn" disabled={!canTake || !hasStinger} title={hasStinger ? undefined : 'Add a Stinger transition in OBS'} onClick={() => void run(() => air.obsStinger())}>Stinger</button>
            </div>
            <Monitor kind="pgm" scene={s.obs.programScene} image={frame?.pgm ?? null} note={noObs ? 'OBS not connected' : 'No picture'} />
          </div>

          {noObs ? (
            <div className="notice" style={{ marginTop: 12 }}>OBS is not connected. <button className="btn fix" onClick={() => go('scenes')}>Connect OBS</button></div>
          ) : !s.obs.studioMode ? (
            <div className="notice" style={{ marginTop: 12 }}>Turn on Studio Mode so takes go through Preview. <button className="btn fix" onClick={() => void run(() => air.obsStudioMode(true))}>Turn on Studio Mode</button></div>
          ) : !s.obs.installed ? (
            <div className="notice" style={{ marginTop: 12 }}>The Esportra scenes are not in OBS yet. <button className="btn fix" onClick={() => void run(() => air.installGraphics())}>Add for me</button></div>
          ) : (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="head"><Cap>Next take loads in Preview · click a scene</Cap><span className="muted mono" style={{ fontSize: 10.5 }}>OBS scene · {sceneLabel(s.obs.programScene)} on air</span></div>
              <div className="body-pad" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {SCENE_KEYS.map((key) => {
                  const name = SCENES[key].name;
                  const isPgm = s.obs.programScene === name;
                  const isPvw = s.obs.previewScene === name;
                  return (
                    <button key={key} className="btn" aria-pressed={isPvw} onClick={() => void run(() => air.obsPreview(name))} style={isPvw ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : isPgm ? { borderColor: 'var(--rose)' } : undefined}>
                      {SCENES[key].label}
                      {isPgm && <Tally kind="onair" />}
                      {isPvw && !isPgm && <Tally kind="pvw" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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

        <div className="datastrip" aria-label="Live data">
          <span className="k">Live data</span>
          {live && r ? (
            <>
              <span>R{r.round ?? '—'} · {(r.phase ?? '—').toUpperCase()}{r.clockEndsAt && ['live', 'buy', 'planted'].includes(r.phase ?? '') ? ` ${clock(r.clockEndsAt - now)}` : ''}</span>
              <span className="sc">{r.score[0] ?? '–'} – {r.score[1] ?? '–'}</span>
              <span><span className="k">Alive</span>{r.alive[0]}v{r.alive[1]}</span>
              <span><span className="k">Bank</span>{r.bank[0].toLocaleString('en-US')} / {r.bank[1].toLocaleString('en-US')}</span>
              {r.spikePlanted && r.clockEndsAt && <span style={{ color: 'var(--amber)' }}><span className="k">Spike</span>{clock(r.clockEndsAt - now)}</span>}
              <span>{r.map ?? '—'}</span>
              {s.testRound.running && <Tally kind="covered">Test round</Tally>}
            </>
          ) : (
            <span className="muted">Waiting for game data</span>
          )}
          <span style={{ marginLeft: 'auto' }}><button className="btn small" onClick={openFix}>Fix data</button></span>
        </div>
      </div>

      <aside className="stack">
        <section className="panel">
          <div className="head"><Cap>Autopilot</Cap><Tally kind="off">Off</Tally></div>
          <div className="body-pad"><p className="muted" style={{ fontSize: 12.5 }}>Autopilot arrives with the rundown. Until then you take scenes yourself.</p></div>
        </section>
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
            {casters.map((c, i) => {
              const on = s.triggers.person === c.name;
              return (
                <div key={c.name} className="row-item" style={{ border: '1px solid var(--hair)', minHeight: 52 }}>
                  <span><b>{c.name}</b><br /><span className="muted" style={{ fontSize: 11.5 }}>{i ? 'Caster · analyst' : 'Caster · play-by-play'}</span></span>
                  <button className="btn small" aria-pressed={on} onClick={() => void run(() => air.lowerThird(on ? null : { kind: 'person', name: c.name, role: i ? 'Caster · analyst' : 'Caster · play-by-play' }))}>{on ? 'Hide' : 'Show'}</button>
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
            {s.log.length === 0 ? <span className="muted">Nothing yet. Kills, plants, takes and triggers appear here.</span> : s.log.slice(0, 30).map((e, i) => (
              <div key={`${e.t}-${i}`}><time>{new Date(e.t).toLocaleTimeString('en-GB')}</time><span>{e.text}</span></div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
