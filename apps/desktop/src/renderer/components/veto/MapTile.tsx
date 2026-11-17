import { useState } from 'react';
import { mapTint } from '../../../shared/map-art.ts';
import type { MapName, VetoStep } from '../../../shared/match-data.ts';
import { title } from './model.ts';

export interface TileTeam { tag: string; color: string }

/** One map in the pool: its picture; struck through with the team's crest when banned; Map N when picked. */
export function MapTile({ map, art, step, mapNo, team, sideBy, action, onPick }: {
  map: MapName; art: string | null; step?: VetoStep; mapNo?: number; team?: TileTeam; sideBy?: TileTeam;
  /** What clicking does now (ban, pick, decider), or null when the tile cannot be clicked. */
  action: 'ban' | 'pick' | 'decider' | null; onPick: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const kind = step ? (step.action === 'ban' ? 'ban' : 'pick') : 'open';
  const label = step ? `${title(map)}, ${step.action === 'decider' ? 'decider' : `${step.action === 'ban' ? 'banned' : 'picked'} by ${team?.tag ?? ''}`}` : action ? `${action === 'decider' ? 'Decider' : action === 'ban' ? 'Ban' : 'Pick'} ${title(map)}` : title(map);
  return (
    <button type="button" className={`vp-tile ${kind} ${action ? 'live' : ''}`} style={{ ['--tint' as string]: mapTint(map) }} disabled={!action} onClick={onPick} aria-label={label}>
      {art && !broken && <img src={art} alt="" onError={() => setBroken(true)} draggable={false} />}
      {kind === 'ban' && <span className="vp-strike" />}
      {step && (
        <span className="vp-tag">
          <span className={`vp-pill ${kind === 'pick' ? 'map' : ''}`}>{kind === 'ban' ? 'BAN' : step.action === 'decider' ? 'DECIDER' : `MAP ${mapNo ?? ''}`}</span>
          {team && <span className="vp-mini" style={{ background: team.color }}>{team.tag.slice(0, 3)}</span>}
        </span>
      )}
      {step?.side && <span className={`vp-side ${step.side === 'ATK' ? 'atk' : 'def'}`}>{sideBy ? `${sideBy.tag} · ` : ''}{step.side}</span>}
      {action && <span className="vp-act">{action === 'decider' ? 'DECIDER' : action === 'ban' ? 'BAN' : 'PICK'} {map}</span>}
      <span className="vp-name">{title(map)}</span>
    </button>
  );
}
