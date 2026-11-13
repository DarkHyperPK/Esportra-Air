import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Page, Snapshot } from '../shared/api.ts';
import { air } from './bridge.ts';
import { Rail, TopBar } from './components/Chrome.tsx';
import { CommandPalette, ShortcutsDialog, Toasts, type PaletteActions, type Toast } from './components/Global.tsx';
import { LOGO } from './components/ui.tsx';
import { ConsentDialog, Drawer, SignInDialog, StatusDrawer, type StatusId } from './components/Dialogs.tsx';
import { FixData } from './components/FixData.tsx';
import { ConsoleScreen } from './screens/ConsoleScreen.tsx';
import { ReadyScreen } from './screens/ReadyScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { LibraryScreen } from './screens/LibraryScreen.tsx';
import { EventsScreen, type EventView } from './screens/EventsScreen.tsx';
import type { Match } from '../shared/api.ts';
import type { EsportraMatch } from '../shared/esportra.ts';
import { HelpScreen } from './screens/HelpScreen.tsx';
import { CaptureOnlyScreen } from './components/Join.tsx';
import { FirstRun } from './components/FirstRun.tsx';

export type Run = (action: () => Promise<Snapshot | void>) => Promise<boolean>;

export type MatchStep = 'ready' | 'teams' | 'talent' | 'rundown' | 'obs' | 'devices' | 'rehearse';
export type MatchCommand = { name: 'new-match' | MatchStep | 'autopilot' | 'myshow'; n: number; eventId?: string | null } | null;

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
  const [page, setPage] = useState<Page>('event');
  // Which event is open on Events (none: the list of events).
  const [eventView, setEventView] = useState<EventView>({ id: null, tab: 'matches' });
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

  // OBS and devices are steps of the match now; old links open that step.
  const go = useCallback((next: Page) => {
    setStatus(null);
    if (next === 'scenes' || next === 'outputs' || next === 'capture') {
      setPage('ready');
      setMatchOpen(true);
      setCommand({ name: next === 'capture' ? 'devices' : 'obs', n: Date.now() });
      return;
    }
    setPage(next);
  }, []);

  // Air opens on Events, with the selected match's event open when there is one. Never Live: that is
  // where the show ends up, not where it starts.
  const landed = useRef(false);
  useEffect(() => {
    if (!s?.onboarding.done || landed.current) return;
    landed.current = true;
    if (s.event) setEventView({ id: s.event.id, tab: 'matches' });
  }, [s?.onboarding.done, s?.event?.id]);

  const actions: PaletteActions = useMemo(() => ({
    go: (p) => go(p),
    command: (name) => { go('ready'); if (name !== 'new-match') setMatchOpen(true); setCommand({ name, n: Date.now(), eventId: eventView.id }); },
    askCapture: () => setConsent(true), openFix: () => setFix(true), openCasters: () => { go('ready'); setMatchOpen(true); setCommand({ name: 'talent', n: Date.now() }); }, openSignIn: () => setSignIn(true), help: () => setHelp(true),
  }), [go, eventView.id]);

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

  const props: PageProps = { s, run, go, askCapture: () => setConsent(true), openFix: () => setFix(true), openCasters: () => { go('ready'); setMatchOpen(true); setCommand({ name: 'talent', n: Date.now() }); }, openSignIn: () => setSignIn(true) };
  const openMatch = async (m: Match) => { if (await run(() => air.selectMatch(m.id))) { setMatchOpen(true); setCommand({ name: 'ready', n: Date.now() }); setPage('ready'); } };
  const openRemote = async (e: EsportraMatch) => { if (await run(() => air.useEsportraMatch(e.id))) { setMatchOpen(true); setCommand({ name: 'ready', n: Date.now() }); setPage('ready'); } };
  const newMatch = (eventId: string) => { setPage('ready'); setCommand({ name: 'new-match', n: Date.now(), eventId }); };
  // From a match, the event it belongs to (its Talent and sponsors tab, or its matches).
  const openEvent = (tab: EventView['tab']) => { setEventView({ id: s.event?.id ?? null, tab }); setPage('event'); };

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
            {page === 'ready' && <ReadyScreen {...props} command={command} open={matchOpen} setOpen={setMatchOpen} openEvent={openEvent} start={() => { setStarted(true); setPage('console'); }} />}
            {page === 'event' && <EventsScreen s={s} run={run} openSignIn={() => setSignIn(true)} view={eventView} setView={setEventView} openMatch={(m) => void openMatch(m)} openRemote={(e) => void openRemote(e)} newMatch={newMatch} />}
            {page === 'help' && <HelpScreen s={s} run={run} />}
            {page === 'console' && <ConsoleScreen {...props} />}
            {page === 'library' && <LibraryScreen {...props} />}
            {page === 'settings' && <SettingsScreen {...props} />}
          </main>
        </div>
      </div>

      {status && <StatusDrawer id={status} s={s} close={() => setStatus(null)} go={go} run={run} askCapture={() => setConsent(true)} openSignIn={() => setSignIn(true)} />}
      {signIn && <SignInDialog s={s} run={run} close={() => setSignIn(false)} />}
      {fix && <Drawer title="Fix data" close={() => setFix(false)} wide><FixData s={s} run={run} close={() => setFix(false)} /></Drawer>}
      {consent && <ConsentDialog close={() => setConsent(false)} accept={async () => { setConsent(false); await run(() => air.startCapture({ consent: true })); }} />}
      {palette && <CommandPalette s={s} run={run} actions={actions} close={() => setPalette(false)} />}
      {help && <ShortcutsDialog s={s} close={() => setHelp(false)} manual={() => { setHelp(false); go('help'); }} />}
      <Toasts list={toasts} dismiss={dismiss} />
    </div>
  );
}
