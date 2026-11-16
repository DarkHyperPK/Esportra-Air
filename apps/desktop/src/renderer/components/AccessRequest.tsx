// While Esportra refuses Air access: ask for it with a note, see that the request is waiting or why it
// was declined, withdraw it, or check again. Air also checks every minute on its own (esportra-sync.ts),
// so the Esportra tournaments come back without a restart once an admin grants access.
import { useState } from 'react';
import type { EsportraView } from '../../shared/esportra.ts';
import type { Run } from '../App.tsx';
import { air } from '../bridge.ts';
import { Tally } from './ui.tsx';

const DAY = 86_400_000;

function ago(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : `${Math.round(min / 1440)} days ago`;
}

export function AccessRequest({ e, run }: { e: EsportraView; run: Run }) {
  const [note, setNote] = useState('');
  const r = e.request ?? null;
  const check = <button className="btn quiet" onClick={() => void run(() => air.esportraCheck())}>Check again</button>;

  if (r?.status === 'pending') {
    return (
      <section className="card" style={{ padding: 18 }} aria-label="Air access request">
        <span className="cap faint">Esportra · {e.email}</span>
        <h3 className="title-md" style={{ margin: '6px 0' }}>Access requested</h3>
        <p className="muted t-sm">Asked {ago(r.createdAt)}. An Esportra admin will review it. Air checks every minute, so your Esportra tournaments come back here by themselves once access is on.</p>
        {r.note && <p className="faint t-sm" style={{ marginTop: 6 }}>Your note: {r.note}</p>}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <Tally kind="covered">Waiting for Esportra</Tally>
          {check}
          <button className="btn quiet" onClick={() => void run(() => air.esportraWithdrawRequest())}>Withdraw</button>
        </div>
        <p className="faint t-xs" style={{ marginTop: 10 }}>If it is declined, the reason shows here and you can ask again after 24 hours.</p>
      </section>
    );
  }

  if (!e.canRequest) return <p className="faint t-xs">{e.warning ?? 'Esportra has not turned on Air for this account yet.'}</p>;
  const declined = r?.status === 'declined' ? r : null;
  const waitUntil = declined?.decidedAt ? Date.parse(declined.decidedAt) + DAY : 0;
  const mustWait = waitUntil > Date.now();

  return (
    <section className="card warn" style={{ padding: 18 }} aria-label="Air access">
      <span className="cap" style={{ color: 'var(--amber)' }}>Esportra · {e.email}</span>
      <h3 className="title-md" style={{ margin: '6px 0' }}>{declined ? 'Your request was declined' : 'Your Air access has ended'}</h3>
      <p className="muted t-sm">
        {declined ? `Esportra says: ${declined.reason ?? 'no reason given.'} Your own events and matches work as normal.` : e.warning ?? 'Esportra has not turned on Air for this account. Your own events and matches work as normal.'}
        {' '}Esportra tournaments come back here when access is turned on.
      </p>
      {mustWait ? (
        <p className="faint t-sm" style={{ marginTop: 10 }}>You can ask again {new Date(waitUntil).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.</p>
      ) : (
        <label className="field" style={{ display: 'grid', gap: 6, marginTop: 12 }}>
          <span className="t-sm">Note for Esportra (optional)</span>
          <textarea rows={2} maxLength={500} style={{ height: 'auto', padding: '8px 11px' }} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Which event it is for, how many PCs…" />
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {!mustWait && <button className="btn primary" onClick={() => void run(async () => { const snap = await air.esportraRequestAccess(note); setNote(''); return snap; })}>Request access</button>}
        {check}
      </div>
    </section>
  );
}
