// A match (approved 12 Nov): the team-light hero, then its steps in working order — Overview,
// Teams/Players, Talent and sponsors, Rundown, OBS, Player PCs and cameras, Rehearse — and Go live.
// Everything for this match is set up here.
import { useEffect, useState } from 'react';
import type { ActionId, LibTeam, Snapshot, Team } from '../../shared/api.ts';
import { ROLE_NAME, TIER_NAME, onAir } from '../../shared/model.ts';
import { air } from '../bridge.ts';
import type { MatchStep, PageProps } from '../App.tsx';
import type { EventView } from './EventsScreen.tsx';
import { ScenesScreen } from './ScenesScreen.tsx';
import { OutputsScreen } from './OutputsScreen.tsx';
import { DevicesScreen } from './DevicesScreen.tsx';
import { ObsConnection } from './SettingsScreen.tsx';
import { NextFive } from '../components/Autopilot.tsx';
import { Rundown } from '../components/Rundown.tsx';
import { EditorDrawer, PlayerEditor, Switch, cameraText } from '../components/Editors.tsx';
import { LibPlayerEditor, LibTeamEditor } from '../components/TeamEditors.tsx';
import { TeamFields, imageUrl } from '../components/MatchEditors.tsx';
import { RehearsePanel } from '../components/Rehearse.tsx';
import { GoLiveDialog } from '../components/GoLive.tsx';
import { PackWindow } from '../components/PackWindow.tsx';
import { LIBRARY, inShow, showLink, showPatch } from '../../shared/library.ts';
import { SCENE_KEYS, SCENES, sourceName } from '../../shared/scenes.ts';
import { Preview, overlayUrl } from '../components/Preview.tsx';

const STEPS: Array<[MatchStep, string]> = [['ready', 'Overview'], ['teams', 'Teams/Players'], ['talent', 'Talent and sponsors'], ['rundown', 'Rundown'], ['obs', 'OBS'], ['devices', 'Player PCs and cameras'], ['rehearse', 'Rehearse']];
type StepHealth = 'ok' | 'warn' | 'bad' | null;

/** How far each step is: ✓ done, ! needs a look, or just its number. */
function stepHealth(s: Snapshot, step: MatchStep): StepHealth {
  const m = s.match!;
  const check = (...ids: string[]) => {
    const list = s.checks.filter((c) => ids.includes(c.id));
    if (!list.length) return null;
    if (list.some((c) => c.health === 'bad')) return 'bad';
    if (list.some((c) => c.health === 'warn')) return 'warn';
    return list.every((c) => c.health === 'ok') ? 'ok' : null;
  };
  switch (step) {
    case 'ready': { const counted = s.checks.filter((c) => !(c.id === 'esportra' && c.health === 'off')); return counted.every((c) => c.health === 'ok') ? 'ok' : null; }
    case 'teams': return m.players.every((l) => l.length >= 5 && l.slice(0, 5).every((p) => p.gameId)) ? 'ok' : 'warn';
    case 'talent': return check('talent');
    case 'rundown': return s.setup.screens.some((x) => x.enabled) ? 'ok' : 'warn';
    case 'obs': return check('obs', 'scenes', 'sources');
    case 'devices': return check('player-pcs');
    default: return null;
  }
}

const when = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  const day = d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

/** A team's logo at its own shape, or its tag in its colour; never boxed. */
export function TeamMark({ s, team, size }: { s: Snapshot; team: Team; size: number }) {
  return team.logo
    ? <img className="team-mark" src={imageUrl(s, team.logo)} alt="" style={{ width: size, height: size }} />
    : <span className="team-tag" style={{ color: team.color, fontSize: Math.max(12, size * 0.38) }}>{team.tag}</span>;
}

/** A photo, or the first letter when there is none. */
export function Face({ s, photo, name, size }: { s: Snapshot; photo: string; name: string; size: number }) {
  return photo
    ? <img className="portrait" src={imageUrl(s, photo)} alt="" style={{ width: size, height: size }} />
    : <span className="portrait initials" style={{ width: size, height: size, fontSize: size * 0.42 }}>{name.slice(0, 1).toUpperCase() || '?'}</span>;
}

function Hero({ s }: { s: Snapshot }) {
  const m = s.match!;
  const side = (i: 0 | 1) => (
    <div className={`tl-side ${i ? 'r' : ''}`}>
      <TeamMark s={s} team={m.teams[i]} size={56} />
      <div>
        <div className="tl-name">{m.teams[i].name}</div>
        <div className="tl-faces">{m.players[i].length ? m.players[i].slice(0, 5).map((p) => <Face key={p.id} s={s} photo={p.photo} name={p.name} size={26} />) : <span className="faint t-xs">No lineup yet</span>}</div>
      </div>
    </div>
  );
  return (
    <header className="teamlight" style={{ ['--a' as string]: m.teams[0].color, ['--b' as string]: m.teams[1].color }}>
      {side(0)}
      <div className="tl-mid">
        <span>{[when(m.source?.scheduledAt), `Best of ${m.bestOf}`].filter(Boolean).join(' · ')}</span>
        <span className="faint t-xs">{[s.event?.name, m.stage].filter(Boolean).join(' · ') || 'No event'}</span>
      </div>
      {side(1)}
    </header>
  );
}

function Overview({ s, run, act, back }: Pick<PageProps, 's' | 'run'> & { act: (id: ActionId) => void; back: () => void }) {
  const [sure, setSure] = useState(false);
  // Not being signed in to Esportra is information, not something to fix before a quick match.
  const counted = s.checks.filter((c) => !(c.id === 'esportra' && c.health === 'off'));
  const ready = counted.filter((c) => c.health === 'ok').length;
  const needs = s.checks.filter((c) => c.health === 'warn' || c.health === 'bad');
  const optional = s.checks.filter((c) => c.health === 'off');
  const readyChecks = s.checks.filter((c) => c.health === 'ok');
  const m = s.match!;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}><h2 className="title-md">{ready === counted.length ? 'Ready when you are' : 'Almost ready'}</h2><p className="muted t-sm">Go live sends your graphics to OBS, starts game data with your permission, and arms autopilot if you want it. Your stream stays in OBS. Warnings never stop you.</p></div>
        <span className="row-gap">
          <span className={`pill ${ready === counted.length ? 'ok' : 'warn'}`}>{ready} of {counted.length} ready</span>
          {m.finishedAt
            ? <button className="btn quiet small" onClick={() => void run(() => air.markFinished(m.id, false))} title="It follows Teams/Players again">Reopen</button>
            : <button className="btn quiet small" onClick={() => void run(() => air.markFinished(m.id, true))} title="It keeps the teams and players it was played with">Mark as finished</button>}
          {sure ? (
            <span className="row-gap confirm" role="group" aria-label="Delete this match?">
              <span className="t-sm">{m.source ? 'Remove from Air? (Stays in Esportra)' : 'Delete this match?'}</span>
              <button className="btn small danger-solid" onClick={() => void run(async () => { await air.deleteMatch(m.id); back(); })}>Delete</button>
              <button className="btn quiet small" onClick={() => setSure(false)}>Keep</button>
            </span>
          ) : <button className="btn quiet small danger" onClick={() => setSure(true)}>Delete match</button>}
        </span>
      </div>
      {m.finishedAt && <div className="notice info" role="status">Finished {new Date(m.finishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. It keeps the teams and players it was played with; changes in Teams/Players no longer reach it. Reopen to follow them again.</div>}
      {/* Grouped by what each check needs from you: what needs you leads, what is ready shrinks to chips. */}
      <div className="stack" style={{ gap: 12 }} aria-label="Readiness checks">
        {needs.length > 0 && <CheckCard tone={needs.some((c) => c.health === 'bad') ? 'bad' : 'warn'} title={`Needs you · ${needs.length}`} checks={needs} act={act} />}
        {optional.length > 0 && <CheckCard tone="" title={`Optional · ${optional.length}`} checks={optional} act={act} />}
        {readyChecks.length > 0 && (
          <section className="card ok" aria-label="Ready">
            <div className="card-head"><span className="cap ok">Ready · {readyChecks.length}</span></div>
            <div className="pill-row">{readyChecks.map((c) => <span key={c.id} className="pill ok" title={c.detail}>✓ {c.title}</span>)}</div>
          </section>
        )}
      </div>
      {s.control !== 'companion' && <NextFive s={s} />}
    </div>
  );
}

/** A group of checks on one card: each with its icon, what it found and its fix. */
function CheckCard({ tone, title, checks, act }: { tone: 'warn' | 'bad' | ''; title: string; checks: Snapshot['checks']; act: (id: ActionId) => void }) {
  return (
    <section className={`card ${tone}`} aria-label={title}>
      <div className="card-head"><span className={`cap ${tone === 'warn' ? 'warn' : ''}`} style={tone === 'bad' ? { color: 'var(--rose)' } : undefined}>{title}</span></div>
      <div className="lst">
        {checks.map((c) => (
          <div className="li check-row" key={c.id}>
            <span className="check-ic" aria-label={c.health}>{c.health === 'off' ? '–' : '!'}</span>
            <span><b>{c.title}</b><br /><span className="muted t-sm">{c.detail}</span></span>
            {c.action ? <button className={`btn small ${tone ? 'amber' : ''}`} onClick={() => act(c.action!.id)}>{c.action.label}</button> : <span />}
          </div>
        ))}
      </div>
    </section>
  );
}

/** OBS for this match: the connection, the scenes Air adds, and the browser sources it serves. */
function ObsStep(props: Pick<PageProps, 's' | 'run' | 'go'>) {
  const { s, run } = props;
  const page = { ...props, askCapture: () => {}, openFix: () => {}, openCasters: () => {}, openSignIn: () => {} } as PageProps;
  const connected = s.obs.state === 'connected';
  const [changing, setChanging] = useState(false);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="between">
        <div><h2 className="title-md">OBS</h2><p className="muted t-sm">Air adds its own scenes to OBS and reads which one is on air. You switch scenes yourself; Air never does.</p></div>
        <button className={`btn ${s.obs.installed ? '' : 'primary'}`} disabled={!connected} onClick={() => void run(() => air.installGraphics())}>{s.obs.installed ? 'Rebuild scenes' : 'Add all to OBS'}</button>
      </div>
      {connected && !changing
        ? <div className="li check-row"><i className="dot ok" aria-label="ok" /><span><b>Connected to OBS Studio {s.obs.version}</b><br /><span className="muted t-sm">{s.setup.obs.host}:{s.setup.obs.port} · scene collection {s.obs.collection ?? '—'}</span></span><button className="btn quiet small" onClick={() => setChanging(true)}>Change</button></div>
        : <ObsConnection s={s} run={run} />}
      {connected && <ScenesScreen {...page} embedded />}
      {connected && <><h3 className="title-sm">Browser sources</h3><OutputsScreen {...page} embedded /></>}
    </div>
  );
}

function Teams({ s, run, go }: Pick<PageProps, 's' | 'run' | 'go'>) {
  const m = s.match!;
  const [player, setPlayer] = useState<{ team: 0 | 1; index: number | null } | null>(null);
  const [teamEdit, setTeamEdit] = useState<LibTeam | 'new' | null>(null);
  const [newPlayer, setNewPlayer] = useState<string | null>(null);
  const { teams, players } = s.library;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="between"><p className="muted t-sm">Pick each side’s team, then who plays. The first five start; up to two more are substitutes.</p><button className="btn quiet small" onClick={() => go('teams')}>Open Teams/Players</button></div>
      <div className="cols2">
        {([0, 1] as const).map((t) => {
          const teamId = m.teamIds?.[t] ?? null;
          const lib = teams.find((x) => x.id === teamId) ?? null;
          const lineup = m.players[t];
          const inLineup = new Set(lineup.map((p) => p.libraryId).filter(Boolean));
          const bench = lib ? players.filter((p) => p.teamId === lib.id && !inLineup.has(p.id)) : [];
          const ids = lineup.map((p) => p.libraryId).filter((x): x is string => !!x);
          return (
            <section key={t} className="stack" style={{ gap: 8 }} aria-label={`Side ${t ? 'B' : 'A'}`}>
              <div className="between">
                <span className="row-gap"><TeamMark s={s} team={m.teams[t]} size={30} />
                  <select className="cell" aria-label={`Team for side ${t ? 'B' : 'A'}`} value={teamId ?? ''} onChange={(e) => { if (e.target.value === '__new') setTeamEdit('new'); else if (e.target.value) void run(() => air.setMatchTeam(m.id, t, e.target.value)); }}>
                    {!teamId && <option value="">{m.teams[t].name} (not saved)</option>}
                    {teams.map((x) => <option key={x.id} value={x.id} disabled={x.id === m.teamIds?.[1 - t]}>{x.name}</option>)}
                    <option value="__new">Add a new team…</option>
                  </select>
                </span>
                {lib && <button className="btn quiet small" onClick={() => setTeamEdit(lib)}>Logo and colour</button>}
              </div>
              <div className="lst">
                {lineup.map((p, i) => (
                  <div key={p.id} className="li lineup-pick">
                    <Face s={s} photo={p.photo} name={p.name} size={36} />
                    <button className="ev-match-open" onClick={() => setPlayer({ team: t, index: i })} aria-label={`Edit ${p.name}`}><span><b>{p.name}</b><br /><span className="mono faint t-xs">{p.gameId || 'No Riot ID'}</span></span></button>
                    <span className={`tag-pill ${i < 5 ? 'on' : ''}`}>{i < 5 ? 'Starter' : 'Sub'}</span>
                    {lib && p.libraryId ? <button className="btn quiet small" onClick={() => void run(() => air.setStarters(m.id, t, ids.filter((x) => x !== p.libraryId)))}>Leave out</button> : <span />}
                  </div>
                ))}
                {lineup.length === 0 && <p className="muted li">Nobody plays yet.</p>}
              </div>
              {lib && (
                <>
                  <h3 className="title-sm" style={{ marginTop: 6 }}>Also in {lib.name}</h3>
                  <div className="lst">
                    {bench.map((p) => (
                      <div key={p.id} className="li lineup-pick">
                        <Face s={s} photo={p.photo} name={p.name} size={36} />
                        <span><b>{p.name}</b><br /><span className="mono faint t-xs">{p.gameId || 'No Riot ID'}</span></span>
                        <span />
                        <button className="btn small" disabled={ids.length >= 7} onClick={() => void run(() => air.setStarters(m.id, t, [...ids, p.id]))}>Add to lineup</button>
                      </div>
                    ))}
                    <button className="li add-row" onClick={() => setNewPlayer(lib.id)}>+ New player for {lib.name}</button>
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
      {player && <PlayerEditor s={s} run={run} team={player.team} index={player.index} close={() => setPlayer(null)} />}
      {teamEdit && <LibTeamEditor s={s} run={run} team={teamEdit === 'new' ? null : teamEdit} close={() => setTeamEdit(null)} />}
      {newPlayer && <LibPlayerEditor s={s} run={run} player={null} teamId={newPlayer} close={() => setNewPlayer(null)} />}
    </div>
  );
}

function Talent({ s, run, openEvent }: Pick<PageProps, 's' | 'run'> & { openEvent: (tab: EventView['tab']) => void }) {
  const m = s.match!;
  const event = s.event;
  const [stage, setStage] = useState(m.stage);
  const first = onAir(m, event).talent[0];
  const toggle = (list: string[], id: string, on: boolean) => (on ? list.filter((x) => x !== id) : [...list, id]);
  if (!event) return <p className="muted">This match has no event. Create one in Event.</p>;
  return (
    <div className="stack" style={{ gap: 18 }}>
      <form className="row-gap" style={{ alignItems: 'flex-end', maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); void run(() => air.updateMatch(m.id, { stage })); }}>
        <label className="field" style={{ flex: 1 }}><span>Stage on air</span><input value={stage} onChange={(e) => setStage(e.target.value)} maxLength={40} list="event-stages" placeholder="e.g. Playoffs" /></label>
        <datalist id="event-stages">{event.stages.map((x) => <option key={x} value={x} />)}</datalist>
        <button className="btn" disabled={stage === m.stage}>Save stage</button>
      </form>
      <div className="cols2">
        <section className="stack" style={{ gap: 8 }}>
          <div className="between"><h2 className="title-sm">On air for this match</h2><button className="btn quiet small" onClick={() => openEvent('talent')}>Edit in the event</button></div>
          <div className="lst">
            {event.talent.length === 0 && <p className="muted li">Nobody in {event.name} yet.</p>}
            {event.talent.map((t) => {
              const on = !m.talentOff.includes(t.id);
              return (
                <div className="li talent-row" key={t.id}>
                  <Face s={s} photo={t.photo} name={t.name} size={40} />
                  <span><b>{t.name}</b><br /><span className="muted t-sm">{ROLE_NAME[t.role]}</span></span>
                  <span className="faint t-xs">{cameraText(t).text}</span>
                  <Switch on={on} label={`${t.name} on air for this match`} onChange={() => void run(() => air.updateMatch(m.id, { talentOff: toggle(m.talentOff, t.id, !on) }))} />
                </div>
              );
            })}
          </div>
          {first && (
            <div className="stack" style={{ gap: 8, marginTop: 10 }}>
              <h3 className="faint t-xs">How they appear</h3>
              <div className="fr-l3">{first.photo ? <img className="ph" src={imageUrl(s, first.photo)} alt="" style={{ objectFit: 'cover' }} /> : <span className="ph" />}<span><b>{first.name}</b><small>{ROLE_NAME[first.role].toUpperCase()}{first.handle ? ` · ${first.handle.toUpperCase()}` : ''}</small></span></div>
            </div>
          )}
        </section>
        <section className="stack" style={{ gap: 8 }}>
          <div className="between"><h2 className="title-sm">Sponsors for this match</h2><button className="btn quiet small" onClick={() => openEvent('talent')}>Edit in the event</button></div>
          <div className="lst">
            {event.sponsors.length === 0 && <p className="muted li">No sponsors in {event.name} yet.</p>}
            {event.sponsors.map((x) => {
              const on = !m.sponsorsOff.includes(x.id);
              return (
                <div className="li sponsor-match-row" key={x.id}>
                  {x.logo ? <img className="spon-logo" src={imageUrl(s, x.logo)} alt="" /> : <b className="spon-name">{x.name}</b>}
                  <span className="muted t-sm">{TIER_NAME[x.tier]}{x.read ? ` · “${x.read}”` : ''}</span>
                  <Switch on={on} label={`${x.name} on for this match`} onChange={() => void run(() => air.updateMatch(m.id, { sponsorsOff: toggle(m.sponsorsOff, x.id, !on) }))} />
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/** The match: its steps, from Overview to Go live. */
export function MatchWorkspace({ s, run, go, step, setStep, act, start, back, openEvent, focus = null }: Pick<PageProps, 's' | 'run' | 'go'> & {
  focus?: string | null; step: MatchStep; setStep: (t: MatchStep) => void; act: (id: ActionId) => void; start: () => void; back: () => void; openEvent: (tab: EventView['tab']) => void;
}) {
  const m = s.match!;
  const [goLive, setGoLive] = useState(false);
  const live = s.feed.state === 'live' || s.feed.state === 'waiting';
  const page = { s, run, go, askCapture: () => act('start-capture'), openFix: () => {}, openCasters: () => setStep('talent'), openSignIn: () => act('sign-in') } as PageProps;
  return (
    <div className="stack workspace" style={{ gap: 16 }}>
      <nav className="crumb-back"><button className="btn quiet small" onClick={back}>← {s.event?.name ?? 'Events'}</button></nav>
      <Hero s={s} />
      <div className="ws">
        <nav className="stepnav" aria-label="Match steps">
          {STEPS.map(([id, label], i) => {
            const h = stepHealth(s, id);
            return (
              <button key={id} aria-current={step === id ? 'step' : undefined} onClick={() => setStep(id)}>
                <span className={`n ${h ?? ''}`} aria-hidden="true">{h === 'ok' ? '✓' : h === 'warn' || h === 'bad' ? '!' : i}</span>
                <span>{label}</span>
              </button>
            );
          })}
          {live
            ? <button className="btn primary golive" onClick={start}>Open Live</button>
            : <button className="btn live golive" onClick={() => setGoLive(true)}>Go live</button>}
          {!live && <button className="btn quiet small" onClick={() => void run(() => air.autopilotStop()).then(start)}>Open Live without going live</button>}
        </nav>
        <div className="ws-body">
          {step === 'ready' && <Overview s={s} run={run} act={act} back={back} />}
          {step === 'teams' && <Teams key={m.id} s={s} run={run} go={go} />}
          {step === 'talent' && <Talent key={m.id} s={s} run={run} openEvent={openEvent} />}
          {step === 'rundown' && <Rundown s={s} run={run} />}
          {step === 'obs' && <ObsStep s={s} run={run} go={go} />}
          {step === 'devices' && <DevicesScreen {...page} embedded />}
          {step === 'rehearse' && <RehearsePanel s={s} run={run} focus={focus} />}
        </div>
      </div>
      {goLive && <GoLiveDialog s={s} close={() => setGoLive(false)} done={() => { setGoLive(false); start(); }} connectObs={() => { setGoLive(false); setStep('obs'); }} />}
    </div>
  );
}
