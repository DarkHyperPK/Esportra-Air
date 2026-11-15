import { useEffect, useState } from 'react';
import type { CamSlot, Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import { Cap } from './ui.tsx';

type Run = (fn: () => Promise<Snapshot | void>) => Promise<boolean>;

const LAYOUTS = [['ingame', 'In-game cams'], ['grid5', '5-up'], ['grid10', '10-up']] as const;
const DELAYS = [0, 500, 1000, 2000, 3000, 5000, 8000];

function SlotRow({ slot, run }: { slot: CamSlot; run: Run }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  const state = slot.connected ? 'connected' : slot.id ? 'waiting' : 'none';
  return (
    <div className="camrow-item">
      <span className={`cdot ${state}`} role="img" aria-label={state === 'connected' ? 'Connected' : state === 'waiting' ? 'Link made, waiting for the player' : 'No link'} />
      <span className="cname">{slot.name}</span>
      {slot.id ? (
        <span className="cbtns">
          <button className="btn small" onClick={() => void air.copy(slot.pushUrl!).then(() => setCopied(true))}>{copied ? 'Copied' : 'Copy link'}</button>
          <button className="btn quiet small" title="Makes a new link; the old one stops working" onClick={() => void run(() => air.camCreate(slot.team, slot.slot))}>New</button>
          <button className="btn quiet small" aria-label={`Remove ${slot.name}'s camera`} onClick={() => void run(() => air.camRemove(slot.team, slot.slot))}>✕</button>
        </span>
      ) : (
        <button className="btn small" onClick={() => void run(() => air.camCreate(slot.team, slot.slot))}>Make link</button>
      )}
    </div>
  );
}

/** Player cameras by link (PRD picture 8 cameras block): a link per player, layout and delay. */
export function CamerasPanel({ s, run }: { s: Snapshot; run: Run }) {
  const c = s.cams;
  const made = c.slots.filter((x) => x.id).length;
  const live = c.slots.filter((x) => x.connected).length;
  return (
    <section className="panel" aria-label="Player cameras">
      <div className="head">
        <Cap>Player cameras · {live} of {made} connected</Cap>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="seg" role="group" aria-label="Camera layout">
            {LAYOUTS.map(([id, label]) => <button key={id} aria-pressed={c.layout === id} disabled={!s.match} onClick={() => void run(() => air.camsSet({ layout: id }))}>{label}</button>)}
          </div>
          <label className="mono muted" style={{ fontSize: 10, letterSpacing: '0.12em', display: 'flex', gap: 6, alignItems: 'center' }}>
            DELAY
            <select className="cell" style={{ width: 84, height: 28 }} aria-label="Camera delay" value={c.delayMs} disabled={!s.match} onChange={(e) => void run(() => air.camsSet({ delayMs: Number(e.target.value) }))}>
              {[...new Set([...DELAYS, c.delayMs])].sort((a, b) => a - b).map((ms) => <option key={ms} value={ms}>{ms === 0 ? 'None' : `${ms / 1000} s`}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="body-pad">
        {!s.match ? <p className="muted" style={{ fontSize: 12.5 }}>Choose a match to make camera links.</p> : (
          <>
            <div className="cams-cols">
              {[0, 1].map((team) => (
                <div key={team}>
                  <p className="mono muted" style={{ fontSize: 10, letterSpacing: '0.14em', marginBottom: 4 }}>{s.match!.teams[team]!.name.toUpperCase()}</p>
                  {c.slots.filter((x) => x.team === team).map((slot) => <SlotRow key={slot.slot} slot={slot} run={run} />)}
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Send each player their link. It opens their camera in a browser, with nothing to install; nothing is recorded. The dot turns green once the picture arrives. Delay lines the camera up with the game feed.</p>
          </>
        )}
      </div>
    </section>
  );
}
