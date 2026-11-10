import { useCallback, useEffect, useState } from 'react';
import type { Page, Snapshot } from '../shared/api.ts';
import { air } from './bridge.ts';
import { ChipBar, Rail, TitleBar } from './components/Chrome.tsx';
import { CastersDrawer, ConsentDialog, Drawer, SignInDialog, StatusDrawer, type StatusId } from './components/Dialogs.tsx';
import { FixData } from './components/FixData.tsx';
import { CaptureScreen } from './screens/CaptureScreen.tsx';
import { ConsoleScreen } from './screens/ConsoleScreen.tsx';
import { OutputsScreen } from './screens/OutputsScreen.tsx';
import { ReadyScreen } from './screens/ReadyScreen.tsx';
import { ScenesScreen } from './screens/ScenesScreen.tsx';
import { SetupScreen, type SetupTab } from './screens/SetupScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { CaptureOnlyScreen } from './components/Join.tsx';

export type Run = (action: () => Promise<Snapshot | void>) => Promise<boolean>;

export interface PageProps {
  s: Snapshot;
  run: Run;
  go: (page: Page, tab?: SetupTab) => void;
  askCapture: () => void;
  openFix: () => void;
  openCasters: () => void;
  openSignIn: () => void;
}

export function App() {
  const [s, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<Page>('ready');
  // Until the producer chooses Run manually, Console opens the readiness check.
  const [started, setStarted] = useState(false);
  const [tab, setTab] = useState<SetupTab>('graphics');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusId | null>(null);
  const [consent, setConsent] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [fix, setFix] = useState(false);
  const [casters, setCasters] = useState(false);

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

  const go = useCallback((next: Page, nextTab?: SetupTab) => {
    setPage(next);
    if (nextTab) setTab(nextTab);
    setStatus(null);
  }, []);

  if (!s) return <div className="win"><div className="page"><p className="muted">Starting Esportra Air…</p></div></div>;

  if (s.mode === 'capture') {
    return (
      <div className="win">
        <TitleBar s={s} />
        <div className="body"><div className="main"><main className="page"><CaptureOnlyScreen s={s} run={run} askCapture={() => setConsent(true)} /></main></div></div>
        {consent && <ConsentDialog close={() => setConsent(false)} accept={async () => { setConsent(false); await run(() => air.startCapture({ consent: true })); }} />}
        {error && <div className="alert" role="alert"><span>{error}</span><button className="btn quiet small" onClick={() => setError(null)}>Dismiss</button></div>}
      </div>
    );
  }

  const props: PageProps = { s, run, go, askCapture: () => setConsent(true), openFix: () => setFix(true), openCasters: () => setCasters(true), openSignIn: () => setSignIn(true) };
  const railPage: Page = page === 'setup' ? 'ready' : page;

  return (
    <div className="win">
      <TitleBar s={s} />
      <div className="body">
        <Rail page={railPage} go={(p) => go(p)} />
        <div className="main">
          <ChipBar s={s} open={(id) => setStatus(id)} />
          {s.engine.state !== 'running' && (
            <div className={`notice ${s.engine.state === 'failed' ? 'bad' : ''}`} role="status" style={{ margin: '0 20px 8px' }}>
              {s.engine.state === 'starting' ? 'Starting the graphics engine…' : s.engine.error}
            </div>
          )}
          <main className="page">
            {page === 'ready' && <ReadyScreen {...props} start={() => { setStarted(true); setPage('console'); }} />}
            {page === 'console' && <ConsoleScreen {...props} />}
            {page === 'scenes' && <ScenesScreen {...props} />}
            {page === 'capture' && <CaptureScreen {...props} />}
            {page === 'outputs' && <OutputsScreen {...props} />}
            {page === 'settings' && <SettingsScreen {...props} />}
            {page === 'setup' && <SetupScreen {...props} tab={tab} setTab={setTab} />}
          </main>
        </div>
      </div>

      {status && <StatusDrawer id={status} s={s} close={() => setStatus(null)} go={go} run={run} askCapture={() => setConsent(true)} openSignIn={() => setSignIn(true)} />}
      {signIn && <SignInDialog s={s} run={run} close={() => setSignIn(false)} />}
      {fix && <Drawer title="Fix data" close={() => setFix(false)} wide><FixData s={s} run={run} close={() => setFix(false)} /></Drawer>}
      {casters && <CastersDrawer s={s} run={run} close={() => setCasters(false)} />}
      {consent && <ConsentDialog close={() => setConsent(false)} accept={async () => { setConsent(false); await run(() => air.startCapture({ consent: true })); }} />}
      {error && (
        <div className="alert" role="alert">
          <span>{error}</span>
          <button className="btn quiet small" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}
