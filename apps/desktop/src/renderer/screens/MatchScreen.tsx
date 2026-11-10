import { useEffect, useState } from 'react';
import type { Caster } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import type { ScreenProps } from '../App.tsx';

function QuickMatchForm({ run, onDone }: Pick<ScreenProps, 'run'> & { onDone?: () => void }) {
  const [teamA, setA] = useState('');
  const [teamB, setB] = useState('');
  const [bestOf, setBo] = useState<1 | 3 | 5>(3);
  return (
    <form
      className="card pad stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => air.createQuickMatch({ teamA, teamB, bestOf }))) onDone?.();
      }}
    >
      <div>
        <p className="eyebrow">Quick match</p>
        <h2 style={{ fontSize: 22, marginTop: 6 }}>Two teams and a format</h2>
        <p className="sub">For scrims and showmatches. Player names come from the game once it starts.</p>
      </div>
      <div className="field-row">
        <label className="field">Team A<input value={teamA} onChange={(e) => setA(e.target.value)} placeholder="Team name" maxLength={40} required /></label>
        <label className="field">Team B<input value={teamB} onChange={(e) => setB(e.target.value)} placeholder="Team name" maxLength={40} required /></label>
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          Format
          <div className="segmented" role="group" aria-label="Format">
            {([1, 3, 5] as const).map((n) => (
              <button type="button" key={n} aria-pressed={bestOf === n} onClick={() => setBo(n)}>Bo{n}</button>
            ))}
          </div>
        </div>
        <button className="btn primary" style={{ marginLeft: 'auto' }} type="submit">Create match</button>
      </div>
    </form>
  );
}

function Casters({ s, run }: Pick<ScreenProps, 's' | 'run'>) {
  const match = s.match!;
  const [casters, setCasters] = useState<Caster[]>(match.casters);
  const [editing, setEditing] = useState(false);
  useEffect(() => setCasters(match.casters), [match.id, match.casters]);
  if (!editing) {
    return (
      <div className="row">
        <span className="muted">Casters</span>
        {match.casters.length ? match.casters.map((c) => <span key={c.name} className="pill">{c.name}</span>) : <span className="muted">None yet (needed for the caster strap)</span>}
        <button className="btn quiet small" onClick={() => setEditing(true)}>{match.casters.length ? 'Edit' : 'Add casters'}</button>
      </div>
    );
  }
  const slots = [casters[0] ?? { name: '', handle: '' }, casters[1] ?? { name: '', handle: '' }];
  const set = (i: number, key: keyof Caster, value: string) => setCasters(slots.map((c, j) => (j === i ? { ...c, [key]: value } : c)));
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const filled = slots.filter((c) => c.name.trim());
        if (await run(() => air.updateMatch(match.id, { casters: filled }))) setEditing(false);
      }}
    >
      {slots.map((c, i) => (
        <div className="field-row" key={i}>
          <label className="field">{i ? 'Analyst' : 'Play-by-play'}<input value={c.name} onChange={(e) => set(i, 'name', e.target.value)} maxLength={40} /></label>
          <label className="field">Handle (optional)<input value={c.handle} onChange={(e) => set(i, 'handle', e.target.value)} maxLength={40} placeholder="@handle" /></label>
        </div>
      ))}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn quiet" onClick={() => setEditing(false)}>Cancel</button>
        <button type="submit" className="btn primary">Save casters</button>
      </div>
    </form>
  );
}

export function MatchScreen({ s, run, go }: ScreenProps) {
  const [quick, setQuick] = useState(false);
  const match = s.match;
  const found = s.readout?.playersFound ?? [0, 0];
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Step 1 of 3</p>
          <h1>Which match are you producing?</h1>
        </div>
      </div>
      <div className="split">
        <section className="side stack" aria-label="Matches">
          {s.matches.length > 0 && <p className="eyebrow">Recent matches</p>}
          {s.matches.slice(0, 8).map((m) => (
            <button key={m.id} className="match-item" aria-pressed={m.id === match?.id} onClick={() => { setQuick(false); void run(() => air.selectMatch(m.id)); }}>
              <span className="line"><span>Quick match</span><span>Bo{m.bestOf}</span></span>
              <strong>{m.title}</strong>
            </button>
          ))}
          <button className="btn" onClick={() => setQuick(true)}>+ Quick match</button>
          <p className="muted" style={{ fontSize: 13 }}>Esportra tournament matches appear here once you sign in (coming next).</p>
        </section>

        <section className="main stack">
          {(quick || !match) && <QuickMatchForm run={run} onDone={() => setQuick(false)} />}
          {match && !quick && (
            <>
              <div className="card pad stack" style={{ gap: 22 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p className="eyebrow">Quick match · Best of {match.bestOf}</p>
                    <h1 style={{ fontSize: 28, marginTop: 8 }}>{match.title}</h1>
                  </div>
                  <span className="pill ok">Selected</span>
                </div>
                <div className="grid-auto-wide">
                  {match.teams.map((team, t) => (
                    <div className="stack" key={t} style={{ gap: 10 }}>
                      <div className="team-head">
                        <span className="team-logo" style={{ background: team.color }}>{team.tag}</span>
                        <span>
                          <strong style={{ fontSize: 17, display: 'block' }}>{team.name}</strong>
                          <span className="muted" style={{ fontSize: 13 }}>{found[t] ? `${found[t]} players found in the game` : 'Players appear when the game starts'}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                  <Casters s={s} run={run} />
                </div>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn primary big" onClick={() => go('check')}>Continue to Check →</button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
