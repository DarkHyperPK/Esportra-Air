// New match wizard: the prerequisites of a show, in order. Graphics and rehearsal follow in later steps.
import { useEffect, useState } from 'react';
import type { BannerTheme, Caster, Snapshot, Team } from '../../shared/api.ts';
import { BannerStyles } from '../screens/LibraryScreen.tsx';
import { GAMES, type GameId } from '../../shared/games.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { GamePicker, LineupEditor, TalentFields, TeamFields, emptyPlayer, type Lineups } from './MatchEditors.tsx';

const STEPS = ['Game', 'Teams', 'Players', 'Talent and event', 'Graphics'] as const;

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
  const [casters, setCasters] = useState<Caster[]>([]);
  const [event, setEvent] = useState({ name: last?.event.name ?? '', stage: last?.event.stage ?? '' });
  const [sponsors, setSponsors] = useState<string[]>(last?.sponsors ?? []);
  const [theme, setTheme] = useState<BannerTheme>(last?.theme ?? 'broadcast');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (step === 4) void air.librarySeed().catch(() => {}); }, [step]);

  const teamsOk = teams.every((t) => t.name.trim()) && teams[0].name.trim().toLowerCase() !== teams[1].name.trim().toLowerCase();
  const canNext = step === 0 ? !!GAMES.find((g) => g.id === game)?.available : step === 1 ? teamsOk : true;
  const finish = async () => {
    setBusy(true);
    const players = lineups.map((team) => team.filter((p) => p.name.trim())) as Lineups;
    const ok = await run(() => air.createMatch({ game, bestOf, teams, players, casters: casters.filter((c) => c.name.trim()), event, sponsors, theme }));
    setBusy(false);
    if (ok) close();
  };

  return (
    <div className="scrim center wizard-scrim">
      <div className="wizard" role="dialog" aria-modal="true" aria-label="New match">
        <header className="wizard-head">
          <div><span className="cap">New match</span><h2 className="title-md" style={{ marginTop: 4 }}>{STEPS[step]}</h2></div>
          <ol className="stepper">
            {STEPS.map((label, i) => <li key={label} className={i === step ? 'now' : i < step ? 'done' : ''}><button type="button" disabled={i > step} onClick={() => setStep(i)}><span>{i + 1}</span>{label}</button></li>)}
          </ol>
          <button className="btn quiet small" onClick={close} aria-label="Close">Esc · Close</button>
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
          {step === 3 && (
            <div className="stack" style={{ gap: 14 }}>
              <p className="lead">Casters for the lower thirds, and the event shown on the event bug. {last ? 'Event and sponsors start from your last match.' : ''}</p>
              <TalentFields casters={casters} onCasters={setCasters} event={event} onEvent={setEvent} sponsors={sponsors} onSponsors={setSponsors} />
            </div>
          )}
        </div>
        <footer className="wizard-foot">
          <button className="btn quiet" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button>
          <span className="muted" style={{ fontSize: 12.5 }}>Step {step + 1} of {STEPS.length}</span>
          {step < STEPS.length - 1
            ? <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>
            : <button className="btn primary" disabled={busy || !teamsOk} onClick={() => void finish()}>{busy ? 'Creating…' : 'Create match'}</button>}
        </footer>
      </div>
    </div>
  );
}
