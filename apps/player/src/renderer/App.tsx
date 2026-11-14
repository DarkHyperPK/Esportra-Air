import { useCallback, useEffect, useState } from 'react';
import type { PcRole, PlayerSnapshot } from '../shared/api.ts';
import { Cap, Tally } from '../../../desktop/src/renderer/components/ui.tsx';
import { player } from './bridge.ts';

const SENT: Record<PcRole, string[]> = {
  player: ['Your health, abilities and ultimate charge', 'Your agent', 'Your player id, so the producer can match you to your slot'],
  observer: ['The match: scoreboard, rounds, score and map', 'Kills and the spike', 'Which player the observer camera is on'],
};

function Consent({ role, close, accept }: { role: PcRole; close: () => void; accept: () => void }) {
  return (
    <div className="scrim center">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <Cap>Game capture</Cap>
        <h2 id="consent-title" className="title-md">Start game capture on this PC?</h2>
        <p style={{ color: 'var(--text-2)', lineHeight: 1.55 }}>Esportra Player will read Valorant’s game events on this PC and send them to the production PC you connected to, on your local network. Nothing is sent to Esportra.</p>
        <div><Cap>What is sent</Cap><ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--text-2)', lineHeight: 1.6 }}>{SENT[role].map((x) => <li key={x}>{x}</li>)}</ul></div>
        <p className="muted" style={{ fontSize: 12.5 }}>Capture stays off until you allow it, and stops when you press Stop or close the app.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn quiet" onClick={close}>Not now</button>
          <button className="btn primary" onClick={accept}>Allow and start capture</button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [s, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<PcRole>('player');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void player.snapshot().then((snap) => {
      setSnapshot(snap);
      setAddress(snap.link.address);
      setRole(snap.role);
    });
    return player.onSnapshot(setSnapshot);
  }, []);

  const run = useCallback(async (action: () => Promise<PlayerSnapshot>) => {
    try {
      setSnapshot(await action());
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }, []);

  if (!s) return <div className="win"><div className="page"><p className="muted">Starting Esportra Player…</p></div></div>;
  const l = s.link;
  const capturing = s.feed.state === 'live' || s.feed.state === 'waiting';
  const linked = l.state === 'connected' || l.state === 'connecting';
  const linkTag = l.state === 'connected' ? <Tally kind="live">Connected</Tally> : l.state === 'connecting' ? <Tally kind="covered">Connecting</Tally> : l.state === 'rejected' ? <Tally kind="bad">Refused</Tally> : l.state === 'error' ? <Tally kind="bad">Problem</Tally> : <Tally kind="off">Not connected</Tally>;
  const feedTag = s.feed.state === 'live' ? <Tally kind="live">Live</Tally> : s.feed.state === 'waiting' ? <Tally kind="covered">Waiting</Tally> : s.feed.state === 'unavailable' ? <Tally kind="bad">Unavailable</Tally> : <Tally kind="off">Off</Tally>;
  const shownRole = linked || l.state === 'rejected' ? l.role : role;

  return (
    <div className="win">
      <div className="titlebar"><b>Esportra Player</b><span>&nbsp;· {s.name}</span></div>
      <main className="page" style={{ padding: '20px 24px' }}>
        <div className="stack">
          <div><Cap>This PC</Cap><h1 className="title-lg" style={{ marginTop: 8 }}>{shownRole === 'player' ? 'Player' : 'Observer'}</h1><p className="lead" style={{ marginTop: 6 }}>Reads Valorant on this PC and sends it to the production PC. Nothing is recorded or shown here.</p></div>

          <section className="panel">
            <div className="head"><Cap>1 · Connect to the production PC</Cap>{linkTag}</div>
            <div className="body-pad stack" style={{ gap: 12 }}>
              {linked || l.state === 'rejected' ? (
                <>
                  <p>Sending to <b className="mono">{l.address}</b> as {l.role === 'player' ? 'a player' : 'the observer'}.</p>
                  {l.state === 'connecting' && <p className="muted" style={{ fontSize: 12.5 }}>Trying to reach the production PC. Game data read meanwhile is kept and sent as soon as it is back{l.queued ? ` (${l.queued} waiting)` : ''}.</p>}
                  {l.error && l.state !== 'connecting' && <p style={{ color: 'var(--bad)', fontSize: 12.5 }}>{l.error}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {l.state === 'rejected' && <button className="btn" onClick={() => void run(() => player.retry())}>Try again</button>}
                    <button className="btn quiet" onClick={() => void run(() => player.disconnect())}>Disconnect</button>
                  </div>
                </>
              ) : (
                <form className="stack" style={{ gap: 12 }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); const ok = await run(() => player.connect({ address, code, role })); setBusy(false); if (ok) setCode(''); }}>
                  <div className="seg" role="group" aria-label="This PC is">
                    <button type="button" aria-pressed={role === 'player'} disabled={capturing} onClick={() => setRole('player')}>Player</button>
                    <button type="button" aria-pressed={role === 'observer'} disabled={capturing} onClick={() => setRole('observer')}>Observer</button>
                  </div>
                  <p className="muted" style={{ fontSize: 12.5 }}>{role === 'player' ? 'A player PC sends only that player’s own health and abilities.' : 'The observer PC sends the match: scoreboard, rounds, kills and the spike.'}</p>
                  <div className="grid2">
                    <label className="field"><span>Production PC address</span><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.1.40:5301" required autoComplete="off" /></label>
                    <label className="field"><span>Join code</span><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="K7M-4QX" required autoComplete="off" maxLength={14} /></label>
                  </div>
                  <div><button className="btn primary" type="submit" disabled={busy || !address || !code}>{busy ? 'Connecting…' : 'Connect'}</button></div>
                </form>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="head"><Cap>2 · Game capture</Cap>{feedTag}</div>
            <div className="body-pad stack" style={{ gap: 12 }}>
              <p className="muted" style={{ fontSize: 12.5 }}>{s.feed.state === 'off' ? 'Capture is off. Nothing is read from the game until you start it.' : s.feed.reason ?? 'Reading Valorant game events.'}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {s.feed.state === 'off' && <button className="btn primary" disabled={l.state !== 'connected'} onClick={() => setConsent(true)}>Start capture</button>}
                {capturing && <button className="btn" onClick={() => void run(() => player.stopCapture())}>Stop capture</button>}
              </div>
              {s.feed.state === 'off' && l.state !== 'connected' && <p className="muted" style={{ fontSize: 12 }}>Connect to the production PC first.</p>}
              <dl className="readout"><dt>Sent</dt><dd>{l.sent.toLocaleString('en-US')} messages</dd><dt>Waiting to send</dt><dd>{l.queued}</dd></dl>
            </div>
          </section>

          <p className="muted" style={{ fontSize: 12 }}>Closing this window keeps Esportra Player running in the tray. The production PC and the connection are remembered; capture always needs your OK again.</p>
        </div>
      </main>
      {consent && <Consent role={shownRole} close={() => setConsent(false)} accept={async () => { setConsent(false); await run(() => player.startCapture({ consent: true })); }} />}
      {error && <div className="alert" role="alert"><span>{error}</span><button className="btn quiet small" onClick={() => setError(null)}>Dismiss</button></div>}
    </div>
  );
}
