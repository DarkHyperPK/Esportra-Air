// New match wizard: the prerequisites of a show, in order, ending with a private rehearsal.
import { useEffect, useState } from 'react';
import type { BannerTheme, Snapshot, Team } from '../../shared/api.ts';
import { BannerStyles } from '../screens/LibraryScreen.tsx';
import { GAMES, type GameId } from '../../shared/games.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { EventPeople, GamePicker, LineupEditor, TeamFields, emptyPlayer, type Lineups } from './MatchEditors.tsx';
import { RehearsePanel } from './Rehearse.tsx';

const STEPS = ['Game', 'Teams', 'Players', 'Talent and event', 'Graphics', 'Rehearse'] as const;
const REHEARSE = 5;

export function NewMatchWizard({ s, run, close }: { s: Snapshot; run: Run; close: () => void }) {
  const last = s.matches[0];
  const [step, setStep] = useState(0);
  const [game, setGame] = useState<GameId>('valorant');
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(3);
  const [teams, setTeams] = useState<[Team, Team]>([
    { name: '', tag: '', color: '#22d3ee', logo: '' },
    { name: '', tag: '', color: '#f43f5e', logo: '' },
  ]);
  const [lineups, setLineups] = useState<Lineups>([Array.from({ length: 5 }, emptyPlayer), Array.from({ length: 5 }, emptyPlayer)]);
  // The new match joins the selected match's event (or the first one); talent and sponsors come from it.
  const event = s.event ?? s.events[0] ?? null;
  const [stage, setStage] = useState(last?.stage ?? '');
  const [theme, setTheme] = useState<BannerTheme>(last?.theme ?? 'broadcast');
  const [busy, setBusy] = useState(false);
  // Once created, the match is edited on its own page; the wizard only rehearses it.
  const [created, setCreated] = useState(false);
  useEffect(() => { if (step === 4) void air.librarySeed().catch(() => {}); }, [step]);

  const teamsOk = teams.every((t) => t.name.trim()) && teams[0].name.trim().toLowerCase() !== teams[1].name.trim().toLowerCase();
  const canNext = step === 0 ? !!GAMES.find((g) => g.id === game)?.available : step === 1 ? teamsOk : true;
  const finish = async () => {
    setBusy(true);
    const players = lineups.map((team) => team.filter((p) => p.name.trim())) as Lineups;
    const ok = await run(() => air.createMatch({ game, bestOf, teams, players, ...(event ? { eventId: event.id } : {}), stage, theme }));
    setBusy(false);
    if (ok) {
      setCreated(true);
      setStep(REHEARSE);
    }
  };
  const done = () => {
    if (s.rehearsal.running) void air.rehearsalStop().catch(() => {});
    close();
  };

  return (
    <div className="scrim center wizard-scrim">
      <div className="wizard" role="dialog" aria-modal="true" aria-label="New match">
        <header className="wizard-head">
          <div><span className="cap">New match</span><h2 className="title-md" style={{ marginTop: 4 }}>{STEPS[step]}</h2></div>
          <ol className="stepper">
            {STEPS.map((label, i) => <li key={label} className={i === step ? 'now' : i < step ? 'done' : ''}><button type="button" disabled={i > step || (created && i < REHEARSE)} onClick={() => setStep(i)}><span>{i + 1}</span>{label}</button></li>)}
          </ol>
          <button className="btn quiet small" onClick={done} aria-label="Close">Esc · Close</button>
        </header>
        <div className="wizard-body">
          {step === 0 && (
            <div className="stack" style={{ gap: 18 }}>
              <p className="lead">Which game is this match? Air reads that game’s live data and uses its HUD.</p>
              <GamePicker value={game} onChange={setGame} />
              <div className="row-item" style={{ padding: 0, border: 0, justifyContent: 'flex-start', gap: 14 }}>
                <span className="cap">Format</span>
                <div className="seg" role="group" aria-label="Format">
                  {([1, 3, 5] as const).map((n) => <button type="button" key={n} aria-pressed={bestOf === n} onClick={() => setBestOf(n)}>Best of {n}</button>)}
                </div>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="stack" style={{ gap: 14 }}>
              <p className="lead">Names, tags, colours and logos appear on every graphic.</p>
              <div className="teams-vs">
                <TeamFields s={s} team={teams[0]} index={0} onChange={(t) => setTeams([t, teams[1]])} />
                <span className="vs-mark">VS</span>
                <TeamFields s={s} team={teams[1]} index={1} onChange={(t) => setTeams([teams[0], t])} />
              </div>
              {!teamsOk && teams[0].name && teams[1].name && <p style={{ color: 'var(--bad)', fontSize: 12.5 }}>The two teams need different names.</p>}
            </div>
          )}
          {step === 2 && (
            <div className="stack" style={{ gap: 14 }}>
              <p className="lead">Who plays. Empty rows are left out; you can finish the lineups later.</p>
              <LineupEditor s={s} teams={teams} lineups={lineups} onChange={setLineups} game={game} />
            </div>
          )}
          {step === 4 && (
            <div className="stack" style={{ gap: 14 }}>
              <p className="lead">Pick the banner style for this match. Each preview shows the same moment; the Library shows every other graphic live.</p>
              <BannerStyles s={s} value={theme} onPick={setTheme} />
              <p className="muted" style={{ fontSize: 12.5 }}>Previews use sample data until the match exists.</p>
            </div>
          )}
          {step === REHEARSE && (
            <div className="stack" style={{ gap: 14 }}>
              <p className="lead">Watch {s.match?.title ?? 'the match'} run through your graphics: your teams, players and photos on sample game data, with autopilot firing as it would on the night.</p>
              <RehearsePanel s={s} run={run} compact />
            </div>
          )}
          {step === 3 && (
            <div className="stack" style={{ gap: 14 }}>
              <p className="lead">{event ? `This match is part of ${event.name}. Its people on air and sponsors are used; switch any off for this match after it is created.` : 'Name the event this match belongs to. Its people on air and sponsors are shared by its matches.'}</p>
              {event && <label className="field" style={{ maxWidth: 360 }}><span>Stage (lower thirds)</span><input value={stage} onChange={(e) => setStage(e.target.value)} maxLength={40} placeholder="e.g. Playoffs" /></label>}
              <EventPeople s={s} run={run} event={event} />
            </div>
          )}
        </div>
        <footer className="wizard-foot">
          <button className="btn quiet" disabled={step === 0 || created} onClick={() => setStep(step - 1)}>Back</button>
          <span className="muted" style={{ fontSize: 12.5 }}>Step {step + 1} of {STEPS.length}</span>
          {step === REHEARSE
            ? <button className="btn primary" onClick={done}>Finish · Readiness</button>
            : step === REHEARSE - 1
              ? <button className="btn primary" disabled={busy || !teamsOk} onClick={() => void finish()}>{busy ? 'Creating…' : 'Create match and rehearse'}</button>
              : <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>}
        </footer>
      </div>
    </div>
  );
}
