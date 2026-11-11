// Matches (approved mock): every match grouped by when, with how prepared it is; Esportra's schedule
// and quick matches in one list. Opening a match shows its workspace.
import { useEffect, useState } from 'react';
import type { ActionId, Match } from '../../shared/api.ts';
import type { EsportraMatch } from '../../shared/esportra.ts';
import { groupByWhen, prepState } from '../../shared/schedule.ts';
import { StageLight } from '../components/FirstRun.tsx';
import { NewMatchWizard } from '../components/NewMatch.tsx';
import { air } from '../bridge.ts';
import type { MatchCommand, PageProps } from '../App.tsx';
import { MatchWorkspace, TeamMark, type Tab } from './MatchWorkspace.tsx';

type Row = { key: string; at: string | null; createdAt: number; local: Match | null; remote: EsportraMatch | null };

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—');
const dayClock = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + clock(iso) : '—');

export function ReadyScreen({ s, run, go, askCapture, openSignIn, start, command, open, setOpen }: PageProps & { start: () => void; command?: MatchCommand; open: boolean; setOpen: (open: boolean) => void }) {
  const [wizard, setWizard] = useState(false);
  const [tab, setTab] = useState<Tab>('ready');
  // Commands from the palette (Ctrl+K): open the wizard or a tab of the match.
  useEffect(() => {
    if (!command) return;
    if (command.name === 'new-match') setWizard(true);
    else if (s.match) {
      setTab(command.name);
      setOpen(true);
    }
  }, [command]);
  useEffect(() => { if (!s.match) setOpen(false); }, [s.match?.id]);

  const act = (id: ActionId) => {
    if (id === 'start-capture') return askCapture();
    if (id === 'download-art') return void run(() => air.artDownload());
    if (id === 'connect-obs') return go('settings');
    if (id === 'choose-match') return setOpen(false);
    if (id === 'add-casters') return setTab('talent');
    if (id === 'open-sources') return go('outputs');
    if (id === 'sign-in') return openSignIn();
    if (id === 'install-graphics') void run(() => air.installGraphics());
  };
  const openLocal = async (m: Match) => { if (await run(() => air.selectMatch(m.id))) { setTab('ready'); setOpen(true); } };
  const openRemote = async (e: EsportraMatch) => { if (await run(() => air.useEsportraMatch(e.id))) { setTab('ready'); setOpen(true); } };

  // The wizard stays mounted in one place while the page behind it changes (empty → list → match).
  const wizardEl = wizard && <NewMatchWizard s={s} run={run} close={() => { setWizard(false); if (s.match) { setTab('ready'); setOpen(true); } }} />;
  return <>{open && s.match ? <MatchWorkspace s={s} run={run} go={go} tab={tab} setTab={setTab} act={act} start={start} back={() => setOpen(false)} /> : <MatchList s={s} run={run} go={go} openSignIn={openSignIn} newMatch={() => setWizard(true)} openLocal={openLocal} openRemote={openRemote} />}{wizardEl}</>;
}

function MatchList({ s, run, go, openSignIn, newMatch, openLocal, openRemote }: Pick<PageProps, 's' | 'run' | 'go' | 'openSignIn'> & { newMatch: () => void; openLocal: (m: Match) => void; openRemote: (e: EsportraMatch) => void }) {

  const known = new Set(s.matches.map((m) => m.source?.matchId).filter(Boolean));
  const remote = s.esportra.matches.filter((e) => e.supported && !known.has(e.id) && e.status !== 'completed' && e.status !== 'cancelled');
  const rows: Row[] = [
    ...s.matches.map((m) => ({ key: m.id, at: m.source?.scheduledAt ?? null, createdAt: m.createdAt, local: m, remote: null })),
    ...remote.map((e) => ({ key: `e:${e.id}`, at: e.scheduledAt, createdAt: 0, local: null, remote: e })),
  ];
  const groups = groupByWhen(rows, Date.now());
  const eventOf = (m: Match) => s.events.find((e) => e.id === m.eventId) ?? null;

  if (rows.length === 0) {
    return (
      <>
        <div className="empty first-show">
          <StageLight />
          <div className="first-show-body">
            <h2 className="title-lg">Set up your first show</h2>
            <p className="muted">Start with your event: its logo, people on air and sponsors are used by every match. Then add the match.</p>
            <div className="fr-actions" style={{ justifyContent: 'center' }}>
              <button className="btn primary big" onClick={() => go('event')}>Set up the event</button>
              <button className="btn big" onClick={newMatch}>New match</button>
            </div>
            {s.esportra.state === 'signed-out' && <button className="btn quiet" onClick={openSignIn}>Sign in to load your Esportra matches</button>}
          </div>
        </div>
      </>
    );
  }
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="between">
        <div><h1 className="title-lg">Matches</h1><p className="muted">{s.events.length === 1 ? s.events[0]!.name : `${s.events.length} events`}</p></div>
        <div className="row-gap">
          {s.esportra.state === 'signed-out'
            ? <button className="btn quiet" onClick={openSignIn}>Sign in to load your Esportra matches</button>
            : <button className="btn quiet" onClick={() => void run(() => air.esportraRefresh())}>Refresh from Esportra</button>}
          <button className="btn primary" onClick={newMatch}>New match</button>
        </div>
      </div>
      {groups.map(({ group, rows: list }) => (
        <section key={group} className="stack" style={{ gap: 8 }}>
          <h2 className="title-sm">{group}</h2>
          <div className="lst">
            {list.map((r) => {
              const teams = r.local ? r.local.teams : null;
              const state = r.local ? prepState(r.local, eventOf(r.local)) : null;
              const selected = r.local && r.local.id === s.match?.id;
              return (
                <button key={r.key} className="li mrow" aria-current={selected ? 'true' : undefined} onClick={() => void (r.local ? openLocal(r.local) : openRemote(r.remote!))}>
                  <span className="mono t-sm">{group === 'Today' ? clock(r.at) : dayClock(r.at)}</span>
                  <span className="mrow-teams">
                    {teams ? <><TeamMark s={s} team={teams[0]} size={26} /><b>{teams[0].name}</b><span className="faint">vs</span><b>{teams[1].name}</b><TeamMark s={s} team={teams[1]} size={26} /></>
                      : <><b>{r.remote!.teamA}</b><span className="faint">vs</span><b>{r.remote!.teamB}</b></>}
                  </span>
                  <span className="muted t-sm">Best of {r.local?.bestOf ?? r.remote!.bestOf}{r.local ? (eventOf(r.local) ? ` · ${eventOf(r.local)!.name}` : '') : ` · ${r.remote!.tournament}`}</span>
                  {state ? <span className={`state ${state.health}`}><i className={`dot ${state.health}`} />{selected ? 'Selected · ' : ''}{state.label}</span> : <span className="state"><i className="dot off" />From Esportra</span>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
