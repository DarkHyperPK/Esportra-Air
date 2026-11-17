import type { Snapshot } from '../../../shared/api.ts';
import type { VetoModel } from './model.ts';

/** Both teams, the format, and where the veto stands with the Esportra match room. */
export function VetoHeader({ s, v }: { s: Snapshot; v: VetoModel }) {
  const o = s.esportraVeto?.outbox;
  const sync = !o ? null
    : o.conflict ? <span className="vp-sync bad">The match room changed</span>
    : o.rewrite ? <span className="vp-sync wait">Correction not sent yet</span>
    : o.error ? <span className="vp-sync bad">Not sent · {o.error}</span>
    : o.waiting ? <span className="vp-sync wait">{o.waiting} step{o.waiting === 1 ? '' : 's'} waiting{s.esportraVeto?.unreachableSince ? ' · Esportra offline' : ''}</span>
    : <span className="vp-sync ok">{o.sentAt ? 'Sent to Esportra' : 'Linked to Esportra'}</span>;
  const team = (t: 0 | 1) => {
    const T = v.m.teams[t];
    return (
      <div className={`vp-team ${t ? 'r' : ''}`}>
        <span className="vp-crest" style={{ background: T.color || 'var(--raised)' }}>{(T.tag || T.name).slice(0, 3)}</span>
        <div><b>{T.name}</b><small>{T.tag}{t === v.first && v.md.veto.length ? ' · went first' : ''}</small></div>
      </div>
    );
  };
  return (
    <div className="vp-head">
      {team(0)}
      <div className="vp-mid"><span className="mono">BEST OF {v.m.bestOf}</span>{sync}</div>
      {team(1)}
    </div>
  );
}
