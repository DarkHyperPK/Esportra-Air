// The readiness strip (28 Nov, approved mock): what still needs the producer before the show, and what is in place.
// Shown on Events › lobby › Teams and inside Start day's checklist. Nothing here blocks the show.
import type { Lobby, Snapshot } from '../../../shared/api.ts';
import { readiness, type Goto } from '../../../shared/br-readiness.ts';

const GO: Record<Goto, string> = { teams: 'Show them', format: 'Open Format', scoring: 'Open scoring' };

export function ReadinessStrip({ s, lobby, go, compact }: { s: Snapshot; lobby: Lobby; go?: (g: Goto) => void; compact?: boolean }) {
  const r = readiness(lobby, s.library.players, s.pointsTables);
  return (
    <div className={`pp-ready ${compact ? 'compact' : ''}`} aria-label="Ready before the show">
      <section className={`pp-box ${r.needs.length ? 'warn' : 'ok'}`}>
        <h3 className="cap">{r.needs.length ? `Needs you · ${r.needs.length}` : 'Needs you · nothing'}</h3>
        {!r.needs.length && <p className="muted t-sm">Every player has a UID, every team has a squad, every match has a map, and the points table is complete.</p>}
        {r.needs.map((n) => (
          <div key={n.id} className="pp-need">
            <i className="run-tick warn" aria-hidden="true">!</i>
            <span><b>{n.title}</b><br /><span className="muted t-sm">{n.detail}</span></span>
            {go && n.goto && <button className="btn small" onClick={() => go(n.goto!)}>{GO[n.goto]}</button>}
          </div>
        ))}
      </section>
      <section className="pp-box ok">
        <h3 className="cap">Ready · {r.ready.length}</h3>
        <div className="pp-chips">
          {r.ready.map((x) => <span key={x.id} className={`pp-chip ${x.partial ? 'partial' : 'ok'}`} title={x.detail || undefined}>{x.partial ? '○' : '✓'} {x.title}{x.detail && x.id !== 'logos' ? <span className="faint"> · {x.detail}</span> : ''}</span>)}
          {!r.ready.length && <span className="muted t-sm">Add teams to see logos and photos.</span>}
        </div>
      </section>
    </div>
  );
}
