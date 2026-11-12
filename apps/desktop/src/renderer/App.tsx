import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Page, Snapshot } from '../shared/api.ts';
import { air } from './bridge.ts';
import { Rail, TopBar } from './components/Chrome.tsx';
import { CommandPalette, ShortcutsDialog, Toasts, type PaletteActions, type Toast } from './components/Global.tsx';
import { LOGO } from './components/ui.tsx';
import { ConsentDialog, Drawer, SignInDialog, StatusDrawer, type StatusId } from './components/Dialogs.tsx';
import { FixData } from './components/FixData.tsx';
import { DevicesScreen } from './screens/DevicesScreen.tsx';
import { ConsoleScreen } from './screens/ConsoleScreen.tsx';
import { OutputsScreen } from './screens/OutputsScreen.tsx';
import { ReadyScreen } from './screens/ReadyScreen.tsx';
import { ScenesScreen } from './screens/ScenesScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { LibraryScreen } from './screens/LibraryScreen.tsx';
import { EventScreen } from './screens/EventScreen.tsx';
import { CaptureOnlyScreen } from './components/Join.tsx';
import { FirstRun } from './components/FirstRun.tsx';

export type Run = (action: () => Promise<Snapshot | void>) => Promise<boolean>;

export type MatchCommand = { name: 'new-match' | 'rehearse' | 'autopilot' | 'teams' | 'talent' | 'myshow'; n: number } | null;

export interface PageProps {
  s: Snapshot;
  run: Run;
  go: (page: Page) => void;
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [command, setCommand] = useState<MatchCommand>(null);
  // Matches shows the open match's workspace until the producer goes back to the list.
  const [matchOpen, setMatchOpen] = useState(false);
  const [status, setStatus] = useState<StatusId | null>(null);
  const [consent, setConsent] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [fix, setFix] = useState(false);

  useEffect(() => {
    void air.snapshot().then((snap) => snap && setSnapshot(snap as Snapshot));
    return air.onSnapshot(setSnapshot);
  }, []);

  const toast = useCallback((t: Omit<Toast, 'id'>) => setToasts((list) => [...list.filter((x) => x.text !== t.text), { ...t, id: Date.now() + Math.random() }].slice(-3)), []);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const run: Run = useCallback(async (action) => {
    try {
      const result = await action();
      if (result) setSnapshot(result);
      return true;
    } catch (e) {
      toast({ kind: 'error', title: 'Not done', text: (e as Error).message });
      return false;
    }
  }, [toast]);

  // Ctrl+K anywhere opens search; ? opens keyboard help when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(el?.tagName ?? '');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      } else if (e.key === '?' && !typing && !palette) {
        e.preventDefault();
        setHelp((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [palette]);

  const go = useCallback((next: Page) => {
    setPage(next);
    setStatus(null);
  }, []);

  // Where the app opens: Matches, or Event when there is no event yet (the first thing to set up).
  // Never Live: that is where the show ends up, not where it starts.
  const landed = useRef(false);
  useEffect(() => {
    if (!s?.onboarding.done || landed.current) return;
    landed.current = true;
    if (!s.events.length) setPage('event');
  }, [s?.onboarding.done, s?.events.length]);

  const actions: PaletteActions = useMemo(() => ({
    go: (p) => go(p),
    command: (name) => { go('ready'); setCommand({ name, n: Date.now() }); },
    askCapture: () => setConsent(true), openFix: () => setFix(true), openCasters: () => { go('ready'); setCommand({ name: 'talent', n: Date.now() }); }, openSignIn: () => setSignIn(true), help: () => setHelp(true),
  }), [go]);

  if (!s) return <div className="win"><TopBar s={null} /><div className="splash" role="status"><div>{LOGO}<span>Starting Esportra Air…</span></div></div></div>;

  if (s.mode === 'capture') {
    return (
      <div className="win">
        <TopBar s={s} />
        <div className="body"><div className="main"><main className="page"><CaptureOnlyScreen s={s} run={run} askCapture={() => setConsent(true)} /></main></div></div>
        {consent && <ConsentDialog close={() => setConsent(false)} accept={async () => { setConsent(false); await run(() => air.startCapture({ consent: true })); }} />}
        <Toasts list={toasts} dismiss={dismiss} />
      </div>
    );
  }

  if (!s.onboarding.done) {
    return (
      <>
        <FirstRun s={s} run={run} />
        <Toasts list={toasts} dismiss={dismiss} />
      </>
    );
  }

  const props: PageProps = { s, run, go, askCapture: () => setConsent(true), openFix: () => setFix(true), openCasters: () => { go('ready'); setCommand({ name: 'talent', n: Date.now() }); }, openSignIn: () => setSignIn(true) };

  return (
    <div className="win">
      <TopBar s={s} page={page} open={(id) => setStatus(id)} search={() => setPalette(true)} help={() => setHelp(true)} run={run} />
      <div className="body">
        <Rail page={page} go={(p) => go(p)} onAir={s.feed.state === 'live'} />
        <div className="main">
          {s.engine.state !== 'running' && (
            <div className={`notice ${s.engine.state === 'failed' ? 'bad' : ''}`} role="status" style={{ margin: '12px 24px 0' }}>
              {s.engine.state === 'starting' ? 'Starting the graphics engine…' : s.engine.error}
            </div>
          )}
          {s.recovery && (
            <div className="notice info" role="status" style={{ margin: '12px 24px 0' }}>
              <span className="grow">{s.recovery}</span>
              <button className="btn quiet small" onClick={() => void run(() => air.recoveryDismiss())}>Dismiss</button>
            </div>
          )}
          <main className="page">
            {page === 'ready' && <ReadyScreen {...props} command={command} open={matchOpen} setOpen={setMatchOpen} start={() => { setStarted(true); setPage('console'); }} />}
            {page === 'event' && <EventScreen s={s} run={run} />}
            {page === 'console' && <ConsoleScreen {...props} />}
            {page === 'library' && <LibraryScreen {...props} />}
            {page === 'scenes' && <ScenesScreen {...props} />}
            {page === 'capture' && <DevicesScreen {...props} />}
            {page === 'outputs' && <OutputsScreen {...props} />}
            {page === 'settings' && <SettingsScreen {...props} />}
          </main>
        </div>
      </div>

      {status && <StatusDrawer id={status} s={s} close={() => setStatus(null)} go={go} run={run} askCapture={() => setConsent(true)} openSignIn={() => setSignIn(true)} />}
      {signIn && <SignInDialog s={s} run={run} close={() => setSignIn(false)} />}
      {fix && <Drawer title="Fix data" close={() => setFix(false)} wide><FixData s={s} run={run} close={() => setFix(false)} /></Drawer>}
      {consent && <ConsentDialog close={() => setConsent(false)} accept={async () => { setConsent(false); await run(() => air.startCapture({ consent: true })); }} />}
      {palette && <CommandPalette s={s} run={run} actions={actions} close={() => setPalette(false)} />}
      {help && <ShortcutsDialog close={() => setHelp(false)} />}
      <Toasts list={toasts} dismiss={dismiss} />
    </div>
  );
}
