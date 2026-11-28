// The provisional results panel (27 Nov, approved mock 5): the match's table, the checks (verified game data only), and the
// standings as they would be after Confirm, against the official ones. Nothing here changes the official standings.
import type { Lobby, Snapshot } from '../../../shared/api.ts';
import { gamePoints, gameState } from '../../../shared/br.ts';
import { confirmProblems, hasWarnings, matchRows, provisionalChecks, standingsView } from '../../../shared/br-run.ts';
import { keyLabel, keyOf } from '../../../shared/keymap.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { TeamTag } from './parts.tsx';

export function ProvisionalPanel({ s, run, l, n, close, edit }: { s: Snapshot; run: Run; l: Lobby; n: number; close: () => void; edit: () => void }) {
  const g = l.games.find((x) => x.n === n);
  if (!g) return null;
  const rows = matchRows(l, g);
  const checks = provisionalChecks(l, g);
  const view = standingsView(l);
  const problems = confirmProblems(l, g);
  const flagged = new Set(checks.filter((c) => c.level === 'warn' && c.team).map((c) => c.team));
  const kills = (g.results ?? []).reduce((a, r) => a + r.elims, 0);
  const table = view.provisional ?? view.official;
  const key = keyLabel(keyOf(s.keymap, 'confirm'));
  return (
    <div className="scrim right" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="editor match-drawer" role="dialog" aria-modal="true" aria-label={`Match ${n} results`}>
        <header><h2 className="title-md">{l.title} · Match {n} · Results</h2><button className="btn quiet small" onClick={close}>Esc</button></header>
        <div className="editor-body">
          <div className="run-two">
            <section className="card" aria-label="Table">
              <div className="lb-head"><h3 className="title-sm">Match {n}{g.map ? ` · ${g.map}` : ''} · {kills} kills</h3><span style={{ flex: 1 }} /><span className={`run-st ${gameState(g)}`}>{gameState(g) === 'confirmed' ? 'Confirmed' : 'Provisional'}</span></div>
              <table className="lb-tbl"><thead><tr><th>Place</th><th>Team</th><th className="r">Kills</th><th className="r">Place pts</th><th className="r">Kill pts</th><th className="r">Total</th></tr></thead>
                <tbody>{rows.map((r) => { const p = r.place === null ? null : gamePoints({ team: r.team, place: r.place, elims: r.elims }, l.scoring); return (
                  <tr key={r.team} className={flagged.has(r.team) ? 'run-flag' : ''}><td className="mono">{r.place ?? <span className="chip warn">type it</span>}</td><td><TeamTag lobby={l} id={r.team} />{flagged.has(r.team) && <span className="pill warn" style={{ marginLeft: 8 }}>CHECK</span>}</td>
                    <td className="r mono">{r.elims}</td><td className="r mono">{p?.placementPts ?? '–'}</td><td className="r mono">{p?.elimPts ?? '–'}</td><td className="r mono"><b>{p?.total ?? '–'}</b></td></tr>); })}</tbody></table>
            </section>
            <div className="stack" style={{ gap: 12 }}>
              <section className={`card run-sec ${hasWarnings(checks) ? 'warn' : 'ok'}`} aria-label="Checks"><h3 className="cap">Checks · {checks.filter((c) => c.level === 'warn').length} to look at</h3>
                {checks.map((c) => <div key={c.id} className="run-check"><i className={`run-tick ${c.level === 'ok' ? 'ok' : c.level === 'warn' ? 'warn' : 'na'}`}>{c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : 'i'}</i><span><b>{c.title}</b><br /><span className="muted t-sm">{c.detail}</span></span></div>)}
              </section>
              <section className="card run-sec" aria-label="Standings if you confirm"><h3 className="cap">Standings if you confirm <span className="pill warn">Provisional</span></h3>
                <table className="lb-st"><tbody>{table.slice(0, 10).map((r) => { const m = view.move[r.team] ?? 0; return <tr key={r.team}><td className="faint">{r.rank}</td><td><TeamTag lobby={l} id={r.team} /></td><td className="r mono"><b>{r.total}</b></td><td className={`r t-xs ${m > 0 ? 'ok-text' : m < 0 ? 'bad-text' : 'faint'}`}>{m > 0 ? `▲${m}` : m < 0 ? `▼${-m}` : '–'}</td></tr>; })}</tbody></table>
                <p className="faint t-xs">Arrows are against the official standings. Marked provisional on air until you confirm.</p>
              </section>
            </div>
          </div>
        </div>
        <footer><span className="muted t-sm">{problems[0] ?? 'Nothing here changes the official standings yet.'}</span>
          <span className="row-gap">{g.feed && gameState(g) === 'provisional' && <button className="btn" title="Read the game again and refill the after-match numbers (survival, damage taken, heal, assists…). Places and kills you typed are never changed." onClick={() => void run(async () => { await air.lobbyUpdateFromGame(g.id!); })}>Update from game{g.feed.updatedAt ? ` · ${new Date(g.feed.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</button>}<button className="btn" onClick={edit}>Edit</button>
            <button className="btn primary" disabled={problems.length > 0} onClick={() => void run(async () => { await air.lobbyConfirm(l.id, g.id!); close(); })}>Confirm match {n} <span className="kbd">{key}</span></button></span></footer>
      </div>
    </div>
  );
}
