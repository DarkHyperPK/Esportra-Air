import { useEffect, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { Cap } from './ui.tsx';

/** Fix data (PRD picture 13): changes go on air on Apply; the feed won't overwrite a fixed field until the next round. */
export function FixData({ s, run, close }: { s: Snapshot; run: Run; close?: () => void }) {
  const match = s.match;
  const r = s.readout;
  const [score, setScore] = useState<[number, number]>([r?.score[0] ?? 0, r?.score[1] ?? 0]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [swap, setSwap] = useState(false);
  useEffect(() => setScore([r?.score[0] ?? 0, r?.score[1] ?? 0]), [match?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!match) return <p className="muted">Choose a match first.</p>;
  const scoreChanged = r !== null && (score[0] !== (r.score[0] ?? 0) || score[1] !== (r.score[1] ?? 0));
  const dirty = scoreChanged || swap || Object.keys(names).length > 0;
  const step = (i: 0 | 1, d: number) => setScore((v) => (i === 0 ? [Math.max(0, v[0] + d), v[1]] : [v[0], Math.max(0, v[1] + d)]));

  const apply = async () => {
    const calls: Array<() => Promise<Snapshot | void>> = [];
    if (scoreChanged) calls.push(() => air.correct({ field: 'scores', value: score, reason: 'Operator score fix' }));
    for (const [key, name] of Object.entries(names)) {
      const [team, index] = key.split(':').map(Number) as [number, number];
      if (name.trim()) calls.push(() => air.correct({ field: 'player_name', value: [team, { index, name: name.trim() }], reason: 'Operator name fix' }));
    }
    if (swap && r?.sides[0] && r.sides[1]) calls.push(() => air.correct({ field: 'sides', value: [r.sides[1], r.sides[0]], reason: 'Operator side swap' }));
    for (const call of calls) if (!(await run(call))) return;
    setNames({});
    setSwap(false);
    close?.();
  };

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <Cap>Fix data · live</Cap>
        <h2 className="title-md" style={{ marginTop: 8 }}>Correct what’s on screen</h2>
        <p className="muted" style={{ marginTop: 6 }}>Changes go on air as soon as you apply them. The feed won’t overwrite a field you fixed until the next round.</p>
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
        <Cap>Names on screen · Riot ID → display</Cap>
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
