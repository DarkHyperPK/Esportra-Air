import { useCallback, useEffect, useState } from 'react';
import type { Health, Snapshot, Stage } from '../shared/api.ts';
import { air } from './bridge.ts';
import { MatchScreen } from './screens/MatchScreen.tsx';
import { CheckScreen } from './screens/CheckScreen.tsx';
import { LiveScreen } from './screens/LiveScreen.tsx';
import { SetupScreen, type SetupTab } from './screens/SetupScreen.tsx';
import { ConsentDialog, StatusDrawer, type StripItem } from './components/Dialogs.tsx';

export type Run = (action: () => Promise<Snapshot | void>) => Promise<boolean>;

export interface ScreenProps {
  s: Snapshot;
  run: Run;
  go: (stage: Stage, tab?: SetupTab) => void;
  askCapture: () => void;
}

const RAIL: Array<[Stage, string, string]> = [
  ['match', '1', 'Match'],
  ['check', '2', 'Check'],
  ['live', '3', 'Live'],
];

export function App() {
  const [s, setSnapshot] = useState<Snapshot | null>(null);
  const [stage, setStage] = useState<Stage>('match');
  const [tab, setTab] = useState<SetupTab>('graphics');
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<StripItem['id'] | null>(null);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    void air.snapshot().then((snap) => snap && setSnapshot(snap as Snapshot));
    return air.onSnapshot(setSnapshot);
  }, []);

  const run: Run = useCallback(async (action) => {
    try {
      const result = await action();
      if (result) setSnapshot(result);
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }, []);

  const go = useCallback((next: Stage, nextTab?: SetupTab) => {
    setStage(next);
    if (nextTab) setTab(nextTab);
    setDrawer(null);
  }, []);

  if (!s) {
    return (
      <div className="app">
        <main className="page">
          <p className="muted">Starting Esportra Air…</p>
        </main>
      </div>
    );
  }

  const props: ScreenProps = { s, run, go, askCapture: () => setConsent(true) };
  const strip = stripItems(s);
  const stageIndex = RAIL.findIndex(([id]) => id === stage);

  return (
    <div className="app">
      <header className="top">
        <div className="top-left">
          <span className="mark" aria-hidden="true">A</span>
          <button className="production-btn" aria-current={stage === 'setup' ? 'page' : undefined} onClick={() => go('setup')} aria-label={`Production setup for ${s.setup.name}`}>
            <span>
              <strong>{s.setup.name}</strong>
              <small>Production setup</small>
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        </div>
        <nav className="rail" aria-label="Match day">
          {RAIL.map(([id, num, label], i) => (
            <span key={id} className="row" style={{ gap: 4 }}>
              <button className={`rail-step ${stageIndex > i ? 'done' : ''}`} aria-current={stage === id ? 'step' : undefined} onClick={() => go(id)}>
                <span className="rail-num">{num}</span>
                {label}
              </button>
              {i < RAIL.length - 1 && <span className="rail-sep" aria-hidden="true">›</span>}
            </span>
          ))}
        </nav>
        <div className="top-right">{s.match ? <span>{s.match.title}</span> : <span>No match selected</span>}</div>
      </header>

      {s.engine.state !== 'running' && (
        <div className={`banner ${s.engine.state === 'failed' ? 'bad' : 'warn'}`} role="status">
          <span className={`dot ${s.engine.state === 'failed' ? 'bad' : 'warn'}`} />
          {s.engine.state === 'starting' ? 'Starting the graphics engine…' : s.engine.error}
        </div>
      )}

      <main className="page">
        {stage === 'setup' && <SetupScreen {...props} tab={tab} setTab={setTab} />}
        {stage === 'match' && <MatchScreen {...props} />}
        {stage === 'check' && <CheckScreen {...props} />}
        {stage === 'live' && <LiveScreen {...props} />}
      </main>

      <footer className="strip" aria-label="Production status">
        {strip.map((item) => (
          <button key={item.id} onClick={() => setDrawer(item.id)}>
            <span className={`dot ${item.health}`} aria-hidden="true" />
            <strong>{item.title}</strong>
            <span className="muted">{item.value}</span>
            <span className="sr-only">({item.health === 'ok' ? 'ready' : 'needs attention'})</span>
          </button>
        ))}
        <span className="note">
          {s.engine.state === 'running' ? `Graphics engine running${s.engine.reattached ? ' (reconnected)' : ''} · stays on air if Air closes` : 'Graphics engine unavailable'}
        </span>
      </footer>

      {drawer && <StatusDrawer item={strip.find((i) => i.id === drawer)!} s={s} close={() => setDrawer(null)} go={go} run={run} askCapture={() => setConsent(true)} />}
      {consent && (
        <ConsentDialog
          close={() => setConsent(false)}
          accept={async () => {
            setConsent(false);
            await run(() => air.startCapture({ consent: true }));
          }}
        />
      )}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button className="btn quiet small" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

export function stripItems(s: Snapshot): StripItem[] {
  const feed: [Health, string] =
    s.feed.state === 'live' ? (s.feed.paused ? ['warn', 'Paused · no recent data'] : ['ok', 'Receiving']) :
    s.feed.state === 'waiting' ? ['warn', 'Waiting for Valorant'] :
    s.feed.state === 'unavailable' ? ['bad', 'Unavailable'] : ['off', 'Off'];
  const loading = s.outputs.filter((o) => o.connections > 0).length;
  const graphics: [Health, string] =
    s.engine.state !== 'running' ? ['bad', 'Engine not running'] :
    !s.obs.installed ? ['warn', 'Not in OBS yet'] :
    loading < s.outputs.length ? ['warn', `${loading} of ${s.outputs.length} loading`] : ['ok', `${s.outputs.length} outputs live`];
  const obs: [Health, string] =
    s.obs.state === 'connected' ? ['ok', s.obs.programScene ? `On air: ${s.obs.programScene}` : 'Connected'] :
    s.obs.state === 'connecting' ? ['warn', 'Connecting…'] : ['warn', 'Not connected'];
  return [
    { id: 'feed', title: 'Game feed', health: feed[0], value: feed[1] },
    { id: 'graphics', title: 'Graphics', health: graphics[0], value: graphics[1] },
    { id: 'obs', title: 'OBS', health: obs[0], value: obs[1] },
    { id: 'esportra', title: 'Esportra', health: 'off', value: 'Not signed in' },
  ];
}
