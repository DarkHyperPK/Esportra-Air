// A lobby's Rundown (24 Nov, approved mock 9): what runs by itself. A new lobby starts on Standard with autopilot
// on, so this tab is only for changing it: a starting point, the rows (graphic, when, which matches, time on
// screen) and the moments over the HUD. Saved as the lobby's `show` (src/shared/br-rundown.ts).
import { useEffect, useState } from 'react';
import type { Lobby } from '../../shared/api.ts';
import { BR_SCREENS, BR_SCREEN_NAME, type BrScreen } from '../../shared/br-screens.ts';
import { BR_MOMENTS, BR_MOMENT_NAME, BR_MOMENT_WHAT, BR_PRESETS, BR_PRESET_NAME, BR_SCOPE_NAME, BR_WHEN, BR_WHEN_NAME, showOf, type BrRow, type BrScope, type BrWhen } from '../../shared/br-rundown.ts';
import { gameOf } from '../../shared/games.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { Switch } from './Editors.tsx';

export function BrRundown({ run, lobby }: { run: Run; lobby: Lobby }) {
  const show = showOf(lobby);
  const feed = !!gameOf(lobby.game)?.feed;
  const [rows, setRows] = useState<BrRow[]>(show.rows);
  const saved = JSON.stringify(show.rows);
  useEffect(() => setRows(show.rows), [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(rows) !== saved;
  const set = (i: number, p: Partial<BrRow>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= rows.length) return; const next = [...rows]; [next[i], next[j]] = [next[j]!, next[i]!]; setRows(next); };
  const add = (screen: BrScreen) => setRows([...rows, { id: `row-${Date.now().toString(36).slice(-6)}`, screen, when: 'take', scope: 'every', hold: 10, enabled: true }]);
  const whens = BR_WHEN.filter((w) => feed || w !== 'plane');
  return (
    <div className="stack" style={{ gap: 14, maxWidth: 880 }}>
      <section className="card body-pad stack" style={{ gap: 10 }}>
        <div className="between">
          <div><b>Autopilot</b><p className="muted t-sm">{feed ? 'Runs this Rundown from the game: the plane, the end of each match and the end of the day.' : 'Runs this Rundown when you save a match’s results, and after the last match.'}</p></div>
          <Switch on={show.autopilot} label="Autopilot" onChange={(on) => void run(() => air.lobbyShow(lobby.id, { autopilot: on }))} />
        </div>
        <div className="row g-2" style={{ flexWrap: 'wrap' }}>
          <span className="cap">Start from</span>
          <div className="seg" role="group" aria-label="Start from">
            {BR_PRESETS.map((p) => <button key={p} title={BR_PRESET_NAME[p][1]} aria-pressed={show.startedFrom === p} onClick={() => void run(() => air.lobbyShow(lobby.id, { preset: p }))}>{BR_PRESET_NAME[p][0]}</button>)}
          </div>
        </div>
        <p className="faint t-xs">{BR_PRESET_NAME[show.startedFrom][1]}</p>
      </section>
      <section className="card">
        <div className="card-head"><b>Rundown</b><span className="muted t-sm">Rows marked After the previous one follow the row above them.</span></div>
        <div className="scroll-x"><table className="lb-tbl br-rd">
          <thead><tr><th>On</th><th>Graphic</th><th>When</th><th>Matches</th><th>On screen</th><th /></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={r.id} className={`${r.when === 'after' ? 'after' : ''} ${r.enabled ? '' : 'off'}`}>
              <td><input type="checkbox" aria-label={`Use ${BR_SCREEN_NAME[r.screen]}`} checked={r.enabled} onChange={(e) => set(i, { enabled: e.target.checked })} /></td>
              <td>{r.when === 'after' && <span className="faint">↳ </span>}<b>{BR_SCREEN_NAME[r.screen]}</b></td>
              <td><select className="cell" aria-label="When" value={r.when} onChange={(e) => set(i, { when: e.target.value as BrWhen })}>{whens.map((w) => <option key={w} value={w}>{BR_WHEN_NAME[w]}</option>)}</select></td>
              <td><select className="cell" aria-label="Matches" value={r.scope} onChange={(e) => set(i, { scope: e.target.value as BrScope })}>{(['every', 'between', 'last'] as BrScope[]).map((x) => <option key={x} value={x}>{BR_SCOPE_NAME[x]}</option>)}</select></td>
              <td><label className="row g-1"><input className="cell num" type="number" min={0} max={600} aria-label="Seconds on screen" value={r.hold} onChange={(e) => set(i, { hold: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })} /><span className="faint t-xs">{r.hold ? 's' : 'stays'}</span></label></td>
              <td className="r"><span className="row g-1">
                <button className="btn quiet small" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button className="btn quiet small" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button className="btn quiet small" aria-label={`Remove ${BR_SCREEN_NAME[r.screen]}`} onClick={() => setRows(rows.filter((_, k) => k !== i))}>✕</button>
              </span></td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="body-pad between">
          <select className="cell" style={{ maxWidth: 260 }} aria-label="Add a graphic" value="" onChange={(e) => e.target.value && add(e.target.value as BrScreen)}>
            <option value="">Add a graphic…</option>
            {BR_SCREENS.map((id) => <option key={id} value={id}>{BR_SCREEN_NAME[id]}</option>)}
          </select>
          <span className="row g-2">
            {dirty && <button className="btn small" onClick={() => setRows(show.rows)}>Undo changes</button>}
            <button className="btn primary small" disabled={!dirty} onClick={() => void run(() => air.lobbyShow(lobby.id, { rows }))}>Save Rundown</button>
          </span>
        </div>
      </section>
      {feed && (
        <section className="card body-pad stack" style={{ gap: 10 }}>
          <div><b>Moments over the HUD</b><p className="muted t-sm">From the game, one at a time, six seconds each. They need Game data.</p></div>
          <div className="br-moments">
            {BR_MOMENTS.map((k) => (
              <label key={k} className="br-mo" title={BR_MOMENT_WHAT[k]}><input type="checkbox" checked={show.moments[k]} onChange={(e) => void run(() => air.lobbyShow(lobby.id, { moments: { [k]: e.target.checked } }))} /><span><b>{BR_MOMENT_NAME[k]}</b><small className="faint">{BR_MOMENT_WHAT[k]}</small></span></label>
            ))}
            <label className="br-mo"><input type="checkbox" checked={show.ltf} onChange={(e) => void run(() => air.lobbyShow(lobby.id, { ltf: e.target.checked }))} /><span><b>Live top fraggers</b><small className="faint">A band with the three players with the most eliminations, on while the match runs.</small></span></label>
          </div>
        </section>
      )}
    </div>
  );
}
