import { useEffect, useRef } from 'react';
import type { Health, Snapshot, Stage } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import type { SetupTab } from '../screens/SetupScreen.tsx';

export interface StripItem {
  id: 'feed' | 'graphics' | 'obs' | 'esportra';
  title: string;
  health: Health;
  value: string;
}

function useEscape(close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return ref;
}

export function ConsentDialog({ close, accept }: { close: () => void; accept: () => void }) {
  const ref = useEscape(close);
  return (
    <div className="overlay center">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title" ref={ref}>
        <h2 id="consent-title" style={{ fontSize: 21 }}>Start game capture on this PC?</h2>
        <p style={{ color: '#d4d4d8', lineHeight: 1.55 }}>
          Air will read live data for every player in the observed Valorant match: agents, health, credits, weapons and kills. On this PC the data
          stays on your network and is never sent to Esportra.
        </p>
        <p className="muted" style={{ fontSize: 14 }}>Capture stays off until you allow it. You can stop it at any time from Game feed in the status bar.</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn quiet" onClick={close}>Not now</button>
          <button className="btn primary" onClick={accept}>Allow and start capture</button>
        </div>
      </div>
    </div>
  );
}

const EXPLAIN: Record<StripItem['id'], (s: Snapshot) => string> = {
  feed: (s) =>
    s.feed.state === 'live'
      ? `Live data is arriving from Valorant${s.feed.ageMs !== null ? ` (last update ${(s.feed.ageMs / 1000).toFixed(1)} s ago)` : ''}. If it stops during a round, the HUD shows “Feed paused” and keeps the last data.`
      : s.feed.state === 'waiting'
        ? `${s.feed.reason ?? 'Waiting for Valorant.'} Open Valorant on this PC and join the custom game as an observer.`
        : s.feed.state === 'unavailable'
          ? s.feed.reason ?? 'Game capture is not available on this PC.'
          : 'Game capture is off. Start it when the observer is ready; nothing is read from the game until you do.',
  graphics: (s) =>
    s.engine.state !== 'running'
      ? s.engine.error ?? 'The graphics engine is not running.'
      : s.obs.installed
        ? 'Air’s graphics engine serves every output. It runs separately from this window, so graphics stay on air if Air is closed or restarts.'
        : 'Your graphics are ready but not in OBS yet. Installing adds one Air scene per screen and never changes your other scenes.',
  obs: (s) =>
    s.obs.state === 'connected'
      ? `Connected to OBS ${s.obs.version ?? ''}. Air reads which scene is on air; switching is always done in OBS.`
      : s.obs.error ?? 'Connect to OBS WebSocket (OBS › Tools › WebSocket Server Settings).',
  esportra: () => 'Not signed in. Quick matches work without an Esportra account. Signing in to use your Esportra tournaments comes next.',
};

export function StatusDrawer({ item, s, close, go, run, askCapture }: { item: StripItem; s: Snapshot; close: () => void; go: (stage: Stage, tab?: SetupTab) => void; run: Run; askCapture: () => void }) {
  const ref = useEscape(close);
  let fix: { label: string; act: () => void } | null = null;
  if (item.id === 'feed' && s.feed.state === 'off') fix = { label: 'Start game capture', act: () => { close(); askCapture(); } };
  if (item.id === 'feed' && (s.feed.state === 'waiting' || s.feed.state === 'live')) fix = { label: 'Stop capture', act: () => void run(() => air.stopCapture()).then(close) };
  if (item.id === 'graphics' && s.obs.state === 'connected' && !s.obs.installed) fix = { label: 'Install graphics in OBS', act: () => void run(() => air.installGraphics()).then(close) };
  if ((item.id === 'obs' && s.obs.state !== 'connected') || (item.id === 'graphics' && s.obs.state !== 'connected')) fix = { label: 'Open OBS setup', act: () => go('setup', 'obs') };
  return (
    <div className="overlay right" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" ref={ref}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="row">
            <span className={`dot ${item.health}`} aria-hidden="true" />
            <h2 id="drawer-title" style={{ fontSize: 20 }}>{item.title}</h2>
          </span>
          <button className="btn quiet" onClick={close} aria-label="Close">✕</button>
        </div>
        <p style={{ fontSize: 16, fontWeight: 600 }}>{item.value}</p>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>{EXPLAIN[item.id](s)}</p>
        {fix && <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={fix.act}>{fix.label}</button>}
      </div>
    </div>
  );
}
