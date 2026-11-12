// A match's workspace (approved mocks): the team-light hero, then Readiness, Teams and players,
// Talent and sponsors, Autopilot and Rehearse. Graphics links to the current graphics page until
// My show replaces it.
import { useState } from 'react';
import type { ActionId, Snapshot, Team } from '../../shared/api.ts';
import { ROLE_NAME, TIER_NAME, onAir } from '../../shared/model.ts';
import { air } from '../bridge.ts';
import type { PageProps } from '../App.tsx';
import { AutopilotRules, NextFive } from '../components/Autopilot.tsx';
import { EditorDrawer, PlayerEditor, Switch, cameraText } from '../components/Editors.tsx';
import { TeamFields, imageUrl } from '../components/MatchEditors.tsx';
import { RehearsePanel } from '../components/Rehearse.tsx';
import { PackWindow } from '../components/PackWindow.tsx';
import { LIBRARY, inShow, showLink, showPatch } from '../../shared/library.ts';
import { SCENE_KEYS, SCENES } from '../../shared/scenes.ts';

export type Tab = 'ready' | 'teams' | 'talent' | 'myshow' | 'autopilot' | 'rehearse';
const TABS: Array<[Tab, string]> = [['ready', 'Readiness'], ['teams', 'Teams and players'], ['talent', 'Talent and sponsors'], ['myshow', 'My show'], ['autopilot', 'Autopilot'], ['rehearse', 'Rehearse']];

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

function Readiness({ s, run, act, start }: Pick<PageProps, 's' | 'run'> & { act: (id: ActionId) => void; start: () => void }) {
  // Not being signed in to Esportra is information, not something to fix before a quick match.
  const counted = s.checks.filter((c) => !(c.id === 'esportra' && c.health === 'off'));
  const ready = counted.filter((c) => c.health === 'ok').length;
  return (
    <div className="side-grid">
      <div className="stack" style={{ gap: 18 }}>
        <div className="between"><h2 className="title-md">{ready === counted.length ? 'Ready when you are' : 'Almost ready'}</h2><span className="muted t-sm">{ready} of {counted.length} ready</span></div>
        <div className="lst" aria-label="Readiness checks">
          {s.checks.map((c) => (
            <div className="li check-row" key={c.id}>
              <i className={`dot ${c.health}`} aria-label={c.health} />
              <span><b>{c.title}</b><br /><span className="muted t-sm">{c.detail}</span></span>
              {c.action ? <button className="btn small" onClick={() => act(c.action!.id)}>{c.action.label}</button> : <span />}
            </div>
          ))}
        </div>
        <NextFive s={s} />
      </div>
      <aside className="stack" style={{ gap: 12 }}>
        <h2 className="title-sm">Run the show</h2>
        <p className="muted t-sm">{s.autopilotBlock ?? 'Autopilot puts graphics up for you after a hold you can stop with H. Off unless you start it.'}</p>
        <button className="btn primary big" disabled={!!s.autopilotBlock} onClick={() => void run(() => air.autopilotStart()).then((ok) => ok && start())}>Start autopilot</button>
        <button className="btn big" onClick={() => void run(() => air.autopilotStop()).then(start)}>Run manually</button>
        <span className="faint t-xs">Warnings never stop you. Your stream itself starts in OBS.</span>
      </aside>
    </div>
  );
}

function Teams({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const m = s.match!;
  const [player, setPlayer] = useState<{ team: 0 | 1; index: number | null } | null>(null);
  const [teamEdit, setTeamEdit] = useState<0 | 1 | null>(null);
  const [draft, setDraft] = useState<Team | null>(null);
  return (
    <div className="cols2">
      {([0, 1] as const).map((t) => (
        <section key={t} className="stack" style={{ gap: 8 }}>
          <div className="between">
            <span className="row-gap"><TeamMark s={s} team={m.teams[t]} size={30} /><h2 className="title-sm">{m.teams[t].name}</h2></span>
            <button className="btn quiet small" onClick={() => { setTeamEdit(t); setDraft(m.teams[t]); }}>Logo and colour</button>
          </div>
          <div className="lst">
            {m.players[t].map((p, i) => (
              <button key={p.id} className="li lineup-row" onClick={() => setPlayer({ team: t, index: i })} aria-label={`Edit ${p.name}`}>
                <Face s={s} photo={p.photo} name={p.name} size={40} />
                <span><b>{p.name}</b><br /><span className="mono faint t-xs">{p.gameId || 'No in-game name'}</span></span>
                {!p.gameId ? <span className="state warn"><i className="dot warn" />Not matched to game data</span> : <span />}
              </button>
            ))}
            {m.players[t].length < 7 && <button className="li add-row" onClick={() => setPlayer({ team: t, index: null })}>+ Add player</button>}
          </div>
        </section>
      ))}
      {player && <PlayerEditor s={s} run={run} team={player.team} index={player.index} close={() => setPlayer(null)} />}
      {teamEdit !== null && draft && (
        <EditorDrawer
          title={m.teams[teamEdit].name} close={() => setTeamEdit(null)}
          footer={<><span /><span className="row-gap"><button className="btn quiet" onClick={() => setTeamEdit(null)}>Cancel</button><button className="btn primary" onClick={async () => { const teams = m.teams.map((x, i) => (i === teamEdit ? draft : x)) as [Team, Team]; if (await run(() => air.updateMatch(m.id, { teams }))) setTeamEdit(null); }}>Save</button></span></>}
        >
          <TeamFields s={s} team={draft} index={teamEdit} onChange={setDraft} />
        </EditorDrawer>
      )}
    </div>
  );
}

function Talent({ s, run, go }: Pick<PageProps, 's' | 'run' | 'go'>) {
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
          <div className="between"><h2 className="title-sm">On air for this match</h2><button className="btn quiet small" onClick={() => go('event')}>Edit in Event</button></div>
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
          <div className="between"><h2 className="title-sm">Sponsors for this match</h2><button className="btn quiet small" onClick={() => go('event')}>Edit in Event</button></div>
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

/** My show: what goes into OBS for every match of this production, by the scene it lands in. */
function MyShow({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const [pack, setPack] = useState(false);
  const items = LIBRARY[s.game?.id ?? 'valorant'];
  const titleOf = (overlay: string, fallback: string) => items.find((i) => i.overlay === overlay)?.title ?? fallback;
  const hudItems = items.filter((i) => showLink(i).kind === 'hud' && inShow(s.setup, i));
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="between">
        <p className="muted" style={{ margin: 0 }}>These go to OBS for every match of this production, under these scene names.</p>
        <button className="btn" onClick={() => setPack(true)}>Add from the Library</button>
      </div>
      <div className="cols2">
        {SCENE_KEYS.map((key) => {
          const screens = s.setup.screens.filter((x) => x.scene === key && x.enabled);
          const hud = key === 'gameplay' ? hudItems : [];
          return (
            <section key={key} className="stack" style={{ gap: 6 }}>
              <span className="mono t-xs faint">{SCENES[key].name}</span>
              <div className="lst">
                {screens.length + hud.length === 0 && <span className="li muted t-sm">Nothing here.</span>}
                {screens.map((x) => {
                  const item = items.find((i) => i.overlay === x.overlay && showLink(i).kind === 'screen');
                  const patch = item ? showPatch(s.setup, item, false) : null;
                  return (
                    <div key={x.id} className="li show-row">
                      <span>{titleOf(x.overlay, x.title)}{!item && <span className="faint t-xs"> · always</span>}</span>
                      {patch ? <button className="btn quiet small" onClick={() => void run(() => air.updateSetup(patch))}>Remove</button> : <span />}
                    </div>
                  );
                })}
                {hud.map((i) => (
                  <div key={i.overlay} className="li show-row">
                    <span>{i.title} <span className="faint t-xs">· in the HUD</span></span>
                    <button className="btn quiet small" onClick={() => void run(() => air.updateSetup(showPatch(s.setup, i, false)!))}>Remove</button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {pack && <PackWindow s={s} run={run} close={() => setPack(false)} />}
    </div>
  );
}

export function MatchWorkspace({ s, run, go, tab, setTab, act, start, back }: Pick<PageProps, 's' | 'run' | 'go'> & { tab: Tab; setTab: (t: Tab) => void; act: (id: ActionId) => void; start: () => void; back: () => void }) {
  const m = s.match!;
  return (
    <div className="stack workspace" style={{ gap: 18 }}>
      <nav className="crumb-back"><button className="btn quiet small" onClick={back}>← Matches</button></nav>
      <Hero s={s} />
      <div className="tabs" role="tablist" aria-label="Match">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'ready' && <Readiness s={s} run={run} act={act} start={start} />}
      {tab === 'teams' && <Teams key={m.id} s={s} run={run} />}
      {tab === 'talent' && <Talent key={m.id} s={s} run={run} go={go} />}
      {tab === 'myshow' && <MyShow s={s} run={run} />}
      {tab === 'autopilot' && <AutopilotRules s={s} run={run} rehearse={() => setTab('rehearse')} />}
      {tab === 'rehearse' && <RehearsePanel s={s} run={run} />}
    </div>
  );
}
