// Match data (approved mock, 15 Nov): what the graphics show beyond the game's own data. Maps and veto
// (entered live as the teams ban and pick, or followed from Esportra), player prep, the event's standings,
// ticker and bracket, and the Starting soon / Break / Ending text. Saved changes go on air at once.
import { useEffect, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import {
  VALORANT_MAPS, emptyEventData, emptyPrep, nextVetoStep, orderOf, seriesMaps,
  type BracketMatch, type EventData, type HoldingMode, type MapName, type MatchData, type PlayerPrep, type StandingsRow,
} from '../../shared/match-data.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { Seg } from './Editors.tsx';
import { Preview, overlayUrl } from './Preview.tsx';
import { VetoPanel } from './veto/VetoPanel.tsx';

type Tab = 'veto' | 'players' | 'event' | 'show';
const TABS: Array<[Tab, string]> = [['veto', 'Maps and veto'], ['players', 'Players'], ['event', 'Event data'], ['show', 'Show text']];

const title = (m: string) => m.charAt(0) + m.slice(1).toLowerCase();

export function MatchData({ s, run, openFix }: { s: Snapshot; run: Run; openFix: () => void }) {
  const [tab, setTab] = useState<Tab>('veto');
  const m = s.match;
  if (!m || !s.matchData) return <p className="muted">Choose a match first.</p>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <h2 className="title-md">Match data</h2>
          <p className="muted t-sm">What the graphics show beyond the game’s own data. Saved changes go on air at once.</p>
        </div>
        <button className="btn quiet small" onClick={openFix}>Open Fix data</button>
      </div>
      <div className="seg tabs-seg" role="tablist" aria-label="Match data">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'veto' && <VetoTab key={m.id} s={s} run={run} md={s.matchData} />}
      {tab === 'players' && <PlayersTab key={m.id} s={s} run={run} />}
      {tab === 'event' && <EventTab key={m.eventId} s={s} run={run} />}
      {tab === 'show' && <ShowTab key={m.id} s={s} run={run} md={s.matchData} />}
    </div>
  );
}

// ── Maps and veto ──

function EsportraVetoNote({ s, run }: { s: Snapshot; run: Run }) {
  const v = s.esportraVeto;
  if (!v) return null;
  const since = v.unreachableSince ? new Date(v.unreachableSince).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
  const status: Record<string, string> = { not_started: 'not started on Esportra', pending: 'waiting to start on Esportra', toss_choice_pending: 'coin toss on Esportra', in_progress: 'in progress on Esportra', completed: 'complete on Esportra' };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {v.source === 'air'
        ? <div className="notice info between" role="status"><span>You entered this veto here, so Esportra’s is not followed.</span><button className="btn small" onClick={() => void run(() => air.vetoFollowEsportra())}>Follow Esportra again</button></div>
        : <div className="notice info" role="status">Two-way with Esportra{v.status ? ` · ${status[v.status] ?? v.status}` : ''}. Steps the teams make on the website go on air here; steps you enter here go to the match room too.</div>}
      {v.gone && <div className="notice" role="status">This match is no longer in your Esportra schedule. Its veto stays as it is.</div>}
      {since && <div className="notice" role="status">Esportra can’t be reached since {since}. The last veto stays on air.</div>}
      {v.unknownMaps.length > 0 && <div className="notice" role="status">Esportra’s veto has {v.unknownMaps.join(', ')}, which Air doesn’t know. It’s left out; enter the veto here if it matters.</div>}
    </div>
  );
}

/** Maps and veto: the same panel in the match's steps, in New match and in Live's Match drawer. */
export function VetoTab({ s, run, md }: { s: Snapshot; run: Run; md: MatchData }) {
  const m = s.match!;
  const locked = !!s.gameLocked;
  const [pendingBo, setPendingBo] = useState<1 | 3 | 5 | null>(null);
  const order = orderOf(m.bestOf, md.vetoOrder);
  const used = new Map(md.veto.map((v) => [v.map, v]));
  const tag = (t: number) => (t === 0 || t === 1 ? m.teams[t].tag : '');
  const togglePool = (map: MapName) => {
    const on = md.mapPool.includes(map);
    if (on && used.has(map)) return;
    void run(() => air.matchDataSave({ ...md, mapPool: on ? md.mapPool.filter((x) => x !== map) : [...md.mapPool, map] }));
  };
  return (
    <div className="stack" style={{ gap: 14 }}>
      <EsportraVetoNote s={s} run={run} />
      <VetoPanel s={s} run={run} md={md} />
      <div className="md-grid">
        <div className="stack" style={{ gap: 14, minWidth: 0 }}>
          <section className="card">
            <div className="card-head">
              <b>Format and map pool</b>
              <Seg label="Best of" disabled={locked} value={String(m.bestOf) as '1' | '3' | '5'} options={[['1', 'BO1'], ['3', 'BO3'], ['5', 'BO5']]} onChange={(v) => { const bo = Number(v) as 1 | 3 | 5; if (bo === m.bestOf) return; if (md.veto.length) setPendingBo(bo); else void run(() => air.updateMatch(m.id, { bestOf: bo })); }} />
            </div>
            {locked && <p className="faint t-xs body-pad" style={{ paddingTop: 0 }}>Best of is locked while game data or a test round runs. Stop them in Live to change it.</p>}
            {!locked && m.kind === 'esportra' && <p className="faint t-xs body-pad" style={{ paddingTop: 0 }}>Best of comes from Esportra. A change here lasts until Esportra changes the match.</p>}
            {pendingBo && (
              <div className="body-pad row-gap" role="alertdialog" aria-label="Change best of" style={{ paddingTop: 0 }}>
                <span className="t-sm">Best of {pendingBo} has a different veto order, so the veto entered so far is cleared.</span>
                <button className="btn small" onClick={() => { const bo = pendingBo; setPendingBo(null); void run(async () => { await air.matchDataSave({ ...md, veto: [], vetoSource: 'air' }); return air.updateMatch(m.id, { bestOf: bo }); }); }}>Change to BO{pendingBo}</button>
                <button className="btn quiet small" onClick={() => setPendingBo(null)}>Keep BO{m.bestOf}</button>
              </div>
            )}
            <div className="body-pad stack" style={{ gap: 8, paddingTop: 0 }}>
              <span className="faint t-xs">{md.mapPool.length} maps in the pool · the veto needs {order.length}.</span>
              <details className="md-pool-edit"><summary className="t-xs">Change the pool</summary>
                <div className="row-gap" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                  {VALORANT_MAPS.map((map) => <label key={map} className="t-xs row-gap"><input type="checkbox" checked={md.mapPool.includes(map)} disabled={used.has(map)} onChange={() => togglePool(map)} />{title(map)}</label>)}
                </div>
              </details>
              {md.veto.length > 0 && (
                <details className="md-pool-edit"><summary className="t-xs">Correct a step</summary>
                  <div className="md-vlist" style={{ marginTop: 8 }}>
                    {md.veto.map((v, i) => (
                      <div className="md-vrow md-vedit" key={i}>
                        <span className="mono faint">{String(i + 1).padStart(2, '0')}</span>
                        <b className="cap">{v.action}</b>
                        <span className="row-gap">
                          <span>{v.action === 'decider' ? 'Decider' : tag(v.team)}</span>
                          <select className="cell" aria-label={`Step ${i + 1} map`} value={v.map} onChange={(e) => void run(() => air.vetoEdit(i, { map: e.target.value }))}>
                            {md.mapPool.filter((x) => x === v.map || !used.has(x)).map((x) => <option key={x} value={x}>{title(x)}</option>)}
                          </select>
                        </span>
                        <span className="row-gap">
                          {v.action !== 'ban' && (
                            <select className="cell" aria-label={`Step ${i + 1} side`} value={v.side ?? ''} onChange={(e) => void run(() => air.vetoEdit(i, { side: (e.target.value || null) as 'ATK' | 'DEF' | null }))}>
                              <option value="">Side later</option><option value="ATK">ATK</option><option value="DEF">DEF</option>
                            </select>
                          )}
                        </span>
                        <span />
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </section>
        </div>
        <div className="stack" style={{ gap: 14 }}>
          <section className="card">
            <div className="card-head"><b>On air · Map veto</b><span className="faint t-xs">this match</span></div>
            <div className="body-pad" style={{ paddingTop: 0 }}><Preview src={overlayUrl(s, 'map-veto', { match: m.code })} label="Map veto, this match" /></div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Players ──

function PlayersTab({ s, run }: { s: Snapshot; run: Run }) {
  const m = s.match!;
  const [side, setSide] = useState<'0' | '1'>('0');
  const lineup = m.players[Number(side) as 0 | 1];
  const used = s.rundown.some((r) => r.enabled && r.show === 'player-profile');
  return (
    <section className="card">
      <div className="card-head">
        <span><b>Player stats</b><br /><span className="faint t-xs">Shown on Player profile before this match has numbers of its own · kept in Teams/Players</span></span>
        <Seg label="Team" value={side} options={[['0', m.teams[0].name], ['1', m.teams[1].name]]} onChange={setSide} />
      </div>
      <div className="body-pad" style={{ paddingTop: 0, overflowX: 'auto' }}>
        {!used && <p className="notice t-sm" style={{ marginBottom: 10 }}>Player profile is not in this match’s Rundown, so these numbers are not shown on air. Add it in the Rundown step (Between maps or Pre-show) to use them. Filling them in is optional.</p>}
        {lineup.length ? (
          <table className="seg-table md-prep">
            <thead><tr><th>Player</th><th>Maps</th><th>Rating</th><th>KPR</th><th>ACS</th><th>HS%</th><th>Clutches</th><th>Quote</th></tr></thead>
            <tbody>{lineup.map((p) => <PrepRow key={p.id} s={s} run={run} name={p.name} libraryId={p.libraryId} />)}</tbody>
          </table>
        ) : <p className="muted t-sm">No lineup yet. Pick who plays in Teams/Players.</p>}
        <p className="faint t-xs" style={{ marginTop: 10 }}>Each player’s record before this match (from their season or an earlier stage), for the Player profile graphic. Empty numbers show a dash on air; after a map, the match’s own numbers take over. Each row saves when you leave it.</p>
      </div>
    </section>
  );
}

function PrepRow({ s, run, name, libraryId }: { s: Snapshot; run: Run; name: string; libraryId?: string }) {
  const saved = (libraryId && s.playerPrep[libraryId]) || emptyPrep();
  const [p, setP] = useState<PlayerPrep>(saved);
  useEffect(() => setP(saved), [JSON.stringify(saved)]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!libraryId) return <tr><td><b>{name}</b></td><td colSpan={7} className="faint t-xs">Not in Teams/Players yet, so prep can’t be kept.</td></tr>;
  const save = () => { if (JSON.stringify(p) !== JSON.stringify(saved)) void run(() => air.playerPrepSave(libraryId, p)); };
  const num = (k: 'maps' | 'acs' | 'clutches') => <input className="cell" inputMode="numeric" aria-label={`${name} ${k}`} value={p[k] ?? ''} placeholder="—" onChange={(e) => setP({ ...p, [k]: e.target.value === '' ? null : Number(e.target.value.replace(/[^0-9]/g, '')) })} onBlur={save} />;
  const txt = (k: 'rating' | 'kpr' | 'hs', max: number) => <input className="cell" aria-label={`${name} ${k}`} maxLength={max} value={p[k]} placeholder="—" onChange={(e) => setP({ ...p, [k]: e.target.value })} onBlur={save} />;
  return (
    <tr>
      <td><b>{name}</b></td><td>{num('maps')}</td><td>{txt('rating', 8)}</td><td>{txt('kpr', 8)}</td><td>{num('acs')}</td><td>{txt('hs', 8)}</td><td>{num('clutches')}</td>
      <td><input className="cell" aria-label={`${name} quote`} maxLength={160} value={p.quote} placeholder="Add a quote" onChange={(e) => setP({ ...p, quote: e.target.value })} onBlur={save} /></td>
    </tr>
  );
}

// ── Event data ──

export function EventTab({ s, run }: { s: Snapshot; run: Run }) {
  const m = s.match!;
  const saved = s.eventData ?? emptyEventData();
  const [ev, setEv] = useState<EventData>(saved);
  useEffect(() => setEv(saved), [JSON.stringify(saved)]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(ev) !== JSON.stringify(saved);
  const event = s.events.find((e) => e.id === m.eventId);
  const setRow = (i: number, c: number, v: string) => setEv({ ...ev, standings: ev.standings.map((r, k) => (k === i ? (r.map((x, j) => (j === c ? v : x)) as StandingsRow) : r)) });
  const setGame = (round: 'qf' | 'sf' | 'gf', i: number, c: number, v: string) => setEv({ ...ev, bracket: { ...ev.bracket, [round]: ev.bracket[round].map((g, k) => (k === i ? (g.map((x, j) => (j === c ? (c % 2 ? Number(v.replace(/[^0-9]/g, '')) || 0 : v) : x)) as BracketMatch) : g)) } });
  const ROUNDS: Array<['qf' | 'sf' | 'gf', string, number]> = [['qf', 'Quarter-finals', 4], ['sf', 'Semi-finals', 2], ['gf', 'Grand final', 1]];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <p className="muted t-sm" style={{ flex: '1 1 360px' }}>These belong to {event?.name ?? 'the event'}, so every match of the event shows them.{m.source ? ' Esportra fills the standings and bracket from the tournament every 2 minutes; a part Esportra has nothing for keeps what you typed.' : ''}</p>
        <span className="row-gap">
          {m.source && <button className="btn quiet small" onClick={() => void run(() => air.esportraBracketRefresh())}>Refresh from Esportra</button>}
          {dirty && <button className="btn quiet small" onClick={() => setEv(saved)}>Undo changes</button>}
          <button className="btn primary small" disabled={!dirty} onClick={() => void run(() => air.eventDataSave(m.eventId, ev))}>Save · on air</button>
        </span>
      </div>
      <div className="md-grid">
        <section className="card">
          <div className="card-head"><span><b>Standings</b><br /><FromLine marks={saved.esportra} part="standings" esportra={!!m.source} /></span><button className="btn quiet small" disabled={ev.standings.length >= 32} onClick={() => setEv({ ...ev, standings: [...ev.standings, ['', '', '', '']] })}>Add team</button></div>
          <div className="body-pad" style={{ paddingTop: 0 }}>
            {ev.standings.length ? (
              <table className="seg-table">
                <thead><tr><th>Team</th><th>W–L</th><th>Maps</th><th>Rnd ±</th><th /></tr></thead>
                <tbody>{ev.standings.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, c) => <td key={c}><input className="cell" aria-label={`Standings row ${i + 1} ${['team', 'W–L', 'maps', 'round difference'][c]}`} maxLength={[40, 12, 12, 8][c]} value={v} onChange={(e) => setRow(i, c, e.target.value)} /></td>)}
                    <td><button className="btn quiet small" aria-label={`Remove row ${i + 1}`} onClick={() => setEv({ ...ev, standings: ev.standings.filter((_, k) => k !== i) })}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p className="faint t-sm">No standings yet. The Standings graphic shows its own empty table until you add teams.</p>}
          </div>
        </section>
        <div className="stack" style={{ gap: 14 }}>
          <section className="card">
            <div className="card-head"><b>Ticker</b><button className="btn quiet small" disabled={ev.ticker.length >= 20} onClick={() => setEv({ ...ev, ticker: [...ev.ticker, ''] })}>Add line</button></div>
            <div className="body-pad stack" style={{ paddingTop: 0, gap: 6 }}>
              {ev.ticker.map((t, i) => (
                <div className="row-gap" key={i}>
                  <input className="cell" aria-label={`Ticker line ${i + 1}`} maxLength={160} value={t} onChange={(e) => setEv({ ...ev, ticker: ev.ticker.map((x, k) => (k === i ? e.target.value : x)) })} />
                  <button className="btn quiet small" aria-label={`Move line ${i + 1} up`} disabled={!i} onClick={() => { const n = [...ev.ticker]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; setEv({ ...ev, ticker: n }); }}>↑</button>
                  <button className="btn quiet small" aria-label={`Remove line ${i + 1}`} onClick={() => setEv({ ...ev, ticker: ev.ticker.filter((_, k) => k !== i) })}>✕</button>
                </div>
              ))}
              {!ev.ticker.length && <p className="faint t-sm">No ticker lines.</p>}
              <div className="grid2" style={{ marginTop: 6 }}>
                <label className="field"><span>Handle</span><input maxLength={40} value={ev.handle} placeholder="@yourevent" onChange={(e) => setEv({ ...ev, handle: e.target.value })} /></label>
                <label className="field"><span>Website</span><input maxLength={60} value={ev.site} placeholder="yourevent.gg" onChange={(e) => setEv({ ...ev, site: e.target.value })} /></label>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><span><b>Bracket</b><br /><FromLine marks={saved.esportra} part="bracket" esportra={!!m.source} /></span><span className="faint t-xs">QF · SF · GF</span></div>
            <div className="body-pad md-bracket" style={{ paddingTop: 0 }}>
              {ROUNDS.map(([round, label, max]) => (
                <div key={round} className="stack" style={{ gap: 6 }}>
                  <span className="cap">{label}</span>
                  {ev.bracket[round].map((g, i) => (
                    <div key={i} className="md-game">
                      {[0, 2].map((c) => (
                        <div key={c} className="row-gap">
                          <input className="cell" aria-label={`${label} ${i + 1} team ${c / 2 + 1}`} maxLength={40} value={g[c] as string} onChange={(e) => setGame(round, i, c, e.target.value)} />
                          <input className="cell md-score" aria-label={`${label} ${i + 1} score ${c / 2 + 1}`} inputMode="numeric" value={String(g[c + 1])} onChange={(e) => setGame(round, i, c + 1, e.target.value)} />
                        </div>
                      ))}
                      <button className="btn quiet small" onClick={() => setEv({ ...ev, bracket: { ...ev.bracket, [round]: ev.bracket[round].filter((_, k) => k !== i) } })}>Remove</button>
                    </div>
                  ))}
                  {ev.bracket[round].length < max && <button className="btn quiet small" onClick={() => setEv({ ...ev, bracket: { ...ev.bracket, [round]: [...ev.bracket[round], ['', 0, '', 0]] } })}>Add match</button>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Where a part of the event data came from: Esportra (and when) or typed in Air. */
function FromLine({ marks, part, esportra }: { marks?: EventData['esportra']; part: 'standings' | 'bracket'; esportra: boolean }) {
  const at = marks?.[part];
  if (at) return <span className="faint t-xs"><i className="dot ok" /> From Esportra · {ago(at)}</span>;
  const why = part === 'standings' && esportra ? marks?.noStandings : undefined;
  return <span className="faint t-xs">{why ?? 'Typed in Air'}</span>;
}

function ago(t: number) {
  const min = Math.max(0, Math.round((Date.now() - t) / 60_000));
  return min < 1 ? 'updated just now' : min < 60 ? `updated ${min} min ago` : `updated ${Math.round(min / 60)} h ago`;
}

// ── Show text ──

const MODES: Array<[HoldingMode, string]> = [['auto', 'Auto'], ['starting', 'Starting'], ['brb', 'Break'], ['ending', 'Ending']];
const clock = (ms: number) => (ms ? new Date(ms).toTimeString().slice(0, 5) : '');
/** "18:30" as the next time it comes round (today, or tomorrow when it has passed). */
function atTime(hhmm: string): number {
  const [h, mi] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return 0;
  const d = new Date();
  d.setHours(h!, mi!, 0, 0);
  if (d.getTime() < Date.now() - 60_000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function ShowTab({ s, run, md }: { s: Snapshot; run: Run; md: MatchData }) {
  const m = s.match!;
  const [show, setShow] = useState(md.show);
  const [champion, setChampion] = useState(md.champion);
  useEffect(() => { setShow(md.show); setChampion(md.champion); }, [JSON.stringify([md.show, md.champion])]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify([show, champion]) !== JSON.stringify([md.show, md.champion]);
  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="card">
        <div className="card-head"><b>Starting soon / Break / Ending</b><Seg label="Which text shows" value={show.mode} options={MODES} onChange={(mode) => setShow({ ...show, mode })} /></div>
        <div className="body-pad stack" style={{ paddingTop: 0, gap: 10 }}>
          <label className="field"><span>Message</span><input maxLength={120} value={show.message} placeholder="The Grand Final is about to begin" onChange={(e) => setShow({ ...show, message: e.target.value })} /></label>
          <div className="grid2">
            <label className="field"><span>Countdown · minutes</span><input inputMode="numeric" value={show.minutes} disabled={!!show.target} onChange={(e) => setShow({ ...show, minutes: Math.min(240, Number(e.target.value.replace(/[^0-9]/g, '')) || 0) })} /></label>
            <label className="field"><span>Or count down to a time</span><input type="time" value={clock(show.target)} onChange={(e) => setShow({ ...show, target: e.target.value ? atTime(e.target.value) : 0 })} /><span className="hint">Leave empty to count the minutes from when it shows.</span></label>
          </div>
          <p className="faint t-xs">Auto: Starting soon before map 1, Break between maps, Ending once the series is won.</p>
        </div>
      </section>
      <section className="card">
        <div className="card-head"><b>Champion</b><Seg label="Champion" value={String(champion) as '-1' | '0' | '1'} options={[['-1', 'Series winner'], ['0', m.teams[0].name], ['1', m.teams[1].name]]} onChange={(v) => setChampion(Number(v) as -1 | 0 | 1)} /></div>
        <p className="faint t-xs body-pad" style={{ paddingTop: 0 }}>The Champion graphic shows the team that won the series, unless you choose one.</p>
      </section>
      <div className="row-gap" style={{ justifyContent: 'flex-end' }}>
        {dirty && <button className="btn quiet small" onClick={() => { setShow(md.show); setChampion(md.champion); }}>Undo changes</button>}
        <button className="btn primary small" disabled={!dirty} onClick={() => void run(() => air.matchDataSave({ ...md, show, champion }))}>Save · on air</button>
      </div>
    </div>
  );
}
