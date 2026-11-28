// The test-game roster check (28 Nov, approved mock): in Live › Game data, while the observer client is in a game and no
// match is live. How many of the game's players the roster places by UID, and for each one it cannot place, who Air thinks
// it is, with Use this UID, Pick player and Ignore. The roster only changes here, in a test game.
import { useState } from 'react';
import type { Lobby, Snapshot } from '../../../shared/api.ts';
import type { RosterRow } from '../../../shared/br-roster.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';

export function RosterCheck({ s, run, l }: { s: Snapshot; run: Run; l: Lobby }) {
  const v = s.rosterCheck;
  const [ignored, setIgnored] = useState<string[]>([]);
  const [picking, setPicking] = useState<string | null>(null);
  if (!v || v.lobbyId !== l.id) return null;
  if (v.blocked) return <section className="card body-pad stack g-1 pp-roster blocked" aria-label="Roster check"><b className="cap">Roster check</b><span className="muted t-sm">{v.blocked}</span></section>;
  const c = v.check!;
  const rows = c.rows.filter((r) => !ignored.includes(`${r.slot}:${r.uid}:${r.name}`));
  const key = (r: RosterRow) => `${r.slot}:${r.uid}:${r.name}`;
  const players = l.teams.flatMap((t) => t.players.map((name, i) => ({ id: t.playerIds?.[i] ?? '', name, team: t.name, teamId: t.id })).filter((p) => p.id));
  const open = c.rows.length;
  return (
    <section className={`card body-pad stack g-2 pp-roster ${open ? 'warn' : 'ok'}`} aria-label="Roster check">
      <div className="between"><b className="cap">Roster check</b><span className="faint t-xs">Players in the game against your roster, matched by UID</span></div>
      <div className="row g-2" style={{ alignItems: 'baseline' }}><span className="pp-big mono">{c.placed} of {c.total}</span><span className="muted">players placed by UID</span>
        <span style={{ flex: 1 }} /><span className={`chip ${c.teamsPaired === c.teamsTotal ? 'ok' : 'warn'}`}>{c.teamsPaired} of {c.teamsTotal} teams paired</span></div>
      <div className="pp-bar" aria-hidden="true"><i style={{ width: `${c.total ? (100 * c.placed) / c.total : 0}%` }} /></div>
      {open === 0 ? <span className="ok-text t-sm">Every player in the game is placed by UID. The roster is ready for the show.</span>
        : <span className="muted t-sm">{open} player{open === 1 ? '' : 's'} in the game did not match anyone’s UID. Fix {open === 1 ? 'it' : 'them'} here, once, and the roster is ready for the show.</span>}
      {rows.map((r) => (
        <div key={key(r)} className="pp-row">
          <div><b>{r.name}</b><br /><span className="faint t-xs">in the game · team slot #{r.slot}</span></div>
          <div className="mono">{r.uid || '—'}</div>
          <div>
            {r.suggestion
              ? <><b>Looks like {r.suggestion.teamName} · {r.suggestion.name}</b><br /><span className="muted t-xs">{r.suggestion.why}. {r.suggestion.detail}</span></>
              : <span className="muted t-xs">{r.note}</span>}
            <div className="row g-2" style={{ marginTop: 8, flexWrap: 'wrap' }}>
              {r.suggestion && r.uid && <button className="btn small primary" onClick={() => void run(() => air.rosterUid(l.id, r.suggestion!.playerId, r.uid))}>Use this UID</button>}
              {r.uid && <button className="btn small" aria-expanded={picking === key(r)} onClick={() => setPicking(picking === key(r) ? null : key(r))}>Pick player</button>}
              <button className="btn quiet small" onClick={() => setIgnored((x) => [...x, key(r)])}>Ignore</button>
            </div>
            {picking === key(r) && (
              <select className="cell" style={{ marginTop: 8 }} aria-label={`Player for ${r.name}`} defaultValue="" onChange={(e) => { const id = e.target.value; if (id) void run(async () => { await air.rosterUid(l.id, id, r.uid); setPicking(null); }); }}>
                <option value="">Choose the player…</option>
                {[...players.filter((p) => p.teamId === r.team), ...players.filter((p) => p.teamId !== r.team)].map((p) => <option key={p.id} value={p.id}>{p.name} · {p.team}</option>)}
              </select>
            )}
          </div>
        </div>
      ))}
      <div className="pp-note"><b>Only in test games.</b> During the show Air never changes teams or players. If someone unknown appears, Air flags them and counts their numbers to their team’s slot.</div>
    </section>
  );
}
