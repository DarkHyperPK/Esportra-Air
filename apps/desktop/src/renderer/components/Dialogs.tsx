import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Caster, Page, Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { Cap } from './ui.tsx';

export type StatusId = 'feed' | 'obs' | 'esportra' | 'graphics';

function useEscape(close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [close]);
  return ref;
}

export function Drawer({ title, close, children, wide }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useEscape(close);
  return (
    <div className="scrim right" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="drawer" style={wide ? { maxWidth: 520 } : undefined} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn quiet small" onClick={close} aria-label="Close">Esc · Close</button></div>
        {children}
      </div>
    </div>
  );
}

export function ConsentDialog({ close, accept }: { close: () => void; accept: () => void }) {
  const ref = useEscape(close);
  return (
    <div className="scrim center">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title" ref={ref}>
        <Cap>Game capture</Cap>
        <h2 id="consent-title" className="title-md">Start game capture on this PC?</h2>
        <p style={{ color: 'var(--text-2)', lineHeight: 1.55 }}>Air will read live data for every player in the observed Valorant match: agents, health, credits, weapons and kills. On this PC the data stays on your network and is never sent to Esportra.</p>
        <p className="muted" style={{ fontSize: 12.5 }}>Capture stays off until you allow it. Stop it at any time from Capture.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn quiet" onClick={close}>Not now</button>
          <button className="btn primary" onClick={accept}>Allow and start capture</button>
        </div>
      </div>
    </div>
  );
}

const EXPLAIN: Record<StatusId, (s: Snapshot) => string> = {
  feed: (s) => s.feed.state === 'live' ? `Live data is arriving from Valorant${s.feed.ageMs !== null ? ` (last update ${(s.feed.ageMs / 1000).toFixed(1)} s ago)` : ''}. If it stops during a round, the HUD shows “Feed paused” and keeps the last data.` : s.feed.state === 'waiting' ? `${s.feed.reason ?? 'Waiting for Valorant.'} Open Valorant on this PC and join the custom game as an observer.` : s.feed.state === 'unavailable' ? s.feed.reason ?? 'Game capture is not available on this PC.' : 'Game capture is off. Nothing is read from the game until you start it.',
  obs: (s) => s.obs.state === 'connected' ? `Connected to OBS ${s.obs.version ?? ''}. Air reads which scene is on air.` : s.obs.error ?? 'Connect to OBS WebSocket (OBS › Tools › WebSocket Server Settings).',
  esportra: () => 'Not signed in. Quick matches work without an account. Signing in to use your Esportra tournaments comes next.',
  graphics: (s) => s.engine.state !== 'running' ? s.engine.error ?? 'The graphics engine is not running.' : 'Air’s graphics engine serves every output. It runs separately from this window, so graphics stay on air if Air closes or restarts.',
};
const TITLE: Record<StatusId, string> = { feed: 'Game data', obs: 'OBS', esportra: 'Esportra', graphics: 'Graphics engine' };

export function StatusDrawer({ id, s, close, go, run, askCapture }: { id: StatusId; s: Snapshot; close: () => void; go: (p: Page) => void; run: Run; askCapture: () => void }) {
  let fix: { label: string; act: () => void } | null = null;
  if (id === 'feed' && s.feed.state === 'off') fix = { label: 'Start capture', act: () => { close(); askCapture(); } };
  if (id === 'feed' && (s.feed.state === 'waiting' || s.feed.state === 'live')) fix = { label: 'Stop capture', act: () => void run(() => air.stopCapture()).then(close) };
  if (id === 'obs' && s.obs.state !== 'connected') fix = { label: 'Open OBS setup', act: () => { close(); go('scenes'); } };
  return (
    <Drawer title={TITLE[id]} close={close}>
      <Cap>Status</Cap>
      <h2 className="title-md">{TITLE[id]}</h2>
      <p style={{ color: 'var(--text-2)', lineHeight: 1.55 }}>{EXPLAIN[id](s)}</p>
      {fix && <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={fix.act}>{fix.label}</button>}
    </Drawer>
  );
}

export function CastersDrawer({ s, run, close }: { s: Snapshot; run: Run; close: () => void }) {
  const match = s.match;
  const [casters, setCasters] = useState<Caster[]>([match?.casters[0] ?? { name: '', handle: '' }, match?.casters[1] ?? { name: '', handle: '' }]);
  if (!match) return <Drawer title="Casters" close={close}><p className="muted">Choose a match first.</p></Drawer>;
  const set = (i: number, key: keyof Caster, v: string) => setCasters(casters.map((c, j) => (j === i ? { ...c, [key]: v } : c)));
  return (
    <Drawer title="Casters" close={close}>
      <Cap>Talent</Cap>
      <h2 className="title-md">Casters for {match.title}</h2>
      <form className="stack" style={{ gap: 14 }} onSubmit={async (e) => { e.preventDefault(); if (await run(() => air.updateMatch(match.id, { casters: casters.filter((c) => c.name.trim()) }))) close(); }}>
        {casters.map((c, i) => (
          <div className="grid2" key={i}>
            <label className="field"><span>{i ? 'Analyst' : 'Play-by-play'}</span><input value={c.name} onChange={(e) => set(i, 'name', e.target.value)} maxLength={40} /></label>
            <label className="field"><span>Handle (optional)</span><input value={c.handle} onChange={(e) => set(i, 'handle', e.target.value)} maxLength={40} placeholder="@handle" /></label>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="btn quiet" onClick={close}>Cancel</button><button type="submit" className="btn primary">Save casters</button></div>
      </form>
    </Drawer>
  );
}
