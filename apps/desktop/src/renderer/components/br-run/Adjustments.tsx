// Penalties and adjustments (27 Nov): points added or taken away from a team with a reason. They show in the official
// standings and in the day summary, and each is journalled.
import { useState } from 'react';
import type { Lobby } from '../../../shared/api.ts';
import { standings } from '../../../shared/br.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { TeamTag } from './parts.tsx';

export function Adjustments({ run, l, close }: { run: Run; l: Lobby; close: () => void }) {
  const [team, setTeam] = useState(l.teams[0]?.id ?? '');
  const [points, setPoints] = useState('-1');
  const [reason, setReason] = useState('');
  const list = l.adjustments ?? [];
  const table = standings(l);
  const pts = Number(points);
  const ok = !!team && Number.isInteger(pts) && pts !== 0 && !!reason.trim();
  return (
    <div className="scrim right" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="editor" role="dialog" aria-modal="true" aria-label="Adjustments">
        <header><h2 className="title-md">{l.title} · Adjustments</h2><button className="btn quiet small" onClick={close}>Esc</button></header>
        <div className="editor-body">
          <p className="muted t-sm">Points added or taken away (a DQ, a late start, a rule breach). They count in the official standings and are kept with their reason.</p>
          <div className="row-gap" style={{ flexWrap: 'wrap' }}>
            <select className="cell" aria-label="Team" value={team} onChange={(e) => setTeam(e.target.value)}>{l.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <input className="cell" aria-label="Points" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/[^-\d]/g, ''))} style={{ width: 72 }} />
            <input className="cell" aria-label="Why" placeholder="Why (required)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <button className="btn primary small" disabled={!ok} onClick={() => void run(async () => { await air.lobbyAdjust(l.id, team, pts, reason); setReason(''); })}>Add</button>
          </div>
          {!list.length && <p className="faint t-sm">No adjustments yet.</p>}
          {list.map((a) => <div key={a.id} className="run-check"><b className="mono">{a.points > 0 ? '+' : ''}{a.points}</b><span><TeamTag lobby={l} id={a.team} /><br /><span className="muted t-sm">{a.reason} · {new Date(a.at).toLocaleString('en-GB')}</span></span><button className="btn quiet small" onClick={() => void run(async () => { await air.lobbyAdjustRemove(l.id, a.id); })}>Remove</button></div>)}
          <h3 className="cap">Official standings</h3>
          <table className="lb-st"><tbody>{table.map((r) => <tr key={r.team}><td className="faint">{r.rank}</td><td><TeamTag lobby={l} id={r.team} /></td><td className="faint t-xs">{r.adjusted ? `${r.adjusted > 0 ? '+' : ''}${r.adjusted} adj` : ''}</td><td className="r mono"><b>{r.total}</b></td></tr>)}</tbody></table>
        </div>
      </div>
    </div>
  );
}
