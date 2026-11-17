// New match wizard: the prerequisites of a show, in order, ending with a private rehearsal.
import { useEffect, useState } from 'react';
import type { BannerTheme, Snapshot, Team } from '../../shared/api.ts';
import { ScreenPicker, startPoint, type StartPoint } from './ScreenPicker.tsx';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { LineupEditor, TeamFields, emptyPlayer, type Lineups } from './MatchEditors.tsx';
import { RehearsePanel } from './Rehearse.tsx';
import { EventTab, ShowTab, VetoTab } from './MatchData.tsx';
import { ShowTemplatePicker } from './ShowTemplates.tsx';

// The match is created when leaving Show (the veto is saved to it); Maps and veto and Rehearse work on it.
const STEPS = ['Teams', 'Players', 'Show', 'Maps and veto', 'Show text and event data', 'Rehearse'] as const;
const SCREENS = 2;
const VETO = 3;
const TEXT = 4;
const REHEARSE = 5;

export function NewMatchWizard({ s, run, close, eventId: forEvent }: { s: Snapshot; run: Run; close: () => void; eventId?: string | null }) {
  const last = s.matches[0];
  const [step, setStep] = useState(0);
  // Matches are for the game chosen for the whole app (top bar).
  const game = s.game?.id ?? 'valorant';
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(3);
  const [teams, setTeams] = useState<[Team, Team]>([
    { name: '', tag: '', color: '#22d3ee', logo: '' },
    { name: '', tag: '', color: '#f43f5e', logo: '' },
  ]);
  const [lineups, setLineups] = useState<Lineups>([Array.from({ length: 5 }, emptyPlayer), Array.from({ length: 5 }, emptyPlayer)]);
  // The new match joins the selected match's event (or the first one); talent and sponsors come from it.
  const [eventId, setEventId] = useState<string | null>(forEvent ?? (s.event ?? s.events[0])?.id ?? null);
  // '__last' is an event just created: it is added last.
  const event = (eventId === '__last' ? s.events.at(-1) : s.events.find((e) => e.id === eventId)) ?? null;
  const [newEvent, setNewEvent] = useState('');
  const [stage, setStage] = useState(last?.stage ?? '');
  const [theme, setTheme] = useState<BannerTheme>(last?.theme ?? 'broadcast');
  // The screens ticked in Screens; they become this match's Rundown.
  const [point, setPoint] = useState<StartPoint | null>('standard');
  const [picked, setPicked] = useState<string[]>(() => startPoint('standard', 3).screens);
  // Screens that start as an overlay bar over the game (the rest full screen).
  const [bands, setBands] = useState<string[]>([]);
  const [template, setTemplate] = useState(startPoint('standard', 3).template);
  // A show template of your own: its screens and looks here; its exact rows are applied once the match exists.
  const [mine, setMine] = useState<string | null>(null);
  const choosePoint = (p: StartPoint) => { const x = startPoint(p, bestOf); setPoint(p); setMine(null); setPicked(x.screens); setTemplate(x.template); };
  const chooseShow = (id: string) => {
    if (id.startsWith('builtin:')) return choosePoint(id.slice(8) as StartPoint);
    const t = s.showTemplates.find((x) => x.id === id);
    if (!t) return;
    setPoint(null); setMine(id); setTheme(t.theme); setTemplate('standard');
    setPicked(['in-game', ...t.screens.map((x) => x.show)]); setBands(t.screens.filter((x) => x.style === 'band').map((x) => x.show));
  };
  useEffect(() => { if (point) choosePoint(point); }, [bestOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  // Once created, the match is edited on its own page; the wizard only rehearses it.
  const [created, setCreated] = useState(false);
  useEffect(() => { if (step === SCREENS) void air.librarySeed().catch(() => {}); }, [step]);

  const teamsOk = teams.every((t) => t.name.trim()) && teams[0].name.trim().toLowerCase() !== teams[1].name.trim().toLowerCase();
  const canNext = step === 0 ? teamsOk : true;
  const finish = async () => {
    setBusy(true);
    const players = lineups.map((team) => team.filter((p) => p.name.trim())) as Lineups;
    const ok = await run(() => air.createMatch({ bestOf, teams, players, ...(event ? { eventId: event.id } : {}), stage, theme, template, screens: [...new Set(['in-game', ...picked])], bands: bands.filter((b) => picked.includes(b)) }));
    setBusy(false);
    if (ok) {
      if (mine) await run(() => air.showTemplateApply(mine));
      setCreated(true);
      setStep(VETO);
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
          <div><span className="cap">New {s.game?.name ?? ''} match</span><h2 className="title-md" style={{ marginTop: 4 }}>{STEPS[step]}</h2></div>
          <ol className="stepper">
            {STEPS.map((label, i) => <li key={label} className={i === step ? 'now' : i < step ? 'done' : ''}><button type="button" disabled={i > step || (created && i < VETO)} onClick={() => setStep(i)}><span>{i + 1}</span>{label}</button></li>)}
          </ol>
          <button className="btn quiet small" onClick={done} aria-label="Close">Esc · Close</button>
        </header>
        {step < VETO && (
          <div className="wizard-ctx">
            {forEvent && event
              ? <span>Match in <b>{event.name}</b></span>
              : s.events.length > 0
                ? <label className="row-gap"><span>Event</span><select aria-label="Event" value={event?.id ?? ''} onChange={(e) => setEventId(e.target.value)}>{s.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
                : <form className="row-gap" onSubmit={async (e) => { e.preventDefault(); if (!newEvent.trim()) { (e.currentTarget.elements.namedItem('event-name') as HTMLInputElement | null)?.focus(); return; } if (await run(() => air.createEvent(newEvent))) { setNewEvent(''); setEventId('__last'); } }}>
                    <input className="cell" name="event-name" aria-label="New event name" value={newEvent} onChange={(e) => setNewEvent(e.target.value)} placeholder="Name the event this match belongs to" maxLength={60} />
                    <button className="btn small">Create event</button>
                  </form>}
            <label className="row-gap"><span>Stage</span><input className="cell" aria-label="Stage on air" value={stage} onChange={(e) => setStage(e.target.value)} maxLength={40} placeholder="e.g. Playoffs" list="wizard-stages" style={{ width: 160 }} /></label>
            <datalist id="wizard-stages">{(event?.stages ?? []).map((x) => <option key={x} value={x} />)}</datalist>
            <span className="faint">Best of {bestOf}{teams[0].name && teams[1].name ? <> · <b>{teams[0].name}</b> vs <b>{teams[1].name}</b></> : null}</span>
            {event && <span className="faint push">On air: {event.talent.length ? event.talent.map((t) => t.name).join(', ') : 'nobody yet'} · {event.sponsors.length} sponsor{event.sponsors.length === 1 ? '' : 's'}</span>}
          </div>
        )}
        <div className="wizard-body">
          {step === 0 && (
            <div className="stack" style={{ gap: 14 }}>
              <div className="row-item" style={{ padding: 0, border: 0, justifyContent: 'flex-start', gap: 14 }}>
                <span className="cap">Format</span>
                <div className="seg" role="group" aria-label="Format">
                  {([1, 3, 5] as const).map((n) => <button type="button" key={n} aria-pressed={bestOf === n} onClick={() => setBestOf(n)}>Best of {n}</button>)}
                </div>
              </div>
              <p className="lead">Names, tags, colours and logos appear on every graphic.</p>
              {s.library.teams.length > 0 && (
                <div className="row-gap" style={{ gap: 18 }}>
                  {([0, 1] as const).map((t) => (
                    <label key={t} className="field" style={{ flex: 1 }}><span>Pick a saved team for side {t ? 'B' : 'A'}</span>
                      <select aria-label={`Saved team for side ${t ? 'B' : 'A'}`} value="" onChange={(e) => {
                        const lib = s.library.teams.find((x) => x.id === e.target.value);
                        if (!lib) return;
                        const team = { name: lib.name, tag: lib.tag, color: lib.color, logo: lib.logo };
                        setTeams(t ? [teams[0], team] : [team, teams[1]]);
                        const roster = s.library.players.filter((p) => p.teamId === lib.id).slice(0, 7).map((p) => ({ ...emptyPlayer(), name: p.name, realName: p.realName, gameId: p.gameId, photo: p.photo }));
                        const filled = roster.length >= 5 ? roster : [...roster, ...Array.from({ length: 5 - roster.length }, emptyPlayer)];
                        setLineups(t ? [lineups[0], filled] : [filled, lineups[1]]);
                      }}>
                        <option value="">Choose from Teams/Players…</option>
                        {s.library.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              <div className="teams-vs">
                <TeamFields s={s} team={teams[0]} index={0} onChange={(t) => setTeams([t, teams[1]])} />
                <span className="vs-mark">VS</span>
                <TeamFields s={s} team={teams[1]} index={1} onChange={(t) => setTeams([teams[0], t])} />
              </div>
              {!teamsOk && teams[0].name && teams[1].name && <p style={{ color: 'var(--bad)', fontSize: 12.5 }}>The two teams need different names.</p>}
            </div>
          )}
          {step === 1 && (
            <div className="stack" style={{ gap: 14 }}>
              <p className="lead">Who plays. Empty rows are left out; you can finish the lineups later.</p>
              <LineupEditor s={s} teams={teams} lineups={lineups} onChange={setLineups} game={game} />
            </div>
          )}
          {step === SCREENS && (
            <div className="stack" style={{ gap: 16 }}>
            <ShowTemplatePicker s={s} value={mine ? mine : point ? `builtin:${point}` : null} onPick={chooseShow} />
            <ScreenPicker s={s} picked={picked} onPick={(ids) => { setPicked(ids); setPoint(null); setMine(null); }} point={point} onPoint={choosePoint} theme={theme} onTheme={setTheme} bands={bands} onBands={(b) => { setBands(b); setMine(null); }} />
            </div>
          )}
          {step === VETO && s.match && s.matchData && (
            <div className="stack" style={{ gap: 14 }}>
              <p className="lead">Best of, the map pool and who starts. Enter the veto now, or later from Live’s Match drawer as the teams ban and pick.</p>
              <VetoTab key={s.match.id} s={s} run={run} md={s.matchData} />
            </div>
          )}
          {step === TEXT && s.match && s.matchData && <TextStep s={s} run={run} />}
          {step === REHEARSE && (
            <div className="stack" style={{ gap: 14 }}>
              <p className="lead">Watch {s.match?.title ?? 'the match'} run through your graphics: your teams, players and photos on sample game data, with autopilot firing as it would on the night.</p>
              <RehearsePanel s={s} run={run} compact />
            </div>
          )}
        </div>
        <footer className="wizard-foot">
          <button className="btn quiet" disabled={step === 0 || (created && step <= VETO)} onClick={() => setStep(step - 1)}>Back</button>
          <span className="muted" style={{ fontSize: 12.5 }}>Step {step + 1} of {STEPS.length}</span>
          {step === REHEARSE
            ? <button className="btn primary" onClick={done}>Finish · Readiness</button>
            : step === SCREENS
              ? <button className="btn primary" disabled={busy || !teamsOk} onClick={() => void finish()}>{busy ? 'Creating…' : 'Create match · maps and veto'}</button>
              : step === VETO
                ? <button className="btn primary" onClick={() => setStep(TEXT)}>Continue</button>
              : step === TEXT
                ? <span className="row-gap"><button className="btn quiet" onClick={() => setStep(REHEARSE)}>Skip</button><button className="btn primary" onClick={() => setStep(REHEARSE)}>Continue · rehearse</button></span>
              : <button className="btn primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</button>}
        </footer>
      </div>
    </div>
  );
}

/** Optional: Starting soon / Break / Ending text and the event's standings, ticker and bracket. Both stay editable in Match data and Live. */
function TextStep({ s, run }: { s: Snapshot; run: Run }) {
  const [tab, setTab] = useState<'show' | 'event'>('show');
  return (
    <div className="stack" style={{ gap: 14 }}>
      <p className="lead">What the holding screens say, and the event’s standings, ticker and bracket. Optional: skip it and fill it in later from Match data or Live’s Match drawer.</p>
      <div className="seg tabs-seg" role="tablist" aria-label="Show text and event data">
        <button role="tab" aria-selected={tab === 'show'} aria-pressed={tab === 'show'} onClick={() => setTab('show')}>Show text</button>
        <button role="tab" aria-selected={tab === 'event'} aria-pressed={tab === 'event'} onClick={() => setTab('event')}>Event data</button>
      </div>
      {tab === 'show' ? <ShowTab key={s.match!.id} s={s} run={run} md={s.matchData!} /> : <EventTab key={s.match!.eventId} s={s} run={run} />}
    </div>
  );
}
