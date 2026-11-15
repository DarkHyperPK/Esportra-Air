import { useEffect, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { Cap } from './ui.tsx';

/** Fix data (PRD picture 13): changes go on air on Apply. A fixed score lasts until the next round; names, series and sides until you clear them. */
export function FixData({ s, run, close }: { s: Snapshot; run: Run; close?: () => void }) {
  const match = s.match;
  const r = s.readout;
  const [score, setScore] = useState<[number, number]>([r?.score[0] ?? 0, r?.score[1] ?? 0]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [swap, setSwap] = useState(false);
  const [series, setSeries] = useState<[number, number]>([r?.series[0] ?? 0, r?.series[1] ?? 0]);
  const [teamNames, setTeamNames] = useState<Array<{ name: string; tag: string }> | null>(null);
  useEffect(() => { setScore([r?.score[0] ?? 0, r?.score[1] ?? 0]); setSeries([r?.series[0] ?? 0, r?.series[1] ?? 0]); setTeamNames(null); }, [match?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!match) return <p className="muted">Choose a match first.</p>;
  const scoreChanged = r !== null && (score[0] !== (r.score[0] ?? 0) || score[1] !== (r.score[1] ?? 0));
  const seriesChanged = r !== null && (series[0] !== r.series[0] || series[1] !== r.series[1]);
  const dirty = scoreChanged || seriesChanged || teamNames !== null || swap || Object.keys(names).length > 0;
  const step = (i: 0 | 1, d: number) => setScore((v) => (i === 0 ? [Math.max(0, v[0] + d), v[1]] : [v[0], Math.max(0, v[1] + d)]));
  const maxWins = Math.ceil(match.bestOf / 2);
  const stepSeries = (i: 0 | 1, d: number) => setSeries((v) => { const n = [...v] as [number, number]; n[i] = Math.min(maxWins, Math.max(0, n[i] + d)); return n; });
  const shownTeams = teamNames ?? (r?.teams.length ? r.teams : match.teams.map((t) => ({ name: t.name, tag: t.tag })));

  const apply = async () => {
    const calls: Array<() => Promise<Snapshot | void>> = [];
    if (scoreChanged) calls.push(() => air.correct({ field: 'scores', value: score, reason: 'Operator score fix' }));
    if (seriesChanged) calls.push(() => air.correct({ field: 'series', value: series, reason: 'Operator series fix' }));
    if (teamNames && teamNames.every((t) => t.name.trim() && t.tag.trim())) calls.push(() => air.correct({ field: 'names', value: teamNames.map((t) => ({ name: t.name.trim(), tag: t.tag.trim().toUpperCase() })), reason: 'Operator team name fix' }));
    for (const [key, name] of Object.entries(names)) {
      const [team, index] = key.split(':').map(Number) as [number, number];
      if (name.trim()) calls.push(() => air.correct({ field: 'player_name', value: [team, { index, name: name.trim() }], reason: 'Operator name fix' }));
    }
    if (swap && r?.sides[0] && r.sides[1]) calls.push(() => air.correct({ field: 'sides', value: [r.sides[1], r.sides[0]], reason: 'Operator side swap' }));
    for (const call of calls) if (!(await run(call))) return;
    setNames({});
    setTeamNames(null);
    setSwap(false);
    close?.();
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <Cap>Fix data · live</Cap>
        <h2 className="title-md" style={{ marginTop: 8 }}>Correct what’s on screen</h2>
        <p className="muted" style={{ marginTop: 6 }}>Changes go on air as soon as you apply them. A fixed score holds until the next round; team names, player names, the series and sides hold until you clear them.</p>
      </div>
      <section className="stack" style={{ gap: 8 }}>
        <Cap>Score</Cap>
        <div className="grid2">
          {match.teams.map((t, i) => (
            <div key={t.name} className="panel body-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <b>{t.name}</b>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn small" aria-label={`Decrease ${t.name}`} onClick={() => step(i as 0 | 1, -1)}>−</button>
                <span className="title-lg" style={{ fontSize: 30, minWidth: 40, textAlign: 'center' }}>{score[i]}</span>
                <button className="btn small" aria-label={`Increase ${t.name}`} onClick={() => step(i as 0 | 1, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="stack" style={{ gap: 8 }}>
        <Cap>Series · maps won (best of {match.bestOf})</Cap>
        <div className="grid2">
          {match.teams.map((t, i) => (
            <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1 }}>{t.name}</span>
              <button className="btn small" aria-label={`Fewer maps for ${t.name}`} onClick={() => stepSeries(i as 0 | 1, -1)}>−</button>
              <b style={{ minWidth: 20, textAlign: 'center' }}>{series[i]}</b>
              <button className="btn small" aria-label={`More maps for ${t.name}`} onClick={() => stepSeries(i as 0 | 1, 1)}>+</button>
            </div>
          ))}
        </div>
        <p className="faint t-xs">The map being played follows: map {Math.min(series[0] + series[1] + 1, match.bestOf)} of {match.bestOf}.</p>
      </section>
      <section className="stack" style={{ gap: 8 }}>
        <Cap>Team names on screen</Cap>
        {shownTeams.map((t, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
            <input className="cell" aria-label={`Team ${i + 1} name on screen`} value={t.name} maxLength={80} onChange={(e) => { const next = shownTeams.map((x) => ({ ...x })); next[i]!.name = e.target.value; setTeamNames(next); }} />
            <input className="cell" aria-label={`Team ${i + 1} tag on screen`} value={t.tag} maxLength={12} onChange={(e) => { const next = shownTeams.map((x) => ({ ...x })); next[i]!.tag = e.target.value; setTeamNames(next); }} />
          </div>
        ))}
      </section>
      <section className="stack" style={{ gap: 8 }}>
        <Cap>Names on screen · in-game name → display</Cap>
        {r && r.roster.flat().some((p) => p.name) ? (
          r.roster.flatMap((team, t) => team.map((p, i) => ({ p, t, i }))).filter(({ p }) => p.name).map(({ p, t, i }) => (
            <div key={`${t}:${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 14px 1fr', gap: 8, alignItems: 'center' }}>
              <span className="cell mono" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-2)', fontSize: 12 }}>{p.inGameName || p.name}</span>
              <span className="muted">›</span>
              <input className="cell" aria-label={`Display name for ${p.inGameName || p.name}`} placeholder={p.name} value={names[`${t}:${i}`] ?? ''} onChange={(e) => setNames({ ...names, [`${t}:${i}`]: e.target.value })} maxLength={80} />
            </div>
          ))
        ) : (
          <p className="muted" style={{ fontSize: 12.5 }}>Player names appear once the game reports its roster.</p>
        )}
      </section>
      <section className="stack" style={{ gap: 8 }}>
        <Cap>Sides</Cap>
        <div><button className="btn" aria-pressed={swap} disabled={!r?.sides[0]} style={swap ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : undefined} onClick={() => setSwap(!swap)}>Swap sides{swap ? ' · pending' : ''}</button></div>
      </section>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 'auto', paddingTop: 12 }}>
        <span style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => void run(() => air.correct({ undo: true }))}>Undo last</button>
          <button className="btn quiet" onClick={() => void run(() => air.correct({ clear: true }))}>Clear all fixes</button>
        </span>
        <button className="btn primary" disabled={!dirty} onClick={() => void apply()}>Apply · on air now</button>
      </div>
    </div>
  );
}
