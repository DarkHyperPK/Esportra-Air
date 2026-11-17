import type { Snapshot } from '../../../shared/api.ts';
import type { VetoStep } from '../../../shared/match-data.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { title } from './model.ts';

const line = (m: Snapshot['match'], v: VetoStep) => `${v.action === 'decider' ? 'Decider' : `${m!.teams[v.team as 0 | 1]?.tag ?? ''} ${v.action}s`} ${title(v.map)}${v.side ? ` · ${v.side}` : ''}`;

/** When Air's veto and the match room's disagree: which one stands, or sending a correction. */
export function VetoSync({ s, run }: { s: Snapshot; run: Run }) {
  const o = s.esportraVeto?.outbox;
  if (!o) return null;
  if (o.conflict) {
    const differs = (i: number, list: VetoStep[], otherList: VetoStep[]) => JSON.stringify(list[i]) !== JSON.stringify(otherList[i]);
    return (
      <div className="vp-dialog" role="alertdialog" aria-label="The match room changed">
        <b>Someone entered steps on the website while Air’s steps waited</b>
        <div className="vp-cmp">
          <div><span className="cap faint">In Air</span><ol>{o.conflict.air.map((x, i) => <li key={i} className={differs(i, o.conflict!.air, o.conflict!.esportra) ? 'diff' : ''}>{line(s.match, x)}</li>)}</ol></div>
          <div><span className="cap faint">In the Esportra match room</span><ol>{o.conflict.esportra.map((x, i) => <li key={i} className={differs(i, o.conflict!.esportra, o.conflict!.air) ? 'diff' : ''}>{line(s.match, x)}</li>)}</ol></div>
        </div>
        <div className="row-gap">
          <button className="btn primary" onClick={() => void run(() => air.vetoOutboxResolve('esportra'))}>Use the match room’s veto</button>
          <button className="btn" onClick={() => void run(() => air.vetoOutboxResolve('air'))}>Keep Air’s veto</button>
        </div>
        <small className="faint">Keep Air’s veto resets the match room’s veto and sends Air’s steps again, so the website, the teams and the graphics all show Air’s version.</small>
      </div>
    );
  }
  if (o.rewrite) {
    return (
      <div className="notice between" role="status">
        <span>You changed a step the match room already has. Send the corrected veto? The match room’s veto is reset and Air’s is sent again.</span>
        <span className="row-gap"><button className="btn small" onClick={() => void run(() => air.vetoOutboxResolve('air'))}>Send the correction</button><button className="btn quiet small" onClick={() => void run(() => air.vetoOutboxResolve('esportra'))}>Use the match room’s</button></span>
      </div>
    );
  }
  if (o.error) return <div className="notice between" role="status"><span>Not sent to the match room: {o.error} The graphics already show the step.</span><button className="btn small" onClick={() => void run(() => air.vetoOutboxRetry())}>Try again</button></div>;
  if (o.waiting && s.esportraVeto?.unreachableSince) return <div className="notice" role="status">Esportra can’t be reached. The graphics already show your steps; {o.waiting} wait{o.waiting === 1 ? 's' : ''} to go to the match room, in order, when Esportra is back.</div>;
  return null;
}
