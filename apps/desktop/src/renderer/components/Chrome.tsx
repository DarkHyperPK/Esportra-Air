import { useEffect, useState } from 'react';
import type { Page, Snapshot } from '../../shared/api.ts';
import { ICONS, LOGO } from './ui.tsx';

const RAIL: Array<[Exclude<Page, 'setup' | 'settings'>, string]> = [
  ['console', 'Live'],
  ['ready', 'Matches'],
  ['scenes', 'Scenes'],
  ['outputs', 'Outputs'],
  ['capture', 'Capture'],
];

export function TitleBar({ s }: { s: Snapshot }) {
  return (
    <div className="titlebar">
      {LOGO}
      <b>Esportra Air</b>
      <span>{s.match ? `— ${s.match.title}${s.match.event.name ? ` · ${s.match.event.name}` : ''}` : '— No match selected'}</span>
    </div>
  );
}

export function Rail({ page, go }: { page: Page; go: (p: Page) => void }) {
  return (
    <nav className="rail" aria-label="Main">
      {RAIL.map(([id, label]) => (
        <button key={id} aria-current={page === id ? 'page' : undefined} onClick={() => go(id)}>
          {ICONS[id]}
          {label}
        </button>
      ))}
      <span className="spacer" />
      <button aria-current={page === 'settings' ? 'page' : undefined} onClick={() => go('settings')}>
        {ICONS.setup}
        Settings
      </button>
    </nav>
  );
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const zone = () => new Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';

export function ChipBar({ s, open }: { s: Snapshot; open: (id: 'feed' | 'obs' | 'esportra' | 'graphics') => void }) {
  const now = useClock();
  const gep = s.feed.state === 'live' ? (s.feed.paused ? 'Paused' : 'Live') : s.feed.state === 'waiting' ? 'Waiting' : s.feed.state === 'unavailable' ? 'Unavailable' : 'Off';
  const gepDot = s.feed.state === 'live' && !s.feed.paused ? 'ok' : s.feed.state === 'off' ? 'off' : s.feed.state === 'unavailable' ? 'bad' : 'warn';
  const obsDot = s.obs.state === 'connected' ? 'ok' : s.obs.state === 'error' ? 'bad' : 'warn';
  return (
    <div className="chipbar">
      <button className="chip" onClick={() => open('feed')}><span className={`dot ${gepDot}`} /><span className="k">GEP</span><span className="v">{gep}</span></button>
      <button className="chip" onClick={() => open('obs')}><span className={`dot ${obsDot}`} /><span className="k">OBS</span><span className="v">{s.obs.state === 'connected' ? `v${s.obs.version ?? ''}` : 'Not connected'}</span></button>
      <button className="chip" onClick={() => open('esportra')}><span className={`dot ${s.esportra.state === 'online' ? 'ok' : s.esportra.state === 'signed-out' ? 'off' : 'warn'}`} /><span className="k">Esportra</span><span className="v">{s.esportra.state === 'signed-out' ? 'Not signed in' : s.esportra.state === 'online' ? 'Signed in' : s.esportra.state === 'offline' ? 'Offline' : 'No access'}</span></button>
      <button className="chip" onClick={() => open('graphics')}><span className={`dot ${s.engine.state === 'running' ? 'ok' : 'bad'}`} /><span className="k">Engine</span><span className="v">127.0.0.1:{s.engine.port ?? '—'}</span></button>
      <span className="clock" aria-label="Local time">{now.toLocaleTimeString('en-GB')} {zone()}</span>
    </div>
  );
}
