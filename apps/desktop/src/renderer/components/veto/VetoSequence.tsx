import { useState } from 'react';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { other, teamAt, title, type VetoModel } from './model.ts';

/** Every step of the order: done, now, next. Undo, and Swap who starts until the first ban. */
export function VetoSequence({ run, v }: { run: Run; v: VetoModel }) {
  const tag = (t: number) => (t === 0 || t === 1 ? v.m.teams[t].tag || v.m.teams[t].name : '');
  const ownOrder = !!v.md.vetoOrder?.length;
  const [asking, setAsking] = useState(false);
  return (
    <section className="stack" style={{ gap: 8 }}>
      <div className="between">
        <span className="cap faint">The sequence</span>
        <span className="row-gap">
          {!ownOrder && <button className="btn quiet small" onClick={() => void run(() => air.vetoFirst(other(v.first)))}>Swap who starts</button>}
          <button className="btn small" disabled={!v.md.veto.length} onClick={() => void run(() => air.vetoUndo())}>Undo last</button>
          <button className="btn quiet small" disabled={!v.md.veto.length} onClick={() => setAsking(true)}>Reset veto</button>
        </span>
      </div>
      {asking && (
        <div className="notice between" role="alertdialog" aria-label="Reset the veto">
          <span>Clear every ban and pick{v.linked ? ' here and in the Esportra match room' : ''}? The coin toss result stays.</span>
          <span className="row-gap">
            <button className="btn small" onClick={() => { setAsking(false); void run(() => air.vetoReset()); }}>Reset veto</button>
            <button className="btn quiet small" onClick={() => setAsking(false)}>Keep it</button>
          </span>
        </div>
      )}
      <div className="vp-seq">
        {v.order.map((o, i) => {
          const done = v.md.veto[i];
          const now = !done && i === v.md.veto.length && v.sideAt < 0;
          const t = done ? done.team : teamAt(v, i);
          const sideBy = done?.side ? (done.sideTeam ?? (done.action === 'pick' ? other(done.team as 0 | 1) : -1)) : -1;
          return (
            <div key={i} className={`vp-st ${done ? 'done' : now ? 'now' : 'next'}`}>
              <span className="vp-k mono">{String(i + 1).padStart(2, '0')} <span>{(done?.action ?? o.action).toUpperCase()}</span></span>
              <b>{done ? title(done.map) : now ? tag(t) || 'Last map' : tag(t) || 'Last map'}</b>
              <small>{done ? `${done.action === 'decider' ? '' : tag(t)}${done.side ? `${done.action === 'decider' ? '' : ' · '}${tag(sideBy)} ${done.side}` : done.action !== 'ban' ? ' · side owed' : ''}` : now ? 'choosing now' : o.action === 'decider' ? 'the map left' : 'up next'}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}
