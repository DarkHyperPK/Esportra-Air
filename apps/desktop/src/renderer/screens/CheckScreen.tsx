import { useEffect, useState } from 'react';
import type { ActionId } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import type { ScreenProps } from '../App.tsx';

const ICON = { ok: '✓', warn: '!', bad: '✕', off: '–' } as const;

export function CheckScreen({ s, run, go, askCapture }: ScreenProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!s.testRound.running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [s.testRound.running]);

  if (!s.match) {
    return (
      <div className="empty">
        <p>Choose or create a match first.</p>
        <button className="btn primary" style={{ marginTop: 14 }} onClick={() => go('match')}>Go to Match</button>
      </div>
    );
  }
  const open = s.checks.filter((c) => c.health === 'warn' || c.health === 'bad').length;
  const act = (id: ActionId) => {
    if (id === 'start-capture') return askCapture();
    if (id === 'open-setup-obs' || id === 'connect-obs') return go('setup', 'obs');
    if (id === 'install-graphics') void run(() => air.installGraphics());
  };
  const elapsed = s.testRound.running && s.testRound.startedAt ? Math.min(s.testRound.durationMs, now - s.testRound.startedAt) : 0;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Step 2 of 3 · {s.match.title}</p>
          <h1>{open ? `${open} ${open === 1 ? 'thing needs' : 'things need'} attention` : 'Everything is ready'}</h1>
          <p className="lead">Air checks these continuously. Fix what you can here; nothing stops you going live.</p>
        </div>
      </div>
      <div className="split">
        <section className="main card" aria-label="Checks">
          {s.checks.map((c) => (
            <div className="check" key={c.id}>
              <span className={`check-icon ${c.health}`} aria-hidden="true">{ICON[c.health]}</span>
              <span>
                <strong>{c.title}</strong>
                <span className="detail">{c.detail}</span>
              </span>
              {c.action ? <button className="btn" onClick={() => act(c.action!.id)}>{c.action.label}</button> : <span />}
            </div>
          ))}
        </section>
        <aside className="side stack">
          <div className="card pad stack">
            <h2 style={{ fontSize: 17 }}>Test round</h2>
            <p className="muted" style={{ fontSize: 14 }}>Plays a sample round with your team names through every output, so you can watch each graphic in OBS before the game starts. The match goes back exactly as it was afterwards.</p>
            <div className={`test-panel ${s.testRound.running ? 'on' : ''}`} aria-live="polite">
              {s.testRound.running ? `▶ Playing · ${Math.round(elapsed / 1000)} of ${Math.round(s.testRound.durationMs / 1000)} s` : 'Not playing'}
            </div>
            <button className="btn" onClick={() => void run(() => air.testRound(s.testRound.running ? 'stop' : 'start'))}>
              {s.testRound.running ? 'Stop test round' : 'Play test round'}
            </button>
          </div>
          <div className="card pad stack">
            <h2 style={{ fontSize: 17 }}>Ready when you are</h2>
            <p className="muted" style={{ fontSize: 14 }}>{open ? 'You can go live now. Open items stay visible in the status bar.' : 'All checks pass.'} Start your stream in OBS as usual; Air never starts or stops it.</p>
            <button className="btn primary big" onClick={() => go('live')}>Go to Live</button>
          </div>
        </aside>
      </div>
    </>
  );
}
