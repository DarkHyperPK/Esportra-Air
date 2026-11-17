import { useState } from 'react';
import type { Snapshot } from '../../../shared/api.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { other, type VetoModel } from './model.ts';

/** Before the first ban: the coin toss, and the winner's choice to go first or defer. */
export function VetoToss({ s, run, v }: { s: Snapshot; run: Run; v: VetoModel }) {
  const esportra = s.esportraVeto?.outbox?.toss ?? null;
  const [local, setLocal] = useState<0 | 1 | null>(null);
  const winner = v.linked ? esportra?.winner ?? null : local;
  const T = (t: 0 | 1) => v.m.teams[t];
  const choose = (goFirst: boolean) => winner !== null && void run(() => air.vetoFirst(goFirst ? winner : other(winner)));
  return (
    <section className="vp-toss" aria-label="Coin toss">
      <div className="vp-coinbox">
        <span className="cap faint">{v.linked ? 'Esportra’s coin toss' : 'Coin toss'}</span>
        <span className="vp-coin" style={{ background: winner === null ? 'var(--raised)' : T(winner).color }}>{winner === null ? '?' : (T(winner).tag || T(winner).name).slice(0, 3)}</span>
        {winner !== null ? <b className="vp-big">{T(winner).name} won the toss</b> : <b className="vp-big">{v.linked ? 'Not flipped yet' : 'Flip to see who chooses'}</b>}
        {winner === null && (v.linked
          ? <button className="btn" onClick={() => void run(() => air.vetoOutboxStart())}>Start the veto on Esportra</button>
          : <button className="btn" onClick={() => void run(async () => { const snap = await air.vetoToss(); setLocal(((snap as Snapshot).matchData?.vetoFirst ?? 0) as 0 | 1); return snap; })}>Flip coin</button>)}
        {winner === null && v.linked && <small className="faint">Esportra flips the coin when the veto starts.</small>}
      </div>
      <div className="vp-choice">
        <span className="cap faint">{winner === null ? 'Or set who bans first' : `${T(winner).tag || T(winner).name} chooses`}</span>
        {winner !== null ? (
          <div className="vp-row">
            <button className={`vp-bigbtn ${v.first === winner ? 'on' : ''}`} onClick={() => choose(true)}><b>Go first</b><small>{T(winner).tag} makes the first ban</small></button>
            <button className={`vp-bigbtn ${v.first !== winner ? 'on' : ''}`} onClick={() => choose(false)}><b>Defer</b><small>{T(other(winner)).tag} makes the first ban</small></button>
          </div>
        ) : (
          <div className="vp-row">
            {([0, 1] as const).map((t) => <button key={t} className={`vp-bigbtn ${v.first === t ? 'on' : ''}`} onClick={() => void run(() => air.vetoFirst(t))}><b>{T(t).tag || T(t).name}</b><small>bans first</small></button>)}
          </div>
        )}
        <small className="faint">Until the first ban, Swap who starts stays under the sequence.</small>
      </div>
    </section>
  );
}
