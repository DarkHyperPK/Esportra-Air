// vMix (28 Nov): connect to the producer's vMix Web API, list the Air pages this show needs, and pair each with a Web
// Browser input (or let inputs titled "ESPORTRA · <page>" pair themselves). Air renames and points the paired inputs and
// offers Reload. It never switches, cuts or overlays anything in vMix, and cannot add an input: the producer adds each
// once in vMix (Add Input › Web Browser) and pastes the address Air copies here.
import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { VMIX_NOTE, type VmixPageStatus } from '../../shared/vmix.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';

const STATUS: Record<VmixPageStatus, string> = { paired: 'Paired', missing: 'Input missing in vMix', unpaired: 'Not paired', unknown: 'Paired · vMix not connected' };

function CopyAddress({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return <button className="btn quiet small" title={url} onClick={() => void air.copy(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => setDone(false))}>{done ? 'Copied' : 'Copy address'}</button>;
}

export function VmixPanel({ s, run }: { s: Snapshot; run: Run }) {
  const v = s.vmix;
  const connected = v.state === 'connected';
  const [host, setHost] = useState('');
  const shown = host || v.host;
  return (
    <div className="stack" style={{ gap: 8 }} aria-label="vMix">
      <div className="between">
        <span><b>vMix</b> <span className="faint t-xs">optional</span></span>
        {v.state !== 'off' && <button className="btn quiet small" onClick={() => void run(() => air.vmixDisconnect())}>Disconnect</button>}
      </div>
      <p className="muted t-sm">{VMIX_NOTE}</p>
      {v.state === 'off' ? (
        <div className="row g-2">
          <input className="cell" aria-label="vMix address" value={shown} onChange={(e) => setHost(e.target.value)} placeholder="127.0.0.1:8088" />
          <button className="btn small" disabled={!shown.trim()} onClick={() => void run(() => air.vmixConnect(shown))}>Connect</button>
        </div>
      ) : (
        <p className="muted t-sm">{connected ? <><span className="ok-text">✓</span> Connected to vMix at {v.host}.</> : v.state === 'connecting' ? `Connecting to ${v.host}…` : null}</p>
      )}
      {v.error && <div className="notice warn t-sm" role="status">{v.error}</div>}
      {v.state === 'off' && <p className="faint t-xs">vMix: Settings › Web, then use this PC’s or the vMix PC’s address. Port 8088 unless you changed it.</p>}
      {v.pages.length === 0 ? <p className="muted t-sm">This show has no Air pages yet.</p> : (
        <>
          <p className="faint t-xs">Add one Web Browser input per page in vMix (Add Input › Web Browser, paste the address), then pair it here. Inputs already named like the page pair by themselves.</p>
          {v.pages.map((p) => (
            <div key={p.id} className="between" style={{ gap: 8 }}>
              <span><b>{p.label}</b><br /><span className={`t-xs ${p.status === 'missing' ? 'bad-text' : 'faint'}`}>{STATUS[p.status]}{p.title && p.status === 'paired' ? ` · ${p.title}` : ''}</span></span>
              <span className="row g-2">
                <CopyAddress url={p.url} />
                <select className="cell" aria-label={`vMix input for ${p.label}`} disabled={!connected} value={p.key ?? ''} onChange={(e) => void run(() => air.vmixPair(p.id, e.target.value || null))}>
                  <option value="">Not paired</option>
                  {p.key && !v.inputs.some((i) => i.key === p.key) && <option value={p.key}>(deleted in vMix)</option>}
                  {v.inputs.map((i) => <option key={i.key} value={i.key}>{i.title || 'Input'} · {i.number}</option>)}
                </select>
                <button className="btn quiet small" disabled={p.status !== 'paired'} onClick={() => void run(() => air.vmixReload(p.id))}>Reload</button>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
