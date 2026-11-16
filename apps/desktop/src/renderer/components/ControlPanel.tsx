// The control panel (approved mock, 15 Nov) replaces Live's layout: the match bar on top; graphics by phase
// on the left; the selected graphic's options and data in the middle; the pause hint, Program, Cued and
// Esportra results on the right. Keys, Cue/Take, autopilot and moments work as before (ConsoleScreen).
import { useState } from 'react';
import type { LayerRow, Snapshot } from '../../shared/api.ts';
import { SECTION_SCREENS } from '../../shared/autopilot.ts';
import { ROLE_NAME, SPACE_NAME, onAir, spacesOf, type SponsorSpace } from '../../shared/model.ts';
import { sponsorsOn } from '../../shared/key-actions.ts';
import { keyLabel, keyOf } from '../../shared/keymap.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { Preview, overlayUrl } from './Preview.tsx';

export type Phase = 'pre' | 'ingame' | 'post' | 'lower' | 'extras';
export const PHASES: Array<[Phase, string]> = [['pre', 'Pre-game'], ['ingame', 'In-game'], ['post', 'Post-game'], ['lower', 'Lower 3rds'], ['extras', 'Extras']];

/** One thing the panel can put on air. */
export interface Item {
  id: string;
  label: string;
  phase: Phase;
  state: 'onair' | 'cued' | 'auto' | 'off';
  row?: LayerRow;
  /** People, sponsor reads, the player spotlight and messages fire directly. */
  fire?: () => void;
  available: boolean;
}

const PRE = new Set(SECTION_SCREENS.pre.filter((x): x is string => !!x));
/** The screens whose data comes from a map record. */
export const POST_RECORD = new Set(['map-result', 'map-breakdown', 'postgame-player', 'postgame-matchup']);
/** Which sponsor space a full-screen graphic shows. */
const SPACE_OF: Record<string, SponsorSpace> = { 'map-veto': 'map-veto', 'agent-select': 'agent-select', 'map-breakdown': 'breakdown', 'postgame-player': 'breakdown', 'postgame-matchup': 'breakdown', 'map-result': 'victory', champion: 'victory' };

/** Everything the panel lists, by phase. */
export function panelItems(s: Snapshot, run: Run, openForm: (f: 'toast' | 'poll') => void): Item[] {
  const rowState = (r: LayerRow): Item['state'] => (r.cued ? 'cued' : r.mode === 'on' ? 'onair' : r.mode === 'auto' ? 'auto' : 'off');
  const items: Item[] = s.layers.map((row) => {
    const screen = row.id.startsWith('fs:') ? row.id.slice(3) : null;
    const phase: Phase = !screen ? 'ingame' : PRE.has(screen) && !POST_RECORD.has(screen) && !['map-result', 'series', 'halftime', 'champion'].includes(screen) ? 'pre' : 'post';
    return { id: row.id, label: row.label, phase, state: rowState(row), row, available: row.available };
  });
  const talent = s.match ? onAir(s.match, s.event).talent : [];
  for (const t of talent) {
    const on = s.triggers.person === t.name;
    items.push({ id: `person:${t.id}`, label: `${t.name} · ${ROLE_NAME[t.role]}`, phase: 'lower', state: on ? 'onair' : 'off', available: true, fire: () => void run(() => air.lowerThird(on ? null : { kind: 'person', name: t.name, role: ROLE_NAME[t.role] })) });
  }
  const observed = s.readout?.observed ?? null;
  items.push({ id: 'spotlight', label: `Player spotlight${observed ? ` · ${observed.name}` : ''}`, phase: 'lower', state: s.triggers.player ? 'onair' : 'off', available: !!observed, fire: () => void run(() => air.lowerThird(s.triggers.player ? null : { kind: 'player' })) });
  for (const x of sponsorsOn(s)) {
    const on = s.triggers.sponsor === x.id;
    items.push({ id: `sponsor:${x.id}`, label: `${x.name} read`, phase: 'lower', state: on ? 'onair' : 'off', available: true, fire: () => void run(() => air.sponsorRead(on ? null : x.id)) });
  }
  items.push({ id: 'toast', label: 'Toast', phase: 'extras', state: 'off', available: true, fire: () => openForm('toast') });
  items.push({ id: 'poll', label: 'Poll', phase: 'extras', state: s.triggers.poll ? 'onair' : 'off', available: true, fire: () => openForm('poll') });
  items.push({ id: 'replay', label: 'Replay', phase: 'extras', state: 'off', available: s.obs.state === 'connected', fire: () => void run(() => air.replay()) });
  return items;
}

/** Top: the series with − / +, the map being played and its score, Close map and Fix data. */
export function MatchBar({ s, run, openFix, openMatch }: { s: Snapshot; run: Run; openFix: () => void; openMatch?: () => void }) {
  const m = s.match;
  if (!m) return null;
  const r = s.readout;
  const series = r?.series ?? [0, 0];
  const wins = Math.ceil(m.bestOf / 2);
  const set = (i: 0 | 1, d: number) => {
    const next = [...series] as [number, number];
    next[i] = Math.min(wins, Math.max(0, next[i] + d));
    if (next[i] !== series[i]) void run(() => air.correct({ field: 'series', value: next, reason: 'Series fixed in the control panel' }));
  };
  const map = Math.min(series[0] + series[1] + 1, m.bestOf);
  const side = (i: 0 | 1) => (
    <span className={`cp-team ${i ? 'r' : ''}`} style={{ ['--c' as string]: m.teams[i].color }}>
      <b>{m.teams[i].name}</b>
      <span className="cp-series" role="group" aria-label={`${m.teams[i].name} maps won`}>
        <button className="btn quiet small" aria-label={`One map fewer for ${m.teams[i].name}`} onClick={() => set(i, -1)}>−</button>
        <b className="mono">{series[i]}</b>
        <button className="btn quiet small" aria-label={`One map more for ${m.teams[i].name}`} onClick={() => set(i, 1)}>+</button>
      </span>
    </span>
  );
  return (
    <div className="cp-bar">
      <div className="cp-teams">{side(0)}<span className="faint">vs</span>{side(1)}</div>
      <div className="cp-mid">
        <span className="pill">BO{m.bestOf}</span>
        <span>Map {map}{r?.map ? ` · ${r.map}` : ''}</span>
        {r && <b className="mono">{r.score[0] ?? 0} – {r.score[1] ?? 0}</b>}
        {r?.round ? <span className="muted">Round {r.round}{r.phase ? ` · ${r.phase}` : ''}</span> : null}
      </div>
      <div className="row-gap">
        {openMatch && <button className="btn small" title="Veto, players' prep, event data and show text, without leaving Live" onClick={openMatch}>Match <span className="kbd">{keyLabel(keyOf(s.keymap, 'match'))}</span></button>}
        <button className="btn small" title="Keep this map's data for the post-game graphics without counting it" onClick={() => void run(() => air.closeMap())}>Close map {map}</button>
        <button className="btn small" onClick={openFix}>Fix data <span className="kbd">{keyLabel(keyOf(s.keymap, 'fix'))}</span></button>
      </div>
    </div>
  );
}

/** Left: graphics by phase, each marked On air, Cued or Auto. */
export function GraphicList({ items, phase, setPhase, selected, select, keymap }: { items: Item[]; phase: Phase; setPhase: (p: Phase) => void; selected: string | null; select: (id: string) => void; keymap?: Snapshot['keymap'] }) {
  // Each graphic's key, so it can be pressed straight away without opening All graphics.
  const keyFor = (x: Item) => (x.row ? keyOf(keymap, `layer:${x.row.id}`) : '');
  const tag = { onair: ['ON AIR', 'onair'], cued: ['CUED', 'cued'], auto: ['AUTO', 'auto'], off: ['', ''] } as const;
  return (
    <nav className="cp-left" aria-label="Graphics">
      <div className="cp-phases" role="tablist" aria-label="Phase">
        {PHASES.map(([id, label]) => <button key={id} role="tab" aria-selected={phase === id} onClick={() => setPhase(id)}>{label}<small>{items.filter((x) => x.phase === id).length}</small></button>)}
      </div>
      <div className="cp-glist">
        {items.filter((x) => x.phase === phase).map((x) => (
          <button key={x.id} className={`cp-gi ${selected === x.id ? 'sel' : ''}`} aria-current={selected === x.id ? 'true' : undefined} disabled={!x.available} onClick={() => select(x.id)}>
            <span>{x.label}</span>{tag[x.state][0] && <span className={`cp-state ${tag[x.state][1]}`}>{tag[x.state][0]}</span>}{keyFor(x) && <span className="kbd" aria-label={`Key ${keyFor(x)}`}>{keyLabel(keyFor(x))}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}

const STAT_NAME: Record<string, string> = { k: 'Kills', d: 'Deaths', a: 'Assists', fk: 'First kills', fd: 'First deaths', kd: 'K / D', multi: 'Multi-kills', hs: 'HS%', adr: 'ADR' };

/** Middle: the selected graphic — how it goes on air, its options, its sponsor and what it shows. */
export function GraphicDetail({ s, run, item, cycle }: { s: Snapshot; run: Run; item: Item | null; cycle: (row: LayerRow) => void }) {
  if (!item || !s.match) return <section className="card cp-detail"><div className="cp-empty muted">Pick a graphic on the left.</div></section>;
  const m = s.match;
  const screen = item.row?.id.startsWith('fs:') ? item.row.id.slice(3) : null;
  const space = screen ? SPACE_OF[screen] : undefined;
  const rec = s.mapRecords;
  const event = s.events.find((e) => e.id === m.eventId);
  const bought = space ? (event?.sponsors ?? []).filter((x) => !m.sponsorsOff.includes(x.id) && spacesOf(x).includes(space)) : [];
  const spaceValue = space ? (m.spaceActive && space in m.spaceActive ? (m.spaceActive[space] ?? 'none') : 'event') : 'event';
  const opts = rec?.options;
  const players = rec?.record ? rec.record.players.flatMap((ps, t) => ps.map((p, i) => ({ t, i, label: `${p.name} · ${rec.record!.teams[t]!.tag}` }))) : [];
  const slotKey = (x: [number, number] | null | undefined) => (x ? `${x[0]}:${x[1]}` : '');
  const parseSlot = (v: string): [number, number] | null => (v ? (v.split(':').map(Number) as [number, number]) : null);
  return (
    <section className="card cp-detail" aria-label={item.label}>
      <div className="card-head">
        <b>{item.label}</b>
        {item.row ? (
          <span className="row-gap">
            <button className={`btn small ${item.state === 'onair' ? '' : 'primary'}`} disabled={!item.available} onClick={() => cycle(item.row!)}>{item.state === 'onair' ? 'Take off' : s.cue.mode ? 'Cue' : 'Put on air'}</button>
            {item.row.auto && <button className="btn quiet small" onClick={() => void run(() => air.setLayer(item.row!.id, 'auto'))}>Auto</button>}
          </span>
        ) : <button className="btn small primary" disabled={!item.available} onClick={item.fire}>{item.state === 'onair' ? 'Hide' : 'Show'}</button>}
      </div>
      <div className="body-pad stack" style={{ gap: 12 }}>
        {screen && POST_RECORD.has(screen) && (
          rec?.maps.length ? (
            <div className="row-gap" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="field" style={{ flex: '1 1 260px' }}><span>Which map</span>
                <select value={String(rec.shown ?? '')} onChange={(e) => void run(() => air.recordShow(e.target.value === 'series' ? 'series' : Number(e.target.value)))}>
                  {rec.maps.map((x) => <option key={x.map} value={x.map}>Map {x.map} — {x.name || '?'} · {m.teams[0].tag} {x.score[0]}–{x.score[1]} {m.teams[1].tag} · {x.how === 'game' ? 'ended by the game' : x.how === 'producer' ? 'counted by you' : 'closed by hand'}{x.partial ? ' · partial' : ''}</option>)}
                  <option value="series">Whole series</option>
                </select>
              </label>
              {typeof rec.shown === 'number' && <button className="btn quiet small" onClick={() => void run(() => air.recordRemove(rec.shown as number))}>Remove this record</button>}
            </div>
          ) : <p className="muted t-sm">No map has ended yet. The record comes when the game ends a map, or press Close map in the bar above.</p>
        )}
        {screen && (screen === 'postgame-player' || screen === 'postgame-matchup') && opts && (
          <>
            <div className="field"><span>Stats</span>
              <div className="cp-chips">{Object.keys(STAT_NAME).map((k) => {
                const on = opts.stats.includes(k);
                return <button key={k} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => void run(() => air.postOptions({ stats: on ? opts.stats.filter((x) => x !== k) : [...opts.stats, k] }))}>{STAT_NAME[k]}</button>;
              })}</div>
              <span className="hint">ADR and HS% only with player PCs; a dash otherwise. Up to six.</span>
            </div>
            {players.length > 0 && (screen === 'postgame-player' ? (
              <label className="field"><span>Player</span>
                <select value={slotKey(opts.player)} onChange={(e) => void run(() => air.postOptions({ player: parseSlot(e.target.value) }))}>
                  <option value="">Top fragger</option>{players.map((p) => <option key={`${p.t}:${p.i}`} value={`${p.t}:${p.i}`}>{p.label}</option>)}
                </select>
              </label>
            ) : (
              <div className="grid2">{[0, 1].map((k) => (
                <label key={k} className="field"><span>{k ? 'Right' : 'Left'}</span>
                  <select value={slotKey(opts.matchup?.[k])} onChange={(e) => { const v = parseSlot(e.target.value); const cur = opts.matchup ?? [[0, 0], [1, 0]]; const next = (k ? [cur[0], v] : [v, cur[1]]) as [[number, number], [number, number]]; void run(() => air.postOptions({ matchup: v ? next : null })); }}>
                    <option value="">Top fragger of {m.teams[k]!.tag}</option>{players.map((p) => <option key={`${p.t}:${p.i}`} value={`${p.t}:${p.i}`}>{p.label}</option>)}
                  </select>
                </label>
              ))}</div>
            ))}
          </>
        )}
        {space && (
          <label className="field"><span>Sponsor on this graphic · {SPACE_NAME[space]}</span>
            <select value={spaceValue} onChange={(e) => void run(() => air.matchSpaceSet(space, e.target.value === 'event' ? 'event' as never : e.target.value === 'none' ? null : e.target.value))}>
              <option value="event">The event’s choice{bought.length ? '' : ' (nobody bought this space)'}</option>
              <option value="none">None in this match</option>
              {bought.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )}
        {screen && POST_RECORD.has(screen) && rec?.record ? <RecordTable s={s} /> : screen ? <Preview src={overlayUrl(s, s.setup.screens.find((x) => x.id === screen)?.overlay ?? screen, { match: m.code })} label={item.label} /> : null}
      </div>
    </section>
  );
}

/** What the post-game graphics show: the record's players, K / D / A and first kills. */
function RecordTable({ s }: { s: Snapshot }) {
  const r = s.mapRecords?.record;
  if (!r) return null;
  return (
    <div className="cp-record">
      {[0, 1].map((t) => (
        <div key={t}>
          <div className="between"><b>{r.teams[t]!.name}</b><span className={`pill ${r.winner === t ? 'ok' : ''}`}>{r.winner === t ? 'WIN' : r.winner === 1 - t ? 'LOSS' : ''} {r.score[t]}</span></div>
          <table className="seg-table"><thead><tr><th>Player</th><th>Agent</th><th>K</th><th>D</th><th>A</th><th>FK</th></tr></thead>
            <tbody>{r.players[t]!.map((p, i) => <tr key={i}><td>{p.name}</td><td className="muted">{p.agent}</td><td>{p.k}</td><td>{p.d}</td><td>{p.a}</td><td>{p.fk}</td></tr>)}</tbody></table>
        </div>
      ))}
      {r.partial && <p className="faint t-xs">Air joined this map part-way, so multi-kills and first deaths show a dash.</p>}
    </div>
  );
}

/** The buy phase has run long: maybe a timeout. One click puts it up for a team. */
export function PauseHint({ s, run }: { s: Snapshot; run: Run }) {
  const [hidden, setHidden] = useState<number | null>(null);
  if (!s.pauseHint || !s.match || hidden === s.pauseHint.seconds) return null;
  return (
    <div className="card warn cp-hint" role="status">
      <span><b>Looks like a pause</b> · buy phase {s.pauseHint.seconds} s. Show Timeout?</span>
      <span className="row-gap" style={{ flexWrap: 'wrap' }}>
        {[0, 1].map((t) => <button key={t} className="btn small amber" onClick={() => void run(() => air.pause('timeout', { team: t as 0 | 1 }))}>{s.match!.teams[t]!.tag} timeout</button>)}
        <button className="btn small" onClick={() => void run(() => air.pause('technical'))}>Tech pause</button>
        <button className="btn quiet small" onClick={() => setHidden(s.pauseHint!.seconds)}>Not now</button>
      </span>
    </div>
  );
}

/** Map results sent to Esportra for review, and Apply / Reject for organizers. */
export function ResultsCard({ s, run }: { s: Snapshot; run: Run }) {
  const r = s.esportraResults;
  if (!r || !r.items.length) return null;
  const word = (x: (typeof r.items)[number]) => (x.state === 'queued' ? 'Waiting to send' : x.state === 'refused' ? 'Refused' : x.status === 'applied' ? 'Applied' : x.status === 'rejected' ? 'Rejected' : 'Pending review');
  return (
    <section className="card" aria-label="Results to Esportra">
      <div className="card-head"><b>Results to Esportra</b><span className="faint t-xs">The organizer reviews each map</span></div>
      <div className="lst">
        {r.items.map((x) => (
          <div key={x.proposalId} className="li cp-result">
            <span><b>Map {x.map}</b> · {x.scores[0]}–{x.scores[1]}<br /><span className={`t-xs ${x.state === 'refused' || x.status === 'rejected' ? 'warn-text' : 'muted'}`}>{word(x)}{x.error && x.state !== 'sent' ? ` · ${x.error}` : ''}</span></span>
            {r.canReview && x.state === 'sent' && x.status === 'pending' && (
              <span className="row-gap">
                <button className="btn small" onClick={() => void run(() => air.esportraReview(x.proposalId, 'apply'))}>Apply</button>
                <button className="btn quiet small" onClick={() => void run(() => air.esportraReview(x.proposalId, 'reject'))}>Reject</button>
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The game's numbers for every player (approved mock, 16 Nov): agent, K / D / A, credits, ultimate, alive. */
export function LiveBoard({ s }: { s: Snapshot }) {
  const r = s.readout;
  const m = s.match;
  if (!m || !r || !r.players?.some((t) => t.length)) return null;
  return (
    <section className="card live-board" aria-label="Match data from the game">
      <div className="card-head"><b>Match data</b><span className="faint t-xs">from the game{r.round ? ` · round ${r.round}` : ''}</span></div>
      <div className="lb-grid body-pad" style={{ paddingTop: 0 }}>
        {[0, 1].map((t) => (
          <table key={t} className="lb-table">
            <caption><i className="dot" style={{ background: m.teams[t]!.color }} />{m.teams[t]!.tag || m.teams[t]!.name}<span className="faint"> · bank {(r.bank[t] ?? 0).toLocaleString('en-GB')}</span></caption>
            <thead><tr><th>Player</th><th>K / D / A</th><th>Credits</th><th>Ult</th></tr></thead>
            <tbody>
              {(r.players[t] ?? []).map((p, i) => (
                <tr key={i} className={p.alive ? '' : 'dead'}>
                  <td><b>{p.name}</b> <span className="faint">{p.agent ? p.agent[0] + p.agent.slice(1).toLowerCase() : ''}</span></td>
                  <td className="num">{p.k} / {p.d} / {p.a}</td>
                  <td className="num">{p.credits.toLocaleString('en-GB')}</td>
                  <td><span className="lb-ult" aria-label={`Ultimate ${p.ult} of ${p.ultMax}`}>{Array.from({ length: Math.min(p.ultMax, 9) }, (_, k) => <i key={k} className={k < p.ult ? 'f' : ''} />)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );
}
