import { useEffect, useRef, useState } from 'react';
import type { FeatureStat, Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import { JoinPanel } from '../components/Join.tsx';
import type { PageProps } from '../App.tsx';
import { PageHeader } from '../components/Chrome.tsx';
import { gameName } from '../../shared/games.ts';

const SPEEDS = [0.5, 1, 2, 4, 8];

function Spark({ values, live }: { values: number[]; live: boolean }) {
  const max = Math.max(1, ...values);
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 118 + 1},${23 - (v / max) * 21}`).join(' ');
  return (
    <svg width="120" height="24" viewBox="0 0 120 24" role="img" aria-label="Messages per second over the last minute">
      <line x1="0" y1="23" x2="120" y2="23" stroke="rgba(255,255,255,0.08)" />
      <polyline points={points} fill="none" stroke={live ? 'var(--ok)' : 'var(--text-3)'} strokeWidth="1.5" />
    </svg>
  );
}

const age = (ms: number | null) => (ms === null ? '—' : ms < 1000 ? 'now' : ms < 60_000 ? `${Math.round(ms / 1000)} s ago` : `${Math.floor(ms / 60_000)} min ago`);

function FeatureRow({ f }: { f: FeatureStat }) {
  const tag = f.status === 'live' ? <Tally kind="live">Live</Tally> : f.status === 'quiet' ? <Tally kind="covered">Quiet</Tally> : f.status === 'player-pc' ? <Tally kind="off">Player PC</Tally> : <Tally kind="off">Waiting</Tally>;
  return (
    <tr>
      <td><b>{f.label}</b><div className="muted" style={{ fontSize: 11.5 }}>{f.detail}</div></td>
      <td>{tag}</td>
      <td className="mono" style={{ fontSize: 12 }}>{f.kind === 'event' && f.status === 'live' ? `last ${age(f.ageMs)}` : age(f.ageMs)}</td>
      <td><Spark values={f.spark} live={f.status === 'live'} /></td>
    </tr>
  );
}

function Simulate({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const t = s.testRound;
  const [speed, setSpeed] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => {
    if (!t.running) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [t.running]);
  const position = t.running && t.startedAt ? Math.min(t.durationMs, t.fromMs + (now - t.startedAt) * t.speed) : 0;
  const shown = drag ?? position;
  const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
  return (
    <section className="panel">
      <div className="head"><Cap>Test round on your outputs</Cap>{t.running && <Tally kind="covered">Sample data on air</Tally>}</div>
      <div className="body-pad stack" style={{ gap: 12 }}>
        <p className="muted t-sm">Plays three recorded rounds through the real outputs, so you can check OBS end to end before the game. It is on air: use it before you go live. Afterwards the match goes back exactly as it was. To watch a whole show privately, use Rehearse on the match page.</p>
        <div className="datastrip" aria-live="polite"><span className="k">Position</span>{t.running || drag !== null ? <span>{mmss(shown)} / {mmss(t.durationMs)}</span> : <span className="muted">Not playing</span>}</div>
        <input type="range" aria-label="Position in the sample match" min={0} max={Math.max(1, t.durationMs)} step={500} value={shown} disabled={!s.match}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={() => { if (drag !== null) void run(() => air.testRound(t.running ? 'seek' : 'start', { speed: t.running ? t.speed : speed, from: drag })).then(() => setDrag(null)); }}
          onKeyUp={() => { if (drag !== null) void run(() => air.testRound(t.running ? 'seek' : 'start', { speed: t.running ? t.speed : speed, from: drag })).then(() => setDrag(null)); }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="seg" role="group" aria-label="Speed">
            {SPEEDS.map((x) => <button key={x} aria-pressed={(t.running ? t.speed : speed) === x} disabled={!s.match} onClick={() => { setSpeed(x); if (t.running) void run(() => air.testRound('seek', { speed: x, from: position })); }}>{x}×</button>)}
          </div>
          <button className={`btn ${t.running ? '' : 'primary'}`} disabled={!s.match} onClick={() => void run(() => air.testRound(t.running ? 'stop' : 'start', { speed }))}>{t.running ? 'Stop and restore' : 'Play'}</button>
        </div>
        {!s.match && <p className="muted" style={{ fontSize: 12.5 }}>Choose a match first.</p>}
      </div>
    </section>
  );
}

export function CaptureScreen({ s, run, askCapture, go }: PageProps) {
  const c = s.capture;
  const kind = s.feed.state === 'live' ? (s.feed.paused ? 'covered' : 'live') : s.feed.state === 'waiting' ? 'covered' : s.feed.state === 'unavailable' ? 'bad' : 'off';
  const r = s.readout;
  const source = s.testRound.running ? 'Simulation' : s.feed.state === 'off' ? 'Off' : `${s.game?.name ?? 'Game'} game data`;
  const stat = (k: string, v: string, note: string) => <div className="stat"><Cap>{k}</Cap><div className="v">{v}</div><div className="muted" style={{ fontSize: 11.5 }}>{note}</div></div>;
  return (
    <>
    <PageHeader eyebrow="Capture" title="Game data" actions={s.feed.state === 'off' ? <button className="btn primary" onClick={askCapture}>Start capture</button> : <button className="btn" onClick={() => void run(() => air.stopCapture())}>Stop capture</button>}>
      What Air reads from {s.match ? gameName(s.match.game) : 'the game'} on this PC, how fresh it is, and what each graphic can rely on. Capture only starts when you allow it.
    </PageHeader>
    <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px' }}>
      <div className="stack">
        <div className="stats4" aria-label="Capture health">
          {stat('Source', source, s.feed.state === 'off' ? 'Capture is off' : 'Observer PC · this machine')}
          {stat('Last data', s.testRound.running ? '—' : age(s.feed.ageMs ?? c.lastAgeMs), s.testRound.running ? 'The rehearsal does not use the capture' : s.feed.paused ? 'Feed paused: graphics hold their last values' : 'Counts as quiet after 10 s')}
          {stat('Messages / s', c.messagesPerSec.toFixed(1), `${c.total.toLocaleString('en-US')} since capture started`)}
          {stat('Gaps', String(c.gaps), 'Silences of 10 s or more')}
        </div>

        <section className="panel">
          <div className="head">
            <Cap>Game data · Valorant</Cap>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Tally kind={kind}>{s.feed.state === 'live' ? (s.feed.paused ? 'Paused' : 'Live') : s.feed.state === 'waiting' ? 'Waiting' : s.feed.state === 'unavailable' ? 'Unavailable' : 'Off'}</Tally>
              {s.feed.state === 'off' && <button className="btn primary small" onClick={askCapture}>Start capture</button>}
              {(s.feed.state === 'waiting' || s.feed.state === 'live') && <button className="btn small" onClick={() => void run(() => air.stopCapture())}>Stop capture</button>}
            </div>
          </div>
          <div className="body-pad">
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{s.feed.state === 'off' ? 'Capture is off. Nothing is read from the game until you start it.' : s.feed.reason ?? 'Each row is one kind of game data Air reads. The line is the last minute of messages.'} On this PC the data stays on your network.</p>
            <table className="seg-table feat">
              <thead><tr><th>Feature</th><th>Status</th><th>Last</th><th>Last 60 s</th></tr></thead>
              <tbody>{c.features.map((f) => <FeatureRow key={f.id} f={f} />)}</tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="stack">
        <Simulate s={s} run={run} />
        <section className="panel">
          <div className="head"><Cap>Live state</Cap></div>
          <div className="body-pad">
            {r ? (
              <dl className="readout">
                <dt>Map</dt><dd>{r.map ?? '—'}</dd>
                <dt>Round</dt><dd>{r.round ?? '—'} · {(r.phase ?? '—').toUpperCase()}</dd>
                <dt>Score</dt><dd>{r.score[0] ?? '–'} – {r.score[1] ?? '–'}</dd>
                <dt>Sides</dt><dd>{r.sides[0] ?? '—'} / {r.sides[1] ?? '—'}</dd>
                <dt>Players found</dt><dd>{r.playersFound[0]} + {r.playersFound[1]} of 10</dd>
                <dt>Round clock</dt><dd>Estimated from the phase</dd>
                <dt>Spike</dt><dd>{r.spikePlanted ? 'Planted (inferred)' : 'Not planted'}</dd>
                <dt>Alive</dt><dd>{r.alive[0]} v {r.alive[1]}</dd>
                <dt>Observed</dt><dd>{r.observed?.name ?? '—'}</dd>
              </dl>
            ) : <p className="muted" style={{ fontSize: 12.5 }}>Choose a match to see its state.</p>}
          </div>
        </section>
        <JoinPanel s={s} run={run} />
        <section className="panel">
          <div className="head"><Cap>If the data stops</Cap></div>
          <div className="body-pad"><p className="muted" style={{ fontSize: 12.5 }}>After 10 s of silence the feed counts as paused: graphics hold their last values and the Console says so. Nothing is invented. Use Fix data (Ctrl+D) for a wrong score or name, and the pause panel (F1) when play stops.</p></div>
        </section>
      </div>
    </div>
    </>
  );
}
