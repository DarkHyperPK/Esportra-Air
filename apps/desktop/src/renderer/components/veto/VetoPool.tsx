import type { Snapshot } from '../../../shared/api.ts';
import { mapArt } from '../../../shared/map-art.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { MapTile, type TileTeam } from './MapTile.tsx';
import { other, teamAt, type VetoModel } from './model.ts';

/** The map pool as tiles. While a side is owed, the pool waits for it. */
export function VetoPool({ s, run, v }: { s: Snapshot; run: Run; v: VetoModel }) {
  const team = (t: number): TileTeam | undefined => (t === 0 || t === 1 ? { tag: v.m.teams[t].tag || v.m.teams[t].name, color: v.m.teams[t].color } : undefined);
  const can = v.sideAt < 0 && !!v.next;
  const now = can ? teamAt(v, v.md.veto.length) : -1;
  const actor = now === 0 || now === 1 ? v.m.teams[now].tag || v.m.teams[now].name : undefined;
  return (
    <div className="vp-pool" role="group" aria-label="Map pool">
      {v.md.mapPool.map((map) => {
        const step = v.used.get(map);
        const mapNo = step && step.action !== 'ban' ? v.maps.findIndex((x) => x.map === map) + 1 : undefined;
        const by = step?.side ? team(step.sideTeam ?? (step.action === 'pick' ? other(step.team as 0 | 1) : -1)) : undefined;
        return (
          <MapTile key={map} map={map} art={s.engine.port ? mapArt(s.engine.port, map) : null} step={step} mapNo={mapNo} team={step ? team(step.team) : undefined} sideBy={by}
            action={!step && can ? v.next!.action : null} actor={actor} onPick={() => void run(() => air.vetoStep({ map }))} />
        );
      })}
    </div>
  );
}
