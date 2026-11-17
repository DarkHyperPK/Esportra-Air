import type { Snapshot } from '../../../shared/api.ts';
import { mapArt, mapTint } from '../../../shared/map-art.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { other, title, type VetoModel } from './model.ts';

/** After a pick, and on the decider: the side the choosing team starts on. */
export function VetoSidePick({ s, run, v }: { s: Snapshot; run: Run; v: VetoModel }) {
  const step = v.md.veto[v.sideAt];
  if (!step || v.sideTeam === null) return null;
  const T = v.m.teams[v.sideTeam], O = v.m.teams[other(v.sideTeam)];
  const art = s.engine.port ? mapArt(s.engine.port, step.map, 'splash') : null;
  const mapNo = v.maps.findIndex((x) => x.map === step.map) + 1;
  const set = (side: 'ATK' | 'DEF') => void run(() => air.vetoEdit(v.sideAt, { side, sideTeam: v.sideTeam! }));
  return (
    <section className="vp-sidepick" aria-label="Side choice">
      <div className="vp-sideart" style={{ background: `${art ? `url(${art}) center/cover, ` : ''}${mapTint(step.map)}` }}><b>{title(step.map)}</b></div>
      <div className="stack" style={{ gap: 6 }}>
        <b className="vp-big">Map {mapNo} · {title(step.map)}{step.action === 'decider' ? ' · decider' : ''}</b>
        <span className="muted t-sm">{T.name} chooses where they start. {O.name} takes the other side.</span>
        <div className="vp-row">
          <button className="vp-sbtn atk" onClick={() => set('ATK')}><b>ATTACK</b><small>{T.tag} starts on attack</small></button>
          <button className="vp-sbtn def" onClick={() => set('DEF')}><b>DEFENCE</b><small>{T.tag} starts on defence</small></button>
        </div>
      </div>
    </section>
  );
}
