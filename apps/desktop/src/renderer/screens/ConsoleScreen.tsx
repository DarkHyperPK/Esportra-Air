import { useEffect, useRef } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import type { PageProps } from '../App.tsx';

function nextSponsor(s: Snapshot) {
  if (!s.setup.sponsors.length) return null;
  const i = s.triggers.sponsor ? s.setup.sponsors.indexOf(s.triggers.sponsor) : -1;
  return s.setup.sponsors[(i + 1) % s.setup.sponsors.length] ?? null;
}

interface Trigger {
  key: string;
  label: string;
  detail: string;
  state: 'idle' | 'live' | 'warn';
  built: boolean;
  fire?: () => void;
}

export function ConsoleScreen({ s, run, go, openFix, openCasters }: PageProps) {
  const ref = useRef(s);
  ref.current = s;

  const triggers = (snap: Snapshot): Trigger[] => [
    { key: 'F1', label: 'Tech pause', detail: snap.triggers.pause === 'technical' ? 'On screen · press again to resume' : 'Pause panel with a running clock', state: snap.triggers.pause === 'technical' ? 'warn' : 'idle', built: true, fire: () => void run(() => air.pause(snap.triggers.pause === 'technical' ? null : 'technical')) },
    { key: 'F2', label: 'Timeout', detail: snap.triggers.pause === 'timeout' ? 'On screen · press again to end' : 'Team timeout panel', state: snap.triggers.pause === 'timeout' ? 'warn' : 'idle', built: true, fire: () => void run(() => air.pause(snap.triggers.pause === 'timeout' ? null : 'timeout')) },
    { key: 'F3', label: 'Replay', detail: 'Next step', state: 'idle', built: false },
    { key: 'F4', label: 'Toast', detail: 'Next step', state: 'idle', built: false },
    { key: 'F5', label: 'Caster lower third', detail: snap.match?.casters.filter((c) => c.name).length ? (snap.triggers.strap ? 'On screen · press again to hide' : snap.match!.casters.map((c) => c.name).join(' & ')) : 'Add casters first', state: snap.triggers.strap ? 'live' : 'idle', built: true, fire: () => (snap.match?.casters.some((c) => c.name) ? void run(() => air.casterStrap(!snap.triggers.strap)) : openCasters()) },
    { key: 'F6', label: 'Poll', detail: 'Next step', state: 'idle', built: false },
    { key: 'F7', label: 'Stinger', detail: 'Next step', state: 'idle', built: false },
    { key: 'F8', label: 'Sponsor read', detail: snap.setup.sponsors.length ? (snap.triggers.sponsor ? `${snap.triggers.sponsor} on screen` : `Next: ${nextSponsor(snap)}`) : 'Add sponsors in Setup', state: snap.triggers.sponsor ? 'live' : 'idle', built: snap.setup.sponsors.length > 0, fire: () => void run(() => air.sponsorRead(snap.triggers.sponsor ? null : nextSponsor(snap))) },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.repeat || e.altKey || e.metaKey || el?.tagName === 'INPUT' || el?.tagName === 'SELECT') return;
      if (e.ctrlKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        return openFix();
      }
      if (e.ctrlKey || !/^F[1-8]$/.test(e.key) || !ref.current.match) return;
      const t = triggers(ref.current).find((x) => x.key === e.key);
      if (t?.built && t.fire) {
        e.preventDefault();
        t.fire();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const r = s.readout;
  const live = s.feed.state === 'live' || s.testRound.running;
  const open = s.checks.filter((c) => c.health === 'warn' || c.health === 'bad').length;
  const list = triggers(s);
  return (
    <div className="console">
      <div className="stack">
        {!s.match && <div className="notice">No match selected. <button className="btn fix" onClick={() => go('ready')}>Choose a match</button></div>}

        <section className="panel" aria-label="Triggers">
          <div className="head"><Cap>Triggers</Cap><span className="muted mono" style={{ fontSize: 10.5 }}>F1–F8 · Ctrl+D fix data</span></div>
          <div className="body-pad">
            <div className="triggers" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {list.map((t) => (
                <button key={t.key} className={`trig ${t.state}`} disabled={!t.built || !s.match} onClick={t.fire} aria-pressed={t.state !== 'idle'} style={!t.built ? { opacity: 0.45 } : undefined}>
                  <strong>{t.label}</strong>
                  <span className="muted" style={{ fontSize: 11.5 }}>{t.detail}</span>
                  <span className="kbd">{t.key}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel" aria-label="Graphic layers">
          <div className="head"><Cap>Graphic layers</Cap></div>
          <div className="body-pad"><p className="muted">In-game, between-rounds and full-screen layers, each On / Auto / Off with a hotkey, arrive in the next step. Today the HUD runs from game data.</p></div>
        </section>

        <div className="datastrip" aria-label="Live data">
          <span className="k">Live data</span>
          {live && r ? (
            <>
              <span>R{r.round ?? '—'} · {(r.phase ?? '—').toUpperCase()}</span>
              <span className="sc">{r.score[0] ?? '–'} – {r.score[1] ?? '–'}</span>
              <span>{r.map ?? '—'}</span>
              {s.testRound.running && <Tally kind="covered">Test round</Tally>}
            </>
          ) : (
            <span className="muted">Waiting for game data</span>
          )}
          <span style={{ marginLeft: 'auto' }}><button className="btn small" onClick={openFix}>Fix data</button></span>
        </div>
      </div>

      <aside className="stack">
        <section className="panel">
          <div className="head"><Cap>Show</Cap></div>
          <div className="body-pad stack" style={{ gap: 10 }}>
            <div><h2 className="title-sm">{s.match?.title ?? 'No match'}</h2>{s.match && <p className="muted" style={{ fontSize: 12.5 }}>Best of {s.match.bestOf} · {s.setup.name}</p>}</div>
            <button className="btn" onClick={() => go('ready')}>{open ? `${open} need attention · Readiness` : 'Readiness'}</button>
          </div>
        </section>
        <section className="panel">
          <div className="head"><Cap>Lower thirds · one click</Cap></div>
          <div className="body-pad stack" style={{ gap: 8 }}>
            {s.match?.casters.some((c) => c.name) && (
              <div className="row-item" style={{ border: '1px solid var(--hair)', minHeight: 52 }}>
                <span><b>{s.match.casters.filter((c) => c.name).map((c) => c.name).join(' & ')}</b><br /><span className="muted" style={{ fontSize: 11.5 }}>Casters · both names</span></span>
                <button className="btn small" aria-pressed={s.triggers.strap} onClick={() => void run(() => air.casterStrap(!s.triggers.strap))}>{s.triggers.strap ? 'Hide' : 'Show'}</button>
              </div>
            )}
            {!s.match?.casters.some((c) => c.name) && <p className="muted">No casters yet.</p>}
            <button className="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={openCasters}>Edit casters</button>
          </div>
        </section>
      </aside>
    </div>
  );
}
