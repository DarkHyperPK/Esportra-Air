import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { formatCode, type PcRole } from '../../shared/join.ts';
import { air } from '../bridge.ts';
import { Cap, Tally } from './ui.tsx';

type Run = (fn: () => Promise<Snapshot | void>) => Promise<boolean>;

const ago = (ms: number | null) => (ms === null ? 'no data yet' : ms < 2000 ? 'now' : ms < 60_000 ? `${Math.round(ms / 1000)} s ago` : `${Math.floor(ms / 60_000)} min ago`);

/** Producer side: let observer and player PCs on this network send game data here. */
export function JoinPanel({ s, run }: { s: Snapshot; run: Run }) {
  const j = s.join;
  const [copied, setCopied] = useState(false);
  return (
    <section className="panel" aria-label="Observer and player PCs">
      <div className="head"><Cap>Observer and player PCs</Cap>{j.enabled ? <Tally kind="live">Open</Tally> : <Tally kind="off">Off</Tally>}</div>
      <div className="body-pad stack" style={{ gap: 12 }}>
        <div className="row-item" style={{ padding: 0, border: 0 }}>
          <span><b>Allow other PCs on this network to join</b><br /><span className="muted" style={{ fontSize: 12 }}>Opens one port on this PC while it is on. Game data stays on your local network.</span></span>
          <button className="switch" role="switch" aria-checked={j.enabled} aria-label="Allow other PCs to join" onClick={() => void run(() => air.joinSet(!j.enabled))} />
        </div>
        {j.enabled && j.code && (
          <>
            <div className="joincode" aria-label="Join code">
              <span className="muted" style={{ fontSize: 11 }}>JOIN CODE</span>
              <strong>{formatCode(j.code)}</strong>
              <button className="btn small" onClick={() => void air.copy(j.code!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? 'Copied' : 'Copy'}</button>
              <button className="btn quiet small" title="Disconnects every joined PC" onClick={() => void run(() => air.joinRotate())}>New code</button>
            </div>
            <div>
              <p className="muted" style={{ fontSize: 12 }}>On each player or observer PC, open Esportra Player and enter the code and this address:</p>
              {j.addresses.length ? j.addresses.map((a) => <p key={a} className="mono" style={{ fontSize: 13 }}>{a}</p>) : <p className="muted" style={{ fontSize: 12.5 }}>No network address found. Connect this PC to the same network first.</p>}
            </div>
            <div>
              <Cap>Joined PCs · {j.peers.length}</Cap>
              {j.peers.length === 0 ? <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>None yet.</p> : (
                <div style={{ marginTop: 6 }}>
                  {j.peers.map((p) => (
                    <div key={p.id} className="camrow-item" style={{ gridTemplateColumns: '14px minmax(0, 1fr) auto' }}>
                      <span className={`cdot ${p.lastAgeMs !== null && p.lastAgeMs < 10_000 ? 'connected' : 'waiting'}`} />
                      <span className="cname">{p.name || p.ip} <span className="muted" style={{ fontSize: 11.5 }}>· {p.role === 'player' ? 'Player PC' : 'Observer PC'} · {p.ip}</span></span>
                      <span className="muted mono" style={{ fontSize: 11 }}>{ago(p.lastAgeMs)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>A joined PC can only add game data to the match you have selected. It cannot see or change your graphics. Windows may ask to allow Air through its firewall the first time: allow it on private networks only.</p>
          </>
        )}
        {j.error && <p style={{ color: 'var(--bad)', fontSize: 12.5 }}>{j.error}</p>}
      </div>
    </section>
  );
}

/** This PC's job: run the show, or only capture the game and send it to a producer's Air. */
export function PcModeCard({ s, run }: { s: Snapshot; run: Run }) {
  const capturing = s.feed.state === 'live' || s.feed.state === 'waiting';
  return (
    <section className="panel">
      <div className="head"><Cap>This PC</Cap></div>
      <div className="body-pad stack" style={{ gap: 12 }}>
        <div className="seg" role="group" aria-label="What this PC does">
          <button aria-pressed={s.mode === 'production'} disabled={capturing} onClick={() => void run(() => air.setMode('production'))}>Production</button>
          <button aria-pressed={s.mode === 'capture'} disabled={capturing} onClick={() => void run(() => air.setMode('capture'))}>Capture-only</button>
        </div>
        <p className="muted" style={{ fontSize: 12.5 }}>Production runs the show: graphics, OBS and the console. Capture-only is for an observer’s PC or a player’s PC: it reads the game and sends the data to the producer’s Air on your network. {capturing ? 'Stop game capture to change this.' : ''}</p>
      </div>
    </section>
  );
}

/** Capture-only PC (PRD picture 11): connect to the producer, then capture the game. */
export function CaptureOnlyScreen({ s, run, askCapture }: { s: Snapshot; run: Run; askCapture: () => void }) {
  const l = s.link;
  const [address, setAddress] = useState(l.address);
  const [code, setCode] = useState('');
  const [role, setRole] = useState<PcRole>(l.role);
  const [busy, setBusy] = useState(false);
  const linked = l.state === 'connected' || l.state === 'connecting';
  const feedTag = s.feed.state === 'live' ? <Tally kind="live">Live</Tally> : s.feed.state === 'waiting' ? <Tally kind="covered">Waiting</Tally> : s.feed.state === 'unavailable' ? <Tally kind="bad">Unavailable</Tally> : <Tally kind="off">Off</Tally>;
  const linkTag = l.state === 'connected' ? <Tally kind="live">Connected</Tally> : l.state === 'connecting' ? <Tally kind="covered">Connecting</Tally> : l.state === 'rejected' ? <Tally kind="bad">Refused</Tally> : l.state === 'error' ? <Tally kind="bad">Problem</Tally> : <Tally kind="off">Not connected</Tally>;
  return (
    <div className="stack" style={{ maxWidth: 760, margin: '0 auto' }}>
      <div><Cap>Capture-only PC</Cap><h1 className="title-lg" style={{ marginTop: 8 }}>{role === 'player' ? 'Player PC' : 'Observer PC'}</h1><p className="lead" style={{ marginTop: 6 }}>Reads Valorant on this PC and sends the data to the producer’s Air. Nothing is shown or recorded here.</p></div>

      <section className="panel">
        <div className="head"><Cap>1 · Connect to the producer</Cap>{linkTag}</div>
        <div className="body-pad stack" style={{ gap: 12 }}>
          {linked || l.state === 'rejected' ? (
            <>
              <p>Sending to <b className="mono">{l.address}</b> as {l.role === 'player' ? 'a player PC' : 'the observer PC'}.</p>
              {l.error && <p style={{ color: 'var(--bad)', fontSize: 12.5 }}>{l.error}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                {l.state === 'rejected' && <button className="btn" onClick={() => void run(() => air.linkRetry())}>Try again</button>}
                <button className="btn quiet" onClick={() => void run(() => air.linkDisconnect())}>Disconnect</button>
              </div>
            </>
          ) : (
            <form className="stack" style={{ gap: 12 }} onSubmit={async (e) => { e.preventDefault(); setBusy(true); const ok = await run(() => air.linkConnect({ address, code, role })); setBusy(false); if (ok) setCode(''); }}>
              <div className="seg" role="group" aria-label="This PC is">
                <button type="button" aria-pressed={role === 'observer'} disabled={s.feed.state === 'live' || s.feed.state === 'waiting'} onClick={() => setRole('observer')}>Observer</button>
                <button type="button" aria-pressed={role === 'player'} disabled={s.feed.state === 'live' || s.feed.state === 'waiting'} onClick={() => setRole('player')}>Player</button>
              </div>
              <p className="muted" style={{ fontSize: 12.5 }}>{role === 'player' ? 'A player PC sends only that player’s own health and abilities.' : 'The observer PC sends the match: scoreboard, rounds, kills, spike.'}</p>
              <div className="grid2">
                <label className="field"><span>Producer’s address</span><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.1.40:5301" required autoComplete="off" /></label>
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
          <p className="muted" style={{ fontSize: 12.5 }}>{s.feed.state === 'off' ? s.feed.reason ?? 'Capture is off. Nothing is read from the game until you start it.' : s.feed.reason ?? 'Reading Valorant game events.'}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {s.feed.state === 'off' && <button className="btn primary" disabled={l.state !== 'connected'} onClick={askCapture}>Start capture</button>}
            {(s.feed.state === 'waiting' || s.feed.state === 'live') && <button className="btn" onClick={() => void run(() => air.stopCapture())}>Stop capture</button>}
          </div>
          {s.feed.state === 'off' && l.state !== 'connected' && <p className="muted" style={{ fontSize: 12 }}>Connect to the producer first.</p>}
          <dl className="readout"><dt>Sent</dt><dd>{l.sent.toLocaleString('en-US')} messages</dd><dt>Waiting to send</dt><dd>{l.queued}</dd></dl>
        </div>
      </section>

      <button className="btn quiet" style={{ alignSelf: 'flex-start' }} disabled={s.feed.state === 'live' || s.feed.state === 'waiting'} onClick={() => void run(() => air.setMode('production'))}>Switch this PC back to Production</button>
    </div>
  );
}
