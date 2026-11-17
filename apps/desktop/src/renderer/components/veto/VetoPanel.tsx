// The veto panel (approved mock, 16 Nov): coin toss, the map pool with pictures, a turn banner, a side after
// every pick and on the decider, Swap sides, and the sequence. For an Esportra match every step also goes to
// the match room (src/main/esportra-veto-outbox.ts). The same panel is in New match, Match data and Live (Ctrl M).
import type { Snapshot } from '../../../shared/api.ts';
import type { MatchData } from '../../../shared/match-data.ts';
import type { Run } from '../../App.tsx';
import { VetoHeader } from './VetoHeader.tsx';
import { VetoMaps } from './VetoMaps.tsx';
import { VetoPool } from './VetoPool.tsx';
import { VetoSequence } from './VetoSequence.tsx';
import { VetoSidePick } from './VetoSidePick.tsx';
import { VetoSync } from './VetoSync.tsx';
import { VetoToss } from './VetoToss.tsx';
import { VetoTurn } from './VetoTurn.tsx';
import { vetoModel } from './model.ts';

export function VetoPanel({ s, run, md }: { s: Snapshot; run: Run; md: MatchData }) {
  const v = vetoModel(s, md);
  return (
    <section className="card vp" aria-label="Map veto">
      <VetoHeader s={s} v={v} />
      <VetoSync s={s} run={run} />
      {!md.veto.length && <VetoToss s={s} run={run} v={v} />}
      <VetoTurn v={v} />
      {v.sideAt >= 0 ? <VetoSidePick s={s} run={run} v={v} /> : null}
      <VetoPool s={s} run={run} v={v} />
      <VetoSequence run={run} v={v} />
      <VetoMaps s={s} run={run} v={v} />
    </section>
  );
}
