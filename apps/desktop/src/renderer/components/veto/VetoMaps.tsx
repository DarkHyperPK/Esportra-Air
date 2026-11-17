import type { Snapshot } from '../../../shared/api.ts';
import { mapArt, mapTint } from '../../../shared/map-art.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { other, title, type VetoModel } from './model.ts';

/** The maps the veto made, in order, with each side and Swap sides. */
export function VetoMaps({ s, run, v }: { s: Snapshot; run: Run; v: VetoModel }) {
  const tag = (t: number) => (t === 0 || t === 1 ? v.m.teams[t].tag || v.m.teams[t].name : '');
  return (
    <div className="vp-maps">
      {Array.from({ length: v.m.bestOf }, (_, i) => {
        const x = v.maps[i];
        const step = x ? v.used.get(x.map) : undefined;
        const chooser = step?.side ? (step.sideTeam ?? (step.action === 'pick' ? other(step.team as 0 | 1) : -1)) : -1;
        const art = x && s.engine.port ? mapArt(s.engine.port, x.map, 'splash') : null;
        const note = !x ? (i === v.m.bestOf - 1 ? 'the decider' : 'after the veto')
          : `${x.pick === -1 ? 'decider' : `${tag(x.pick)} pick`}${step?.side && chooser >= 0 ? ` · ${tag(chooser)} ${step.side}, ${tag(other(chooser as 0 | 1))} ${step.side === 'ATK' ? 'DEF' : 'ATK'}` : ' · side to choose'}`;
        return (
          <div key={i} className="vp-mapc">
            <span className="vp-th" style={{ background: x ? `${art ? `url(${art}) center/cover, ` : ''}${mapTint(x.map)}` : 'var(--raised)' }} />
            <span style={{ minWidth: 0 }}><b>Map {i + 1}{x ? ` · ${title(x.map)}` : ''}</b><small className="muted">{note}</small></span>
            {step?.side && <button className="btn small" onClick={() => void run(() => air.vetoEdit(step.index, { side: step.side === 'ATK' ? 'DEF' : 'ATK' }))}>Swap sides</button>}
          </div>
        );
      })}
    </div>
  );
}
