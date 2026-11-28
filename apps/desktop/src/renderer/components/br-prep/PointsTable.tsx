// A lobby's points table (28 Nov, approved mock "Format"): points for each place, per kill, kill cap, match point, the
// tiebreak order, the PMGC and FFWS presets and the tables saved on this PC. Used by Format and by Scoring.
import { useEffect, useState } from 'react';
import type { Lobby, Snapshot } from '../../../shared/api.ts';
import { SCORING_PRESETS, TIEBREAK_NAME, gamePoints, type Scoring, type Tiebreak } from '../../../shared/br.ts';
import { tableGap, tableName } from '../../../shared/br-format.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';

const ORDINAL = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ({ 1: 'ST', 2: 'ND', 3: 'RD' } as Record<number, string>)[n % 10] ?? 'TH'}`;
const ALL: Tiebreak[] = ['wins', 'placementPts', 'elims', 'lastGame'];

export function PointsTable({ s, run, lobby }: { s: Snapshot; run: Run; lobby: Lobby }) {
  const [sc, setSc] = useState<Scoring>(lobby.scoring);
  const cellsOf = (x: Scoring) => Array.from({ length: Math.min(32, Math.max(lobby.teams.length, x.placement.length, 8)) }, (_, i) => (x.placement[i] === undefined ? '' : String(x.placement[i])));
  const [cells, setCells] = useState<string[]>(cellsOf(lobby.scoring));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const key = JSON.stringify(lobby.scoring) + lobby.teams.length;
  useEffect(() => { setSc(lobby.scoring); setCells(cellsOf(lobby.scoring)); }, [key]);
  // Values from the first to the last place that has one; an empty cell between two is a gap to fill.
  const last = cells.reduce((n, c, i) => (c !== '' ? i + 1 : n), 0);
  const parsed = cells.slice(0, last).map((c) => (c === '' ? NaN : Number(c)));
  const hole = parsed.findIndex((x) => !Number.isInteger(x) || x < 0 || x > 100);
  const next: Scoring = { ...sc, placement: hole >= 0 || !last ? sc.placement : (parsed as number[]) };
  const same = JSON.stringify(next) === JSON.stringify(lobby.scoring);
  const gap = tableGap(next, lobby.teams.length);
  const saved = s.pointsTables;
  const current = tableName(next, saved);
  const load = (x: Scoring) => { setSc({ ...x, ...(sc.matchPoint !== undefined && x.matchPoint === undefined ? { matchPoint: sc.matchPoint } : {}) }); setCells(cellsOf(x)); };
  const move = (i: number, d: -1 | 1) => { const t = [...sc.tiebreak]; const j = i + d; if (j < 0 || j >= t.length) return; [t[i], t[j]] = [t[j]!, t[i]!]; setSc({ ...sc, tiebreak: t }); };
  const fill = () => setCells((c) => c.map((x, i) => (x === '' && i < Math.max(lobby.teams.length, last) ? '0' : x)));
  const p1 = next.placement[0] ?? 0, p5 = next.placement[4] ?? 0, k = next.perElim;
  return (
    <section className="card body-pad stack pp-table" style={{ gap: 12 }} aria-label="Points table">
      <div className="between"><span className="cap">Points table</span><span className={`state ${gap || hole >= 0 ? 'warn' : 'ok'}`}><i className={`dot ${gap || hole >= 0 ? 'warn' : 'ok'}`} />{hole >= 0 ? `Place ${hole + 1} needs a number` : gap ? `Places ${gap.from}${gap.to > gap.from ? `–${gap.to}` : ''} have no points` : 'Complete'}</span></div>
      <div className="rb-chips" role="group" aria-label="Start from">
        {(Object.keys(SCORING_PRESETS) as Array<keyof typeof SCORING_PRESETS>).map((p) => <button key={p} type="button" className="rb-chip" aria-pressed={current === SCORING_PRESETS[p].name} onClick={() => load(SCORING_PRESETS[p].scoring)}>{p.toUpperCase()}</button>)}
        {saved.map((t) => <button key={t.id} type="button" className="rb-chip" aria-pressed={current === t.name} title="Saved on this PC" onClick={() => load(t.scoring)}>★ {t.name}</button>)}
      </div>
      <span className="cap">Points for each place · type to change</span>
      <div className="pp-places">
        {cells.map((c, i) => (
          <label key={i} className="pp-place"><small className="cap">{ORDINAL(i + 1)}</small>
            <input className={`cell mono ${c === '' && i < lobby.teams.length ? 'gap' : ''}`} inputMode="numeric" aria-label={`Points for place ${i + 1}`} value={c} placeholder="–" onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setCells((x) => x.map((y, j) => (j === i ? v : y))); }} /></label>
        ))}
      </div>
      <div className="row g-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="stack g-1"><span className="cap">Points per kill</span><input className="cell" type="number" min={0} max={10} value={sc.perElim} onChange={(e) => setSc({ ...sc, perElim: Math.max(0, Math.min(10, Number(e.target.value) || 0)) })} style={{ width: 90 }} /></label>
        <label className="stack g-1"><span className="cap">Kill cap per match · optional</span><input className="cell" type="number" min={0} max={100} placeholder="none" value={sc.elimCap ?? ''} onChange={(e) => { const v = e.target.value; setSc(({ elimCap: _x, ...rest }) => (v === '' ? rest : { ...rest, elimCap: Number(v) })); }} style={{ width: 130 }} /></label>
        <label className="stack g-1"><span className="cap">Match point · optional</span><input className="cell" type="number" min={1} max={1000} placeholder="none" value={sc.matchPoint ?? ''} onChange={(e) => { const v = e.target.value; setSc(({ matchPoint: _x, ...rest }) => (v === '' ? rest : { ...rest, matchPoint: Number(v) })); }} style={{ width: 130 }} /></label>
        {gap && <button className="btn small" onClick={fill}>Fill the rest with 0</button>}
      </div>
      <span className="cap">If teams tie, the order is</span>
      <div className="pp-ties" role="list" aria-label="Tiebreak order">
        {sc.tiebreak.map((t, i) => (
          <span key={t} role="listitem" className="pp-tie"><b>{i + 1}</b> {TIEBREAK_NAME[t]}
            <button type="button" aria-label={`Move ${TIEBREAK_NAME[t]} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>‹</button>
            <button type="button" aria-label={`Move ${TIEBREAK_NAME[t]} later`} disabled={i === sc.tiebreak.length - 1} onClick={() => move(i, 1)}>›</button>
            <button type="button" aria-label={`Do not use ${TIEBREAK_NAME[t]}`} disabled={sc.tiebreak.length <= 1} onClick={() => setSc({ ...sc, tiebreak: sc.tiebreak.filter((x) => x !== t) })}>×</button></span>
        ))}
        {ALL.filter((t) => !sc.tiebreak.includes(t)).map((t) => <button key={t} type="button" className="pp-tie add" onClick={() => setSc({ ...sc, tiebreak: [...sc.tiebreak, t] })}>+ {TIEBREAK_NAME[t]}</button>)}
      </div>
      <p className="pp-example muted t-sm">Example: 1st place with 8 kills = {p1} + {8 * k} = <b>{gamePoints({ team: '', place: 1, elims: 8 }, next).total}</b>. 5th place with 3 kills = {p5} + {3 * k} = <b>{gamePoints({ team: '', place: 5, elims: 3 }, next).total}</b>.</p>
      <p className="faint t-xs">Match point: a team at or over it that then wins a match takes the title (PMGC Smash, FFWS Champions Rush). Scoring rules differ per event; check yours.</p>
      <div className="row g-2" style={{ flexWrap: 'wrap' }}>
        <button className="btn primary small" disabled={same || hole >= 0 || !last || !next.tiebreak.length} onClick={() => void run(() => air.lobbyUpdate(lobby.id, { scoring: next }))}>Save scoring</button>
        {!naming
          ? <button className="btn small" onClick={() => { setNaming(true); setName(''); }}>Save as my points table</button>
          : <form className="row g-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await air.pointsTableSave({ name, scoring: next }); setNaming(false); setName(''); }); }}>
              <input className="cell" autoFocus aria-label="Name of the points table" placeholder="e.g. Nexus 15-12-10" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              <button className="btn primary small" disabled={!name.trim() || hole >= 0 || !last}>Save table</button>
              <button type="button" className="btn quiet small" onClick={() => setNaming(false)}>Cancel</button></form>}
        <span className="faint t-xs">Kept on this PC. Pick it in any event.</span>
      </div>
      {saved.length > 0 && <div className="row g-2" style={{ flexWrap: 'wrap' }}>{saved.map((t) => <span key={t.id} className="faint t-xs">★ {t.name} <button className="btn quiet small danger" onClick={() => void run(async () => { await air.pointsTableDelete(t.id); })}>Delete</button></span>)}</div>}
    </section>
  );
}
