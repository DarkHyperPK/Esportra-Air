import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import { stripItems, type ScreenProps } from '../App.tsx';

function nextSponsor(s: Snapshot) {
  if (!s.setup.sponsors.length) return null;
  const i = s.triggers.sponsor ? s.setup.sponsors.indexOf(s.triggers.sponsor) : -1;
  return s.setup.sponsors[(i + 1) % s.setup.sponsors.length] ?? null;
}

function Correction({ s, run, close }: Pick<ScreenProps, 's' | 'run'> & { close: () => void }) {
  const [a, setA] = useState(String(s.readout?.score[0] ?? 0));
  const [b, setB] = useState(String(s.readout?.score[1] ?? 0));
  const [reason, setReason] = useState('');
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const teams = s.match!.teams;
  return (
    <form
      className="card pad stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => air.correct({ field: 'scores', value: [Number(a), Number(b)], reason: reason || 'Operator correction' }))) close();
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 17 }}>Correct the score viewers see</h2>
        <span className="muted" style={{ fontSize: 13 }}>Until the next round. Game data underneath is kept.</span>
      </div>
      <div className="field-row">
        <label className="field">{teams[0].name}<input ref={first} type="number" min={0} max={999} value={a} onChange={(e) => setA(e.target.value)} /></label>
        <label className="field">{teams[1].name}<input type="number" min={0} max={999} value={b} onChange={(e) => setB(e.target.value)} /></label>
        <label className="field">Reason<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. missed round" maxLength={200} /></label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn quiet" onClick={() => void run(() => air.correct({ clear: true })).then(close)}>Clear corrections</button>
        <button type="button" className="btn quiet" onClick={close}>Cancel</button>
        <button type="submit" className="btn primary">Apply</button>
      </div>
    </form>
  );
}

export function LiveScreen({ s, run, go, askCapture }: ScreenProps) {
  const [correcting, setCorrecting] = useState(false);
  const state = useRef(s);
  state.current = s;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const snap = state.current;
      if (!snap.match || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'F6') void run(() => air.pause(snap.triggers.pause ? null : e.shiftKey ? 'timeout' : 'technical'));
      else if (e.key === 'F7') void run(() => air.casterStrap(!snap.triggers.strap));
      else if (e.key === 'F8') void run(() => air.sponsorRead(snap.triggers.sponsor ? null : nextSponsor(snap)));
      else if (e.key === 'F9') setCorrecting(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  if (!s.match) {
    return (
      <div className="empty">
        <p>Choose or create a match first.</p>
        <button className="btn primary" style={{ marginTop: 14 }} onClick={() => go('match')}>Go to Match</button>
      </div>
    );
  }
  const r = s.readout;
  const hasGame = s.feed.state === 'live' || s.testRound.running;
  const tiles = stripItems(s);
  const sponsor = nextSponsor(s);
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="card readout">
        <div className="kv" style={{ flex: '1 1 260px' }}>
          <span className="eyebrow">{s.testRound.running ? 'Test round playing' : `Best of ${s.match.bestOf}`}</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>{s.match.title}</span>
        </div>
        {hasGame && r ? (
          <div className="row" style={{ gap: 28 }}>
            <span className="kv"><span>Map</span><strong>{r.map ?? '—'}</strong></span>
            <span className="kv"><span>Round</span><strong className="mono">{r.round ?? '—'} · {r.phase ?? '—'}</strong></span>
            <span className="score" aria-label="Score">{r.score[0] ?? '–'} – {r.score[1] ?? '–'}</span>
          </div>
        ) : (
          <span className="muted">Waiting for game data. Your pre-match screens show until the game starts.</span>
        )}
        <button className="btn" onClick={() => go('match')}>Next match</button>
      </div>

      <div className="grid-auto">
        {tiles.map((t) => (
          <div key={t.id} className={`tile ${t.health === 'warn' ? 'attention' : t.health === 'bad' ? 'bad' : ''}`}>
            <span className="row" style={{ gap: 10 }}><span className={`dot ${t.health}`} aria-hidden="true" /><strong>{t.title}</strong></span>
            <span className="value">{t.value}</span>
            {t.id === 'feed' && s.feed.state === 'off' && <button className="btn small" onClick={askCapture}>Start game capture</button>}
            {t.id === 'obs' && <span className="muted" style={{ fontSize: 13 }}>Read only · switch scenes in OBS</span>}
            {t.id === 'graphics' && <span className="muted" style={{ fontSize: 13 }}>Runs separately from this window</span>}
          </div>
        ))}
      </div>

      <section className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18 }}>Manual graphics</h2>
          <span className="muted" style={{ fontSize: 13 }}>Everything else runs from game and match data</span>
        </div>
        <div className="grid-auto">
          <div className="trigger" aria-pressed={!!s.triggers.pause} role="group" aria-label="Pause panel">
            <span className="head">Pause panel <span className="kbd">F6</span></span>
            <span className="muted" style={{ fontSize: 13 }}>Technical pause or team timeout (Shift+F6) with a running clock</span>
            <div className="segmented">
              <button aria-pressed={s.triggers.pause === 'technical'} onClick={() => void run(() => air.pause(s.triggers.pause === 'technical' ? null : 'technical'))}>Technical</button>
              <button aria-pressed={s.triggers.pause === 'timeout'} onClick={() => void run(() => air.pause(s.triggers.pause === 'timeout' ? null : 'timeout'))}>Timeout</button>
            </div>
          </div>
          <button className="trigger" aria-pressed={s.triggers.strap} onClick={() => void run(() => air.casterStrap(!s.triggers.strap))}>
            <span className="head">Caster strap <span className="kbd">F7</span></span>
            <span className="muted" style={{ fontSize: 13 }}>{s.match.casters.length ? s.match.casters.map((c) => c.name).join(' & ') : 'Add casters on the Match step'}</span>
            <span className="state">{s.triggers.strap ? 'On screen · press again to hide' : 'Ready'}</span>
          </button>
          <button className="trigger" aria-pressed={!!s.triggers.sponsor} onClick={() => void run(() => air.sponsorRead(s.triggers.sponsor ? null : sponsor))} disabled={!s.setup.sponsors.length}>
            <span className="head">Sponsor read <span className="kbd">F8</span></span>
            <span className="muted" style={{ fontSize: 13 }}>{s.setup.sponsors.length ? `Next: ${sponsor}` : 'Add sponsors in Setup › Brand'}</span>
            <span className="state">{s.triggers.sponsor ? `${s.triggers.sponsor} on screen` : 'Ready'}</span>
          </button>
          <button className="trigger" aria-pressed={correcting} onClick={() => setCorrecting(!correcting)}>
            <span className="head">Correct score <span className="kbd">F9</span></span>
            <span className="muted" style={{ fontSize: 13 }}>Fix what viewers see without touching game data</span>
            <span className="state">{correcting ? 'Editing' : 'Ready'}</span>
          </button>
        </div>
        {correcting && <Correction s={s} run={run} close={() => setCorrecting(false)} />}
      </section>
    </div>
  );
}
