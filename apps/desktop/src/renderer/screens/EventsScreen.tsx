// Events (approved mock, 12 Nov): the top of the tree. An event holds its matches, its branding, and the
// people and sponsors on air. Opening a match goes to its steps. Esportra tournaments that have no event
// on this PC yet are listed too; opening one of their matches makes the event.
import { useRef, useState } from 'react';
import type { Match } from '../../shared/api.ts';
import type { EsportraMatch } from '../../shared/esportra.ts';
import type { EventInfo } from '../../shared/model.ts';
import { prepState } from '../../shared/schedule.ts';
import { air } from '../bridge.ts';
import type { PageProps } from '../App.tsx';
import { StageLight } from '../components/FirstRun.tsx';
import { EventBranding, EventLogo, EventTalent } from './EventScreen.tsx';
import { EventFileMenu, OpenEventFile } from '../components/EventFileUi.tsx';
import { AccessRequest } from '../components/AccessRequest.tsx';
import { TeamMark } from './MatchWorkspace.tsx';
import { LobbyList, LobbyScreen } from './LobbyScreen.tsx';
import { gameOf } from '../../shared/games.ts';

export type EventTab = 'matches' | 'branding' | 'talent';
/** Which event is open: a local event id, `esp:<tournament id>` for an Esportra tournament, or none. */
export interface EventView { id: string | null; tab: EventTab }

const when = (iso: string | null, createdAt = 0) => {
  const d = iso ? new Date(iso) : createdAt ? new Date(createdAt) : null;
  if (!d) return '—';
  const today = new Date().toDateString() === d.toDateString();
  return today ? `Today ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

/** A delete button that asks once: "Delete? Yes / No". */
function DeleteButton({ label, ask, onDelete }: { label: string; ask: string; onDelete: () => void }) {
  const [sure, setSure] = useState(false);
  if (!sure) return <button className="btn quiet small danger" onClick={() => setSure(true)}>{label}</button>;
  return (
    <span className="row-gap confirm" role="group" aria-label={ask}>
      <span className="t-sm">{ask}</span>
      <button className="btn small danger-solid" onClick={() => { setSure(false); onDelete(); }}>Delete</button>
      <button className="btn quiet small" onClick={() => setSure(false)}>Keep</button>
    </span>
  );
}

export function EventsScreen({ s, run, openSignIn, view, setView, openMatch, openRemote, newMatch }: Pick<PageProps, 's' | 'run' | 'openSignIn'> & {
  view: EventView; setView: (v: EventView) => void; openMatch: (m: Match) => void; openRemote: (e: EsportraMatch) => void; newMatch: (eventId: string) => void;
}) {
  const known = new Set(s.matches.map((m) => m.source?.matchId).filter(Boolean));
  const remote = s.esportra.matches.filter((e) => e.supported && !known.has(e.id) && e.status !== 'completed' && e.status !== 'cancelled');
  const tournaments = [...new Map(remote.filter((e) => !s.events.some((ev) => ev.tournamentId === e.tournamentId)).map((e) => [e.tournamentId, e.tournament])).entries()];

  if (view.id?.startsWith('esp:')) {
    const tid = view.id.slice(4);
    const name = tournaments.find(([id]) => id === tid)?.[1] ?? 'Esportra tournament';
    return <EsportraTournament s={s} name={name} matches={remote.filter((e) => e.tournamentId === tid)} back={() => setView({ id: null, tab: 'matches' })} openRemote={openRemote} />;
  }
  const event = view.id ? s.events.find((e) => e.id === view.id) ?? null : null;
  if (event) {
    return <EventDetail s={s} run={run} event={event} tab={view.tab} setTab={(tab) => setView({ id: event.id, tab })} back={() => setView({ id: null, tab: 'matches' })}
      remote={remote.filter((e) => event.tournamentId && e.tournamentId === event.tournamentId)} openMatch={openMatch} openRemote={openRemote} newMatch={() => newMatch(event.id)} />;
  }
  return <EventList s={s} run={run} openSignIn={openSignIn} tournaments={tournaments} remoteCount={(tid) => remote.filter((e) => e.tournamentId === tid).length} open={(id) => setView({ id, tab: 'matches' })} />;
}

function EventList({ s, run, openSignIn, tournaments, remoteCount, open }: Pick<PageProps, 's' | 'run' | 'openSignIn'> & { tournaments: Array<[string, string]>; remoteCount: (tid: string) => number; open: (id: string) => void }) {
  const [name, setName] = useState('');
  const [hint, setHint] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  // Always clickable: with no name yet it points at the name box (a greyed-out button read as "can't create").
  const create = async () => {
    if (!name.trim()) { setHint(true); box.current?.focus(); return; }
    if (await run(() => air.createEvent(name))) { setName(''); setHint(false); }
  };
  const form = (
    <form className="ev-new" onSubmit={(e) => { e.preventDefault(); void create(); }}>
      <span className="row-gap">
        <input ref={box} className="cell" aria-label="New event name" value={name} onChange={(e) => { setName(e.target.value); setHint(false); }} placeholder="Event name, e.g. Community Cup" maxLength={60} style={{ width: 280 }} />
        <button className="btn primary">New event</button>
      </span>
      {hint && <span className="t-xs" role="status" style={{ color: 'var(--amber)' }}>Name the event first, then press New event.</span>}
    </form>
  );
  if (!s.events.length && !tournaments.length) {
    return (
      <div className="empty first-show">
        <StageLight />
        <div className="first-show-body">
          <h2 className="title-lg">Set up your first event</h2>
          <p className="muted">An event holds its matches, its logo, and the people and sponsors on air. Start with its name.</p>
          <div className="fr-actions" style={{ justifyContent: 'center' }}>{form}</div>
          <OpenEventFile run={run} />
          {s.esportra.state === 'signed-out' && <button className="btn quiet" onClick={openSignIn}>Sign in to load your Esportra tournaments</button>}
          {s.esportra.state === 'denied' && <div style={{ textAlign: 'left', maxWidth: 520, margin: '0 auto' }}><AccessRequest e={s.esportra} run={run} /></div>}
        </div>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="between">
        <div><h1 className="title-lg">Events</h1><p className="muted">Each event holds its matches, its branding, and the people and sponsors on air.</p></div>
        <span className="row-gap">{form}<OpenEventFile run={run} /></span>
      </div>
      <div className="ev-cards">
        {s.events.map((e) => {
          const matches = s.matches.filter((m) => m.eventId === e.id);
          // The next match to play leads; the last one played follows, dimmed.
          const upcoming = matches.filter((m) => !m.finishedAt).sort((a, b) => (a.source?.scheduledAt ?? '').localeCompare(b.source?.scheduledAt ?? '') || b.createdAt - a.createdAt)[0];
          const played = matches.filter((m) => m.finishedAt).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0];
          const people = [e.talent.slice(0, 2).map((t) => t.name).join(', '), e.sponsors.length ? `${e.sponsors.length} sponsor${e.sponsors.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
          return (
            <button key={e.id} className="card ev-card" onClick={() => open(e.id)} aria-current={s.event?.id === e.id ? 'true' : undefined} aria-label={`Open ${e.name}`}>
              <span className="ev-card-top">
                <EventLogo s={s} path={e.logo} size={44} name={e.name} accent={e.accent} />
                <span className="ev-name"><b>{e.name}</b><span className="faint t-xs">{e.tournamentId ? 'From Esportra' : 'On this PC'} · {matches.length} match{matches.length === 1 ? '' : 'es'}</span></span>
              </span>
              {e.stages.length > 0 && <span className="chips-row">{e.stages.map((st) => <span key={st} className={`pill ${upcoming?.stage === st ? 'ok' : ''}`}>{st}</span>)}</span>}
              {upcoming && <MatchLine s={s} m={upcoming} label={upcoming.source?.scheduledAt ? when(upcoming.source.scheduledAt) : 'Next'} />}
              {played && <MatchLine s={s} m={played} label="Played" done />}
              {!upcoming && !played && <span className="faint t-sm">No matches yet. Open the event and press New match.</span>}
              <span className="ev-card-foot"><span className="faint t-xs">{people || 'No talent or sponsors yet'}</span><span className="btn small">Open event</span></span>
            </button>
          );
        })}
        {tournaments.map(([tid, name]) => (
          <button key={tid} className="card ev-card" onClick={() => open(`esp:${tid}`)} aria-label={`Open ${name}`}>
            <span className="ev-card-top">
              <EventLogo s={s} path="" size={44} name={name} accent="#f43f5e" />
              <span className="ev-name"><b>{name}</b><span className="faint t-xs">From Esportra · {remoteCount(tid)} match{remoteCount(tid) === 1 ? '' : 'es'}</span></span>
            </span>
            <span className="chips-row"><span className="pill">Esportra tournament</span></span>
            <span className="ev-card-foot"><span className="faint t-xs">Teams and best-of come from Esportra</span><span className="btn small">Open event</span></span>
          </button>
        ))}
        <button type="button" className="ev-add" onClick={() => { box.current?.focus(); setHint(!name.trim()); }}><b style={{ color: 'var(--text)' }}>+ New event</b><span className="t-sm">Your own event, with or without Esportra. Its logo, colour, talent and sponsors are set once; every match in it uses them.</span></button>
      </div>
      {s.esportra.state === 'signed-out'
        ? <button className="btn quiet" style={{ alignSelf: 'flex-start' }} onClick={openSignIn}>Sign in to load your Esportra tournaments</button>
        : s.esportra.state === 'denied'
          ? <AccessRequest e={s.esportra} run={run} />
          : <button className="btn quiet small" style={{ alignSelf: 'flex-start' }} onClick={() => void run(() => air.esportraRefresh())}>Refresh from Esportra</button>}
    </div>
  );
}

/** One match on an event card: when, both teams with their marks, best-of (or the final series when played). */
function MatchLine({ s, m, label, done }: { s: PageProps['s']; m: Match; label: string; done?: boolean }) {
  return (
    <span className={`ev-next ${done ? 'done' : ''}`}>
      <span className="cap" style={{ letterSpacing: '0.08em' }}>{label}</span>
      <span className="ev-next-teams"><TeamMark s={s} team={m.teams[0]} size={22} />{m.teams[0].name}<span className="faint t-xs">vs</span>{m.teams[1].name}<TeamMark s={s} team={m.teams[1]} size={22} /></span>
      <span className="faint t-xs mono">{done ? 'Finished' : `Bo${m.bestOf}`}</span>
    </span>
  );
}

function EventDetail({ s, run, event, tab, setTab, back, remote, openMatch, openRemote, newMatch }: Pick<PageProps, 's' | 'run'> & {
  event: EventInfo; tab: EventTab; setTab: (t: EventTab) => void; back: () => void; remote: EsportraMatch[]; openMatch: (m: Match) => void; openRemote: (e: EsportraMatch) => void; newMatch: () => void;
}) {
  // Battle royale games (21 Nov): the event holds lobbies, not matches.
  const lobbyGame = gameOf(s.setup.game)?.shape === 'lobby';
  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const lobby = lobbyId ? s.lobbies.find((l) => l.id === lobbyId) ?? null : null;
  if (lobbyGame && lobby) return <LobbyScreen s={s} run={run} lobby={lobby} back={() => setLobbyId(null)} />;
  // Finished matches go last; the rest by schedule, then newest first.
  const matches = s.matches.filter((m) => m.eventId === event.id).sort((a, b) => Number(!!a.finishedAt) - Number(!!b.finishedAt) || (a.source?.scheduledAt ?? '').localeCompare(b.source?.scheduledAt ?? '') || b.createdAt - a.createdAt);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <nav className="crumb-back"><button className="btn quiet small" onClick={back}>← Events</button></nav>
      <header className="between ev-head" style={{ ['--accent' as string]: event.accent }}>
        <div className="row-gap" style={{ gap: 16 }}>
          <EventLogo s={s} path={event.logo} size={52} name={event.name} accent={event.accent} />
          <div><h1 className="title-lg">{event.name}</h1><p className="muted">{event.stages.length ? event.stages.join(' · ') : 'No stages yet'}{event.tournamentId ? ' · from Esportra' : ''}</p></div>
        </div>
        <div className="row-gap">
          <EventFileMenu eventId={event.id} run={run} />
          <DeleteButton label="Delete event" ask={matches.length ? `Delete ${event.name} and its ${matches.length} match${matches.length === 1 ? '' : 'es'}?` : `Delete ${event.name}?`} onDelete={() => void run(async () => { await air.deleteEvent(event.id); back(); })} />
          {!lobbyGame && <button className="btn primary" onClick={newMatch}>New match</button>}
        </div>
      </header>
      <div className="tabs" role="tablist" aria-label="Event">
        {([['matches', lobbyGame ? 'Lobbies' : 'Matches'], ['branding', 'Branding'], ['talent', 'Talent and sponsors']] as Array<[EventTab, string]>).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'branding' && <EventBranding s={s} run={run} event={event} />}
      {tab === 'talent' && <EventTalent s={s} run={run} event={event} />}
      {tab === 'matches' && lobbyGame && <LobbyList s={s} run={run} eventId={event.id} open={setLobbyId} />}
      {tab === 'matches' && !lobbyGame && (
        <section className="stack" style={{ gap: 8 }}>
          {!matches.length && !remote.length && <p className="muted ap-empty">No matches in this event yet. Press New match to add one.</p>}
          <div className="lst">
            {matches.map((m) => {
              const st = m.finishedAt ? { health: 'off' as const, label: 'Finished' } : prepState(m, event);
              return (
                <div key={m.id} className={`li ev-match ${m.finishedAt ? 'done' : ''}`} aria-current={s.match?.id === m.id ? 'true' : undefined}>
                  <span className="mono t-sm">{when(m.source?.scheduledAt ?? null, m.createdAt)}</span>
                  <button className="ev-match-open" onClick={() => openMatch(m)}><TeamMark s={s} team={m.teams[0]} size={24} /><b>{m.teams[0].name}</b><span className="faint">vs</span><b>{m.teams[1].name}</b><TeamMark s={s} team={m.teams[1]} size={24} /></button>
                  <span className="muted t-sm">{[m.stage, `Bo${m.bestOf}`].filter(Boolean).join(' · ')}</span>
                  <span className={`state ${st.health}`} title={'detail' in st ? st.detail : undefined}><i className={`dot ${st.health}`} />{st.label}</span>
                  <span className="row-gap">
                    <button className="btn small" onClick={() => openMatch(m)}>Open</button>
                    <DeleteButton label="Delete" ask={m.source ? 'Remove from Air? (Stays in Esportra)' : 'Delete this match?'} onDelete={() => void run(() => air.deleteMatch(m.id))} />
                  </span>
                </div>
              );
            })}
            {remote.map((e) => (
              <div key={e.id} className="li ev-match">
                <span className="mono t-sm">{when(e.scheduledAt)}</span>
                <button className="ev-match-open" onClick={() => openRemote(e)}><b>{e.teamA}</b><span className="faint">vs</span><b>{e.teamB}</b></button>
                <span className="muted t-sm">Bo{e.bestOf}</span>
                <span className="state"><i className="dot off" />In Esportra</span>
                <button className="btn small" onClick={() => openRemote(e)}>Open</button>
              </div>
            ))}
          </div>
          <p className="faint t-xs">Removing an Esportra match only removes it from Air. A match cannot be deleted while it is live.</p>
        </section>
      )}
    </div>
  );
}

function EsportraTournament({ s, name, matches, back, openRemote }: { s: PageProps['s']; name: string; matches: EsportraMatch[]; back: () => void; openRemote: (e: EsportraMatch) => void }) {
  return (
    <div className="stack" style={{ gap: 18 }}>
      <nav className="crumb-back"><button className="btn quiet small" onClick={back}>← Events</button></nav>
      <header className="row-gap" style={{ gap: 16 }}><EventLogo s={s} path="" size={52} name={name} accent="#f43f5e" /><div><h1 className="title-lg">{name}</h1><p className="muted">From Esportra. Open a match to set it up; the event is made on this PC then.</p></div></header>
      <div className="lst">
        {matches.map((e) => (
          <div key={e.id} className="li ev-match">
            <span className="mono t-sm">{when(e.scheduledAt)}</span>
            <button className="ev-match-open" onClick={() => openRemote(e)}><b>{e.teamA}</b><span className="faint">vs</span><b>{e.teamB}</b></button>
            <span className="muted t-sm">Bo{e.bestOf}</span>
            <span className="state"><i className="dot off" />In Esportra</span>
            <button className="btn small" onClick={() => openRemote(e)}>Open</button>
          </div>
        ))}
      </div>
    </div>
  );
}
