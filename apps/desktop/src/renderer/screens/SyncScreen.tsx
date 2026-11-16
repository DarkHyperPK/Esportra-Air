import { air } from '../bridge.ts';
import { AccessRequest } from '../components/AccessRequest.tsx';
import { Cap, Tally } from '../components/ui.tsx';
import type { PageProps } from '../App.tsx';

const ago = (at: number | null) => {
  if (!at) return 'Not yet';
  const s = Math.round((Date.now() - at) / 1000);
  return s < 60 ? 'Just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
};

export function SyncScreen({ s, run, openSignIn }: PageProps) {
  const e = s.esportra;
  const tag = e.state === 'online' ? <Tally kind="ok">Connected</Tally> : e.state === 'offline' ? <Tally kind="covered">Offline lease</Tally> : e.state === 'denied' ? <Tally kind="bad">No access</Tally> : <Tally kind="off">Signed out</Tally>;
  return (
    <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1fr) 360px' }}>
      <div className="stack">
        <section className="panel">
          <div className="head"><Cap>Esportra account</Cap>{tag}</div>
          <div className="body-pad stack" style={{ gap: 12 }}>
            {e.state === 'signed-out' ? (
              <>
                <h2 className="title-md">Not signed in</h2>
                <p className="muted">Quick matches need no account. Sign in to pick your scheduled tournament matches; Air then loads the teams, logos and best-of for you. {e.error}</p>
                <div><button className="btn primary" onClick={openSignIn}>Sign in</button></div>
              </>
            ) : (
              <>
                <div><h2 className="title-md">{e.email}</h2><p className="muted" style={{ fontSize: 12.5 }}>{e.host} · this PC is registered as {e.deviceName}</p></div>
                {e.state === 'denied' ? <AccessRequest e={e} run={run} /> : e.warning && <div className="notice">{e.warning}</div>}
                {e.error && e.state !== 'online' && <p className="muted" style={{ fontSize: 12.5 }}>Last problem: {e.error}</p>}
                <dl className="readout">
                  <dt>Plan</dt><dd>{e.account?.status ?? '—'}</dd>
                  <dt>Access until</dt><dd>{e.account?.validUntil ? new Date(e.account.validUntil).toLocaleDateString('en-GB') : '—'}</dd>
                  <dt>Matches synced</dt><dd>{e.matches.length} · {ago(e.syncedAt)}</dd>
                </dl>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => void run(() => air.esportraRefresh())}>Sync now</button>
                  <button className="btn quiet" onClick={() => void run(() => air.esportraSignOut())}>Sign out</button>
                </div>
              </>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="head"><Cap>Your scheduled matches</Cap></div>
          <div className="body-pad">
            {e.matches.length === 0 ? <p className="muted" style={{ fontSize: 12.5 }}>{e.state === 'signed-out' ? 'Sign in to see them.' : 'Nothing scheduled.'}</p> : (
              <table className="seg-table">
                <thead><tr><th>Match</th><th>Tournament</th><th>When</th><th>Format</th></tr></thead>
                <tbody>{e.matches.map((m) => <tr key={m.id}><td><b>{m.teamA}</b> <span className="muted">vs</span> <b>{m.teamB}</b></td><td>{m.tournament}</td><td>{m.scheduledAt ? new Date(m.scheduledAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td><td className="mono">Bo{m.bestOf}{m.supported ? '' : ' · not Valorant'}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </section>
      </div>
      <div className="stack">
        <section className="panel">
          <div className="head"><Cap>Offline and sync</Cap></div>
          <div className="body-pad stack" style={{ gap: 10 }}>
            <p className="muted" style={{ fontSize: 12.5 }}>Graphics, game data and corrections run on this PC, so a lost connection never affects what is on air.</p>
            <p className="muted" style={{ fontSize: 12.5 }}>Esportra is read-only here: Air loads your schedule and lineups, and sends nothing about the show back. If the connection drops, a signed lease keeps this PC cleared to produce for a few days and your last match list stays available.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
