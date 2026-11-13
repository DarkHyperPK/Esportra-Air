// Live (approved mock): four zones. On air (what viewers see, with one status line), Next (autopilot's
// next step: Hold, Skip, Take), Cued (what waits for Take), Moments (your six keys). Everything else is
// in All graphics. Every key comes from the keymap, so a key rebound in Settings works here at once.
import { useEffect, useRef, useState } from 'react';
import type { LayerRow, Snapshot } from '../../shared/api.ts';
import { nextMode } from '../../shared/layers.ts';
import { ACTIONS, actionFor, isTyping, keyLabel, keyOf } from '../../shared/keymap.ts';
import { keyCommand, nextSponsor, sponsorsOn, type KeyCommand } from '../../shared/key-actions.ts';
import { ROLE_NAME, onAir } from '../../shared/model.ts';
import { air } from '../bridge.ts';
import { sceneLabel, useMonitor } from '../components/Monitor.tsx';
import { Composite } from '../components/Preview.tsx';
import { Cap, Tally } from '../components/ui.tsx';
import { AutopilotCard } from '../components/Autopilot.tsx';
import type { PageProps } from '../App.tsx';

/** Runs what a key or moment means (the same call the main process makes for keys over the game). */
const runCommand = (run: PageProps['run'], cmd: KeyCommand) => {
  if (cmd && cmd !== 'ui') void run(() => (air as unknown as Record<string, (...a: unknown[]) => Promise<Snapshot>>)[cmd.method]!(...cmd.args));
};

const clock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
const age = (ms: number | null) => (ms === null ? '—' : ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`);

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

interface Moment { id: string; label: string; detail: string; state: 'idle' | 'live' | 'warn' | 'cued'; built: boolean; fire: () => void }

/** Which cued change belongs to a moment (by the label Air gives the cue). */
const CUE_MATCH: Record<string, RegExp> = { talent: /lower third/i, sponsor: / read$/i, spotlight: /^spotlight/i };

function LayerList({ s, rows, fire }: { s: Snapshot; rows: LayerRow[]; fire: (row: LayerRow) => void }) {
  return (
    <>
      {rows.map((row) => {
        const key = keyOf(s.keymap, `layer:${row.id}`);
        return (
          <button key={row.id} className={`layer ${row.mode === 'off' && !row.cued ? 'off' : ''} ${row.cued ? 'cued' : ''}`} disabled={!row.available} onClick={() => fire(row)} aria-label={`${row.label}: ${row.mode}${row.cued ? `, cued ${row.cued}` : ''}${row.manual ? ', set by hand' : ''}`} aria-keyshortcuts={key}>
            <span>{row.label}{row.manual && <small>Manual</small>}</span>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {row.cued && <><span className={`chip-mode ${row.mode} was`}>{row.mode.toUpperCase()}</span><span className="muted" aria-hidden="true">→</span></>}
              <span className={`chip-mode ${row.cued ?? row.mode} ${row.cued ? 'next' : ''}`}>{(row.cued ?? row.mode).toUpperCase()}</span>
            </span>
            <span className="hotkey">{keyLabel(key)}</span>
          </button>
        );
      })}
    </>
  );
}

function ToastForm({ s, run, close }: Pick<PageProps, 's' | 'run'> & { close: () => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => air.toast(text))) close(); }}>
      <div className="between"><Cap>Toast · {keyLabel(keyOf(s.keymap, 'toast'))}</Cap><button type="button" className="btn quiet small" onClick={close}>Esc</button></div>
      <label className="field"><span>Short on-screen update (shown for seven seconds)</span><input ref={ref} value={text} onChange={(e) => setText(e.target.value)} maxLength={180} placeholder="e.g. Map 2 starts in two minutes" onKeyDown={(e) => e.key === 'Escape' && close()} /></label>
      <div><button className="btn primary" type="submit" disabled={!text.trim()}>Show toast</button></div>
    </form>
  );
}

function PollForm({ s, run, close, active }: Pick<PageProps, 's' | 'run'> & { close: () => void; active: boolean }) {
  const [question, setQuestion] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [pct, setPct] = useState(50);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => air.poll({ question, options: [a, b], firstPercent: pct }))) close(); }}>
      <div className="between"><Cap>Poll · {keyLabel(keyOf(s.keymap, 'poll'))}</Cap><button type="button" className="btn quiet small" onClick={close}>Esc</button></div>
      <label className="field"><span>Question</span><input ref={ref} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={120} placeholder="Who takes the decider on Lotus?" onKeyDown={(e) => e.key === 'Escape' && close()} /></label>
      <div className="grid2">
        <label className="field"><span>Option 1</span><input value={a} onChange={(e) => setA(e.target.value)} maxLength={40} /></label>
        <label className="field"><span>Option 2</span><input value={b} onChange={(e) => setB(e.target.value)} maxLength={40} /></label>
      </div>
      <label className="field"><span>Option 1 share: {pct}% / {100 - pct}%</span><input type="range" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} /></label>
      <div className="row-gap">
        <button className="btn primary" type="submit" disabled={!question.trim() || !a.trim() || !b.trim()}>Show poll</button>
        {active && <button type="button" className="btn" onClick={() => void run(() => air.poll(null)).then(close)}>Hide poll</button>}
      </div>
    </form>
  );
}

/** What viewers see: the HUD and the full-screen host over OBS's program picture. */
function OnAirMonitor({ s, image }: { s: Snapshot; image: string | null }) {
  const url = (overlay: string) => `http://127.0.0.1:${s.engine.port}/overlays/${overlay}.html?${new URLSearchParams({ match: s.match!.code, screen: '1' })}`;
  const live = s.feed.state === 'live';
  return (
    <figure className="gmon onair live-monitor" aria-label="On air graphics">
      <div style={{ position: 'relative' }}>
        <Composite srcs={[url('ingame'), url('fullscreen')]} label="Graphics on air" image={image} />
        <span className="tag">{live ? <span className="onair-pill">● ON AIR</span> : <Tally kind="off">Game data off</Tally>}</span>
      </div>
      <figcaption className="mono muted"><span>What viewers see</span><span>{image ? `OBS program · ${sceneLabel(s.obs.programScene)}` : 'Sample backdrop (OBS not connected)'}</span></figcaption>
    </figure>
  );
}

/** Everything that is not one of the four zones: graphics, people, sponsors, messages. */
function AllGraphics({ s, run, cycle, close, openForm }: Pick<PageProps, 's' | 'run'> & { cycle: (row: LayerRow) => void; close: () => void; openForm: (f: 'toast' | 'poll') => void }) {
  const [q, setQ] = useState('');
  const match = (text: string) => !q.trim() || text.toLowerCase().includes(q.trim().toLowerCase());
  const rows = (g: LayerRow['group']) => s.layers.filter((l) => l.group === g && match(l.label));
  const talent = s.match ? onAir(s.match, s.event).talent.filter((t) => match(t.name)) : [];
  const sponsors = sponsorsOn(s).filter((x) => match(x.name));
  const observed = s.readout?.observed ?? null;
  return (
    <div className="scrim right" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="editor all-graphics" role="dialog" aria-modal="true" aria-label="All graphics">
        <header><h2 className="title-md">All graphics</h2><button className="btn quiet small" onClick={close}>Esc</button></header>
        <div className="editor-body">
          <input className="cell" aria-label="Search graphics, people, sponsors" placeholder="Search graphics, people, sponsors…" value={q} onChange={(e) => setQ(e.target.value)} />
          {(['ingame', 'between', 'fullscreen'] as const).map((g) => rows(g).length > 0 && (
            <section key={g} className="stack" style={{ gap: 4 }}><Cap>{g === 'ingame' ? 'Over the game' : g === 'between' ? 'Between rounds' : 'Full screen'}</Cap><LayerList s={s} rows={rows(g)} fire={cycle} /></section>
          ))}
          {(talent.length > 0 || match('spotlight')) && (
            <section className="stack" style={{ gap: 4 }}>
              <Cap>People</Cap>
              {talent.map((t) => {
                const on = s.triggers.person === t.name;
                return <div key={t.id} className="li show-row"><span>{t.name} <span className="faint t-xs">· {ROLE_NAME[t.role]}</span></span><button className="btn small" aria-pressed={on} onClick={() => void run(() => air.lowerThird(on ? null : { kind: 'person', name: t.name, role: ROLE_NAME[t.role] }))}>{on ? 'Hide' : 'Cue'}</button></div>;
              })}
              <div className="li show-row"><span>Player spotlight{observed ? ` · ${observed.name}` : ''}</span><button className="btn small" disabled={!observed} aria-pressed={s.triggers.player} onClick={() => void run(() => air.lowerThird(s.triggers.player ? null : { kind: 'player' }))}>{s.triggers.player ? 'Hide' : 'Cue'}</button></div>
            </section>
          )}
          {sponsors.length > 0 && (
            <section className="stack" style={{ gap: 4 }}>
              <Cap>Sponsors</Cap>
              {sponsors.map((x) => {
                const on = s.triggers.sponsor === x.id;
                return <div key={x.id} className="li show-row"><span>{x.name} read</span><button className="btn small" aria-pressed={on} onClick={() => void run(() => air.sponsorRead(on ? null : x.id))}>{on ? 'Hide' : 'Cue'}</button></div>;
              })}
            </section>
          )}
          <section className="stack" style={{ gap: 4 }}>
            <Cap>Messages</Cap>
            <div className="li show-row"><span>Toast</span><button className="btn small" onClick={() => { close(); openForm('toast'); }}>Write…</button></div>
            <div className="li show-row"><span>Poll</span><button className="btn small" onClick={() => { close(); openForm('poll'); }}>Write…</button></div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function ConsoleScreen({ s, run, go, openFix, openCasters }: PageProps) {
  const ref = useRef(s);
  ref.current = s;
  const [form, setForm] = useState<'toast' | 'poll' | null>(null);
  const [drawer, setDrawer] = useState(false);
  const frame = useMonitor(s.obs.state === 'connected');
  const now = useNow(!!s.readout);
  const cued = s.cue.pending.length > 0;

  const moment = (id: string, snap: Snapshot): Moment => {
    const talent = snap.match ? onAir(snap.match, snap.event).talent : [];
    switch (id) {
      case 'pause': return { id, label: 'Tech pause', detail: snap.triggers.pause === 'technical' ? 'On screen · press again to resume' : 'Pause panel with a clock', state: snap.triggers.pause === 'technical' ? 'live' : 'idle', built: true, fire: () => void run(() => air.pause(snap.triggers.pause === 'technical' ? null : 'technical')) };
      case 'timeout': return { id, label: 'Timeout', detail: snap.triggers.pause === 'timeout' ? 'On screen · press again to end' : 'Team timeout panel', state: snap.triggers.pause === 'timeout' ? 'live' : 'idle', built: true, fire: () => void run(() => air.pause(snap.triggers.pause === 'timeout' ? null : 'timeout')) };
      case 'replay': return { id, label: 'Replay', detail: snap.obs.replay.bufferActive === true ? 'Save the last moments in OBS' : 'Start the replay buffer in OBS first', state: 'idle', built: snap.obs.state === 'connected', fire: () => void run(() => air.replay()) };
      case 'toast': return { id, label: 'Toast', detail: 'Short on-screen update', state: form === 'toast' ? 'warn' : 'idle', built: true, fire: () => setForm(form === 'toast' ? null : 'toast') };
      case 'talent': return { id, label: 'Talent lower third', detail: talent.length ? (snap.triggers.strap ? 'On screen · press again to hide' : talent.map((c) => c.name).slice(0, 2).join(' & ')) : 'Add people in Event first', state: snap.triggers.strap ? 'live' : 'idle', built: true, fire: () => (talent.length ? void run(() => air.casterStrap(!snap.triggers.strap)) : openCasters()) };
      case 'poll': return { id, label: 'Poll', detail: snap.triggers.poll ? 'On screen' : 'Two options with a split', state: snap.triggers.poll ? 'live' : form === 'poll' ? 'warn' : 'idle', built: true, fire: () => setForm(form === 'poll' ? null : 'poll') };
      case 'sponsor': return { id, label: 'Sponsor read', detail: sponsorsOn(snap).length ? (snap.triggers.sponsor ? `${sponsorsOn(snap).find((x) => x.id === snap.triggers.sponsor)?.name ?? 'Sponsor'} on screen` : `Next: ${nextSponsor(snap)?.name}`) : 'Add sponsors in Event', state: snap.triggers.sponsor ? 'live' : 'idle', built: sponsorsOn(snap).length > 0, fire: () => void run(() => air.sponsorRead(snap.triggers.sponsor ? null : nextSponsor(snap)?.id ?? null)) };
      default: {
        const observed = snap.readout?.observed ?? null;
        return { id, label: 'Player spotlight', detail: observed ? (snap.triggers.player ? 'On screen · press again to hide' : observed.name) : 'Needs the game’s player list', state: snap.triggers.player ? 'live' : 'idle', built: !!observed, fire: () => void run(() => air.lowerThird(snap.triggers.player ? null : { kind: 'player' })) };
      }
    }
  };

  // Steps on from the cued mode, so pressing a key twice while cueing moves two steps.
  const cycle = (row: LayerRow) => {
    const from = row.cued ?? row.mode;
    void run(() => air.setLayer(row.id, row.id.startsWith('fs:') ? (from === 'on' ? 'off' : 'on') : nextMode(row.id, from)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') { if (form) setForm(null); else if (drawer) setDrawer(false); return; }
      if (e.repeat) return;
      const snap = ref.current;
      const id = actionFor(snap.keymap, e);
      if (!id) return;
      const button = (e.target as HTMLElement | null)?.tagName === 'BUTTON';
      if (id === 'take' && button) return; // a focused button handles Space itself
      e.preventDefault();
      if (id === 'fix') return openFix();
      if (id === 'all') return setDrawer((v) => !v);
      const cmd = keyCommand(id, snap);
      if (cmd !== 'ui') return runCommand(run, cmd);
      // Moments that open something in Air (the toast and poll forms, Talent with no one added).
      const m = moment(id, snap);
      if (m.built) m.fire();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const r = s.readout;
  const live = s.feed.state === 'live' || s.testRound.running;
  // A moment waiting in Cued reads as cued (amber) until it is taken.
  const moments = s.moments.filter((id) => ACTIONS.some((a) => a.id === id)).map((id) => moment(id, s)).map((m): Moment => {
    const cue = CUE_MATCH[m.id];
    return m.state === 'idle' && cue && s.cue.pending.some((l) => cue.test(l)) ? { ...m, state: 'cued', detail: `Cued · ${keyLabel(keyOf(s.keymap, 'take'))} to take` } : m;
  });
  const d = s.devices;

  return (
    <div className="live-grid">
      <div className="stack" style={{ gap: 12, minWidth: 0 }}>
        {!s.match && <div className="notice">No match selected. <button className="btn fix" onClick={() => go('ready')}>Choose a match</button></div>}
        {s.match && <OnAirMonitor s={s} image={frame?.pgm ?? null} />}
        <div className="datastrip" aria-label="Live data">
          {live && r ? (
            <>
              <span><b>Round {r.round ?? '—'}</b> · {(r.phase ?? '—')}{r.clockEndsAt && ['live', 'buy', 'planted'].includes(r.phase ?? '') ? ` · ~${clock(r.clockEndsAt - now)}` : ''}</span>
              <span className="sc">{r.score[0] ?? '–'} – {r.score[1] ?? '–'}</span>
              <span><b>Alive</b> {r.alive[0]} v {r.alive[1]}</span>
              {r.spikePlanted && r.clockEndsAt && <span style={{ color: 'var(--amber)' }}>Spike (inferred) ~{clock(r.clockEndsAt - now)}</span>}
              {s.testRound.running && <Tally kind="covered">Test round</Tally>}
            </>
          ) : <span className="muted">Waiting for game data</span>}
          <span className="spacer" />
          <span><i className={`dot ${s.feed.state === 'live' ? 'ok' : 'off'}`} /> Game data {s.feed.state === 'live' ? age(s.feed.ageMs) : 'off'}</span>
          {(s.setup.profile === 'player-pcs' || d.seats.some((x) => x.pc)) && <span><i className={`dot ${d.checkedIn === d.seats.length && d.seats.length ? 'ok' : 'warn'}`} /> Player PCs {d.checkedIn}/{d.seats.length}</span>}
          <span><i className={`dot ${s.obs.state === 'connected' ? 'ok' : 'warn'}`} /> OBS</span>
          <button className="btn small" onClick={openFix}>Fix data <span className="kbd">{keyLabel(keyOf(s.keymap, 'fix'))}</span></button>
        </div>
        <div className="live-log" aria-live="polite">
          {s.log.slice(0, 3).map((e, i) => <div key={`${e.t}-${i}`}><time className="mono">{new Date(e.t).toLocaleTimeString('en-GB')}</time><span>{e.text}</span></div>)}
        </div>
        {s.obs.state !== 'connected'
          ? <p className="muted t-sm">OBS is not connected: the monitor shows a sample backdrop. <button className="btn quiet small" onClick={() => go('settings')}>Connect OBS</button></p>
          : !s.obs.installed ? <div className="notice">The ESPORTRA scenes are not in OBS yet. <button className="btn fix" onClick={() => void run(() => air.installGraphics())}>Add for me</button></div> : null}
      </div>

      <aside className="stack live-side">
        {s.control !== 'companion' && <AutopilotCard s={s} run={run} />}

        <section className="zone" aria-label="Cued">
          <div className="between">
            <h2 className="title-sm">{s.cue.mode ? 'Cued' : 'Straight to air'}</h2>
            <label className="row-gap t-xs muted">Changes wait here<button type="button" className="switch" role="switch" aria-checked={s.cue.mode} aria-label="Cue changes before they go on air" onClick={() => void run(() => air.cueMode(!s.cue.mode))} /></label>
          </div>
          {s.cue.mode ? (cued ? (
            <>
              <div className="cue-list">{s.cue.pending.map((label, i) => <span key={`${label}-${i}`} className="cue-chip">{label}</span>)}</div>
              <div className="row-gap">
                <button className="btn primary" onClick={() => void run(() => air.cueTake('take'))}>Take <span className="kbd">{keyLabel(keyOf(s.keymap, 'take'))}</span></button>
                <button className="btn" onClick={() => void run(() => air.cueTake('stinger'))}>Behind the stinger <span className="kbd">{keyLabel(keyOf(s.keymap, 'stinger'))}</span></button>
                <button className="btn quiet small" onClick={() => void run(() => air.cueClear())}>Clear</button>
              </div>
            </>
          ) : <div className="cue-empty"><b>Nothing cued</b><span>Pick a moment or a graphic. It waits here until you press <span className="kbd">{keyLabel(keyOf(s.keymap, 'take'))}</span></span></div>)
            : <p className="muted t-sm">Every change goes on air the moment you make it.</p>}
        </section>

        <section className="zone" aria-label="Moments">
          <div className="between"><h2 className="title-sm">Moments</h2><button className="btn quiet small" onClick={() => go('settings')}>Choose</button></div>
          <div className="moments">
            {moments.map((m) => (
              <button key={m.id} className={`moment ${m.state}`} disabled={!m.built || !s.match} onClick={m.fire} aria-pressed={m.state !== 'idle'} title={m.detail}>
                <span><b>{m.label}</b><br /><span className="faint t-xs">{m.detail}</span></span>
                <span className="kbd">{keyLabel(keyOf(s.keymap, m.id))}</span>
              </button>
            ))}
          </div>
          {form === 'toast' && <ToastForm s={s} run={run} close={() => setForm(null)} />}
          {form === 'poll' && <PollForm s={s} run={run} close={() => setForm(null)} active={s.triggers.poll} />}
          <button className="btn" onClick={() => setDrawer(true)}>All graphics <span className="kbd">{keyLabel(keyOf(s.keymap, 'all'))}</span></button>
        </section>
      </aside>
      {drawer && <AllGraphics s={s} run={run} cycle={cycle} close={() => setDrawer(false)} openForm={setForm} />}
    </div>
  );
}
