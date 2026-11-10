import { useState } from 'react';
import type { ActionId, Snapshot, Team } from '../../shared/api.ts';
import { gameName } from '../../shared/games.ts';
import { LineupEditor, TalentFields, TeamFields, imageUrl, type Lineups } from '../components/MatchEditors.tsx';
import { NewMatchWizard } from '../components/NewMatch.tsx';
import { air } from '../bridge.ts';
import { Box, Cap } from '../components/ui.tsx';
import { AutopilotRules, NextFive } from '../components/Autopilot.tsx';
import { RehearsePanel } from '../components/Rehearse.tsx';
import type { PageProps } from '../App.tsx';

const when = (iso: string | null) => {
  if (!iso) return 'Time not set';
  const d = new Date(iso);
  const day = d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

/** The producer's scheduled Esportra matches, chosen with one click. */
function EsportraMatches({ s, run, openSignIn }: Pick<PageProps, 's' | 'run' | 'openSignIn'>) {
  const e = s.esportra;
  if (e.state === 'signed-out') {
    return (
      <section className="stack" style={{ gap: 8 }}>
        <Cap>Esportra tournaments</Cap>
        <button className="btn" onClick={openSignIn}>Sign in to Esportra</button>
        <p className="muted" style={{ fontSize: 12.5 }}>Your scheduled matches load with their teams, logos and best-of.</p>
      </section>
    );
  }
  const list = e.matches.filter((m) => m.status !== 'completed' && m.status !== 'cancelled').slice(0, 8);
  return (
    <section className="stack" style={{ gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Cap>Esportra tournaments</Cap>
        <button className="btn quiet small" onClick={() => void run(() => air.esportraRefresh())}>Refresh</button>
      </div>
      {list.length === 0 ? <p className="muted" style={{ fontSize: 12.5 }}>No scheduled matches right now{e.state === 'online' ? '' : ' (the list below is the last one saved)'}.</p> : (
        <div className="picker" role="group" aria-label="Esportra matches">
          {list.map((m) => {
            const active = s.match?.source?.matchId === m.id;
            return (
              <button key={m.id} aria-pressed={active} disabled={!m.supported || e.state === 'denied'} onClick={() => void run(() => air.useEsportraMatch(m.id))} title={m.supported ? undefined : 'Air only produces Valorant matches for now'}>
                <span className="vs" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span>{m.teamA} <span className="muted">vs</span> {m.teamB}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>{m.tournament} · {when(m.scheduledAt)}</span>
                </span>
                <span className="muted mono" style={{ fontSize: 11 }}>Bo{m.bestOf}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

type Tab = 'ready' | 'teams' | 'talent' | 'autopilot' | 'rehearse';

function MatchHero({ s }: { s: Snapshot }) {
  const m = s.match!;
  const side = (i: 0 | 1) => (
    <div className={`hero-team ${i ? 'r' : ''}`} style={{ ['--team' as string]: m.teams[i].color }}>
      {m.teams[i].logo ? <img src={imageUrl(s, m.teams[i].logo)} alt="" /> : <span className="hero-crest">{m.teams[i].tag}</span>}
      <div><div className="hero-name">{m.teams[i].name}</div><div className="muted" style={{ fontSize: 12 }}>{m.players[i].length ? `${m.players[i].length} players` : 'No lineup yet'}</div></div>
    </div>
  );
  return (
    <header className="hero" style={{ ['--hero-a' as string]: m.teams[0].color, ['--hero-b' as string]: m.teams[1].color }}>
      {side(0)}
      <div className="hero-mid">
        <span className="game-badge">{gameName(m.game)}</span>
        <span className="hero-vs">VS</span>
        <span className="muted" style={{ fontSize: 12 }}>{m.event.name || 'No event name'} · Bo{m.bestOf}</span>
      </div>
      {side(1)}
    </header>
  );
}

function TeamsTab({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const m = s.match!;
  const [teams, setTeams] = useState<[Team, Team]>(m.teams);
  const [lineups, setLineups] = useState<Lineups>(m.players);
  const dirty = JSON.stringify(teams) !== JSON.stringify(m.teams) || JSON.stringify(lineups) !== JSON.stringify(m.players);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="teams-vs">
        <TeamFields s={s} team={teams[0]} index={0} onChange={(t) => setTeams([t, teams[1]])} />
        <span className="vs-mark">VS</span>
        <TeamFields s={s} team={teams[1]} index={1} onChange={(t) => setTeams([teams[0], t])} />
      </div>
      <LineupEditor s={s} teams={teams} lineups={lineups} onChange={setLineups} game={m.game} />
      <div className="savebar">
        <span className="muted" style={{ fontSize: 12.5 }}>{dirty ? 'Unsaved changes.' : 'Saved. On air as soon as you save.'}</span>
        <button className="btn quiet" disabled={!dirty} onClick={() => { setTeams(m.teams); setLineups(m.players); }}>Discard</button>
        <button className="btn primary" disabled={!dirty} onClick={() => void run(() => air.updateMatch(m.id, { teams, players: lineups.map((t) => t.filter((p) => p.name.trim())) as never }))}>Save teams and players</button>
      </div>
    </div>
  );
}

function TalentTab({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const m = s.match!;
  const [casters, setCasters] = useState(m.casters);
  const [event, setEvent] = useState(m.event);
  const [sponsors, setSponsors] = useState(m.sponsors);
  const dirty = JSON.stringify([casters.filter((c) => c.name.trim()), event, sponsors]) !== JSON.stringify([m.casters, m.event, m.sponsors]);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <TalentFields casters={casters} onCasters={setCasters} event={event} onEvent={setEvent} sponsors={sponsors} onSponsors={setSponsors} />
      <div className="savebar">
        <span className="muted" style={{ fontSize: 12.5 }}>{dirty ? 'Unsaved changes.' : 'Saved.'}</span>
        <button className="btn primary" disabled={!dirty} onClick={() => void run(() => air.updateMatch(m.id, { casters: casters.filter((c) => c.name.trim()), event, sponsors }))}>Save talent and event</button>
      </div>
    </div>
  );
}

function MatchList({ s, run, newMatch }: Pick<PageProps, 's' | 'run'> & { newMatch: () => void }) {
  return (
    <section className="stack" style={{ gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Cap>On this PC</Cap>
      </div>
      {s.matches.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>No matches yet.</p>}
      <div className="match-list" role="group" aria-label="Matches">
        {s.matches.slice(0, 12).map((m) => (
          <button key={m.id} className="match-item" aria-pressed={m.id === s.match?.id} onClick={() => void run(() => air.selectMatch(m.id))}>
            <span className="mi-crests">
              {m.teams.map((t, i) => (t.logo ? <img key={i} src={imageUrl(s, t.logo)} alt="" /> : <span key={i} className="mi-crest" style={{ background: t.color }} />))}
            </span>
            <span className="mi-text"><b>{m.teams[0].name} <span className="muted">vs</span> {m.teams[1].name}</b><span className="muted">{gameName(m.game)} · Bo{m.bestOf}{m.event.name ? ` · ${m.event.name}` : ''}</span></span>
          </button>
        ))}
      </div>
      <button className="btn" onClick={newMatch}>+ New match</button>
    </section>
  );
}

export function ReadyScreen({ s, run, go, askCapture, openCasters, openSignIn, start }: PageProps & { start: () => void }) {
  const [wizard, setWizard] = useState(!s.match && s.matches.length === 0);
  const [tab, setTab] = useState<Tab>('ready');
  const informational = (id: string, health: string) => id === 'esportra' && health === 'off';
  const counted = s.checks.filter((c) => !informational(c.id, c.health));
  const ready = counted.filter((c) => c.health === 'ok').length;
  const all = ready === counted.length;
  const act = (id: ActionId) => {
    if (id === 'start-capture') return askCapture();
    if (id === 'download-art') return void run(() => air.artDownload());
    if (id === 'connect-obs') return go('settings');
    if (id === 'choose-match') return setWizard(true);
    if (id === 'add-casters') return s.match ? setTab('talent') : openCasters();
    if (id === 'open-sources') return go('outputs');
    if (id === 'sign-in') return openSignIn();
    if (id === 'install-graphics') void run(() => air.installGraphics());
  };
  return (
    <div className="ready-grid">
      <aside className="ready-side" aria-label="Matches">
        <section>
          <Cap>Matches</Cap>
          <h1 className="title-lg" style={{ marginTop: 8 }}>Matches</h1>
          <p className="lead" style={{ marginTop: 6 }}>Everything on air comes from the match: teams, players, event and graphics.</p>
          <button className="btn primary" style={{ marginTop: 14, width: '100%' }} onClick={() => setWizard(true)}>New match</button>
        </section>
        <EsportraMatches s={s} run={run} openSignIn={openSignIn} />
        <MatchList s={s} run={run} newMatch={() => setWizard(true)} />
      </aside>

      <div className="ready-main">
        {!s.match ? (
          <div className="empty">
            <h2 className="title-md">No match selected</h2>
            <p className="muted">Create a match, or pick one from your Esportra schedule.</p>
            <button className="btn primary" onClick={() => setWizard(true)}>New match</button>
          </div>
        ) : (
          <>
            <MatchHero s={s} />
            <div className="tabs" role="tablist" aria-label="Match">
              {([['ready', 'Readiness'], ['teams', 'Teams and players'], ['talent', 'Talent and event'], ['autopilot', 'Autopilot'], ['rehearse', 'Rehearse']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
              <button role="tab" aria-selected={false} onClick={() => go('setup')}>Graphics</button>
            </div>
            {tab === 'teams' && <TeamsTab key={s.match.id} s={s} run={run} />}
            {tab === 'talent' && <TalentTab key={s.match.id} s={s} run={run} />}
            {tab === 'autopilot' && <AutopilotRules s={s} run={run} rehearse={() => setTab('rehearse')} />}
            {tab === 'rehearse' && <RehearsePanel s={s} run={run} />}
            {tab === 'ready' && (
              <>
                <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <h2 className="title-md">{all ? 'Ready when you are' : 'Almost ready'}</h2>
                  <span className={`tag-count ${all ? 'ok' : ''}`}>{ready} of {counted.length} ready</span>
                </div>
                <section className="checklist" aria-label="Readiness checks">
                  {s.checks.map((c) => (
                    <div className="checkrow" key={c.id}>
                      <Box health={c.health} />
                      <span><strong>{c.title}</strong><span className="d">{c.detail}</span></span>
                      {c.action ? <button className="btn fix" onClick={() => act(c.action!.id)}>{c.action.label}</button> : <span />}
                    </div>
                  ))}
                </section>
                <NextFive s={s} />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn primary big" disabled={!!s.autopilotBlock} onClick={() => void run(() => air.autopilotStart()).then((ok) => ok && start())}>Start autopilot</button>
                  <button className="btn big" onClick={() => void run(() => air.autopilotStop()).then(start)}>Run manually</button>
                  <span className="muted" style={{ fontSize: 12.5, maxWidth: 420 }}>{s.autopilotBlock ?? 'Autopilot puts full-screen graphics up for you after a hold window you can stop with H. Off unless you start it.'}</span>
                </div>
              </>
            )}
          </>
        )}
      </div>
      {wizard && <NewMatchWizard s={s} run={run} close={() => { setWizard(false); setTab('ready'); }} />}
    </div>
  );
}
