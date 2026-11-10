import { useEffect, useState } from 'react';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import type { PageProps } from '../App.tsx';

export function CaptureScreen({ s, run, askCapture }: PageProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!s.testRound.running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [s.testRound.running]);
  const elapsed = s.testRound.running && s.testRound.startedAt ? Math.min(s.testRound.durationMs, now - s.testRound.startedAt) : 0;
  const kind = s.feed.state === 'live' ? (s.feed.paused ? 'covered' : 'live') : s.feed.state === 'waiting' ? 'covered' : s.feed.state === 'unavailable' ? 'bad' : 'off';
  return (
    <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px' }}>
      <div className="stack">
        <section className="panel">
          <div className="head"><Cap>Game data · Valorant</Cap><Tally kind={kind}>{s.feed.state === 'live' ? (s.feed.paused ? 'Paused' : 'Live') : s.feed.state === 'waiting' ? 'Waiting' : s.feed.state === 'unavailable' ? 'Unavailable' : 'Off'}</Tally></div>
          <div className="body-pad stack" style={{ gap: 12 }}>
            <p className="lead">{s.feed.state === 'off' ? 'Capture is off. Nothing is read from the game until you start it.' : s.feed.reason ?? (s.feed.state === 'live' ? `Live data is arriving${s.feed.ageMs !== null ? ` (last update ${(s.feed.ageMs / 1000).toFixed(1)} s ago)` : ''}.` : '')}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {s.feed.state === 'off' && <button className="btn primary" onClick={askCapture}>Start capture</button>}
              {(s.feed.state === 'waiting' || s.feed.state === 'live') && <button className="btn" onClick={() => void run(() => air.stopCapture())}>Stop capture</button>}
            </div>
            <p className="muted" style={{ fontSize: 12.5 }}>On this PC the data stays on your network and is never sent to Esportra. Feature status, latency and sparklines arrive in a later step.</p>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="head"><Cap>Simulate · no game needed</Cap></div>
        <div className="body-pad stack" style={{ gap: 12 }}>
          <p className="muted" style={{ fontSize: 12.5 }}>Plays a sample round with your team names through every output, so you can watch each graphic in OBS before the game starts. The match goes back exactly as it was.</p>
          <div className="datastrip" aria-live="polite"><span className="k">Test round</span>{s.testRound.running ? <span>▶ {Math.round(elapsed / 1000)} of {Math.round(s.testRound.durationMs / 1000)} s</span> : <span className="muted">Not playing</span>}</div>
          <button className="btn" disabled={!s.match} onClick={() => void run(() => air.testRound(s.testRound.running ? 'stop' : 'start'))}>{s.testRound.running ? 'Stop test round' : 'Play test round'}</button>
          {!s.match && <p className="muted" style={{ fontSize: 12.5 }}>Choose a match first.</p>}
        </div>
      </section>
    </div>
  );
}
