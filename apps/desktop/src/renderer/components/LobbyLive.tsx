// Live for a battle royale lobby (23 Nov): the same control panel as a match (bar on top, graphics by phase on
// the left, the selected graphic in the middle, Program on the right), run on the lobby chosen for the graphics.
// Events keeps the lobby's structure (teams, matches, scoring); HUD library is where the HUD layout is chosen;
// everything that goes on air during the show is done here.
import { PcobPanel, pcobLabel } from './PcobPanel.tsx';
import { useEffect, useState } from 'react';
import type { Lobby, Snapshot } from '../../shared/api.ts';
import { standings } from '../../shared/br.ts';
import { BR_FEED_SCREENS, BR_SCREENS, BR_SCREEN_NAME, BR_SCREEN_PHASE, BR_SCREEN_WHAT, HUD_LAYOUT_NAME, lobbyPage, type BrScreen } from '../../shared/br-screens.ts';
import { BR_MOMENTS, BR_MOMENT_NAME, BR_MOMENT_WHAT, showOf, type BrMomentKind } from '../../shared/br-rundown.ts';
import { playerTotals } from '../../shared/br-stats.ts';
import { Switch } from './Editors.tsx';
import { gameOf } from '../../shared/games.ts';
import { GRAPHICS } from '../../shared/templates.ts';
import { air } from '../bridge.ts';
import type { PageProps, Run } from '../App.tsx';
import { GraphicList, type Item, type Phase } from './ControlPanel.tsx';
import { Composite, Preview } from './Preview.tsx';
import { Results } from '../screens/LobbyScreen.tsx';

const HUD_ID = 'brhud';

const fed = (l: Lobby) => l.games.some((g) => g.feed?.stats.length);

/** Live lists only what this lobby can use: graphics built on the feed only for a game that has one. */
function lobbyItems(s: Snapshot, l: Lobby): Item[] {
  const onAir = s.lobbyOnAir;
  const look = { hud: 'rail', popup: false, ...(l.look ?? {}) };
  const feed = !!gameOf(l.game)?.feed;
  const show = showOf(l);
  const items: Item[] = BR_SCREENS.filter((id) => feed || !BR_FEED_SCREENS.has(id)).map((id) => ({
    id, label: BR_SCREEN_NAME[id], phase: BR_SCREEN_PHASE[id] as Phase, state: onAir === id ? 'onair' : 'off',
    available: l.teams.length > 0 && (!BR_FEED_SCREENS.has(id) || fed(l)),
  }));
  items.splice(4, 0, { id: HUD_ID, label: `HUD · ${HUD_LAYOUT_NAME[look.hud as keyof typeof HUD_LAYOUT_NAME][0]}`, phase: 'ingame', state: 'onair', available: true });
  if (look.hud === 'strip') items.splice(5, 0, { id: 'popup', label: 'Standings pop-up', phase: 'ingame', state: look.popup ? 'onair' : 'off', available: true });
  // Moments come up by themselves from the game: AUTO while switched on.
  if (feed) {
    for (const k of BR_MOMENTS) items.push({ id: `mo:${k}`, label: BR_MOMENT_NAME[k], phase: 'ingame', state: show.moments[k] ? 'auto' : 'off', available: true });
    items.push({ id: 'mo:ltf', label: 'Live top fraggers', phase: 'ingame', state: show.ltf ? 'onair' : 'off', available: true });
  }
  return items;
}

/** A moment: on or off, and how it looks (the HUD with that moment). */
function MomentDetail({ s, run, l, id }: { s: Snapshot; run: Run; l: Lobby; id: string }) {
  const port = s.engine.port ?? 0;
  const show = showOf(l);
  const k = id.slice(3) as BrMomentKind | 'ltf';
  const on = k === 'ltf' ? show.ltf : show.moments[k];
  const name = k === 'ltf' ? 'Live top fraggers' : BR_MOMENT_NAME[k];
  const what = k === 'ltf' ? 'A band with the three players with the most eliminations, on while the match runs.' : BR_MOMENT_WHAT[k];
  const sample = k === 'ltf' ? '&ltf=1' : k === 'team.out' ? '' : `&moment=${k}`;
  return (
    <section className="card cp-detail" aria-label={name}>
      <div className="card-head"><b>{name}</b>
        <span className="row-gap"><span className="t-sm muted">{k === 'ltf' ? (on ? 'On' : 'Off') : on ? 'Comes up by itself' : 'Off'}</span>
          <Switch on={on} label={name} onChange={(v) => void run(() => air.lobbyShow(l.id, k === 'ltf' ? { ltf: v } : { moments: { [k]: v } }))} /></span>
      </div>
      <div className="body-pad stack" style={{ gap: 10 }}>
        <Preview key={id} src={lobbyPage(port, l.code, 'br-hud', `&preview=1${sample}`)} label={name} />
        <p className="muted t-sm">{what}</p>
        <p className="faint t-xs">From the observer PC&rsquo;s data, while Game data is connected. Sample shown.</p>
      </div>
    </section>
  );
}

/** Which match, the day, or which player a post-game graphic shows (the room's `brPick`). */
function PickRow({ run, l, id }: { run: Run; l: Lobby; id: BrScreen }) {
  const pick = showOf(l).pick;
  const games = l.games.filter((g) => g.feed?.stats.length);
  const players = id === 'br-profile' ? playerTotals(games.map((g) => g.feed!)) : [];
  const set = (p: Partial<typeof pick>) => void run(() => air.lobbyShow(l.id, { pick: { ...pick, ...p } }));
  return (
    <div className="row-gap t-sm" style={{ flexWrap: 'wrap' }}>
      {id === 'br-fraggers' && (
        <label className="row-gap">Show
          <select className="cell" aria-label="Match or day" value={pick.scope} onChange={(e) => set({ scope: e.target.value as 'match' | 'day' })}><option value="match">One match</option><option value="day">The whole day</option></select>
        </label>
      )}
      {id !== 'br-profile' && (id !== 'br-fraggers' || pick.scope === 'match') && (
        <label className="row-gap">Match
          <select className="cell" aria-label="Which match" value={pick.game ?? ''} onChange={(e) => set({ game: e.target.value ? Number(e.target.value) : undefined })}>
            <option value="">The last one</option>{games.map((g) => <option key={g.n} value={g.n}>Match {g.n}{g.map ? ` · ${g.map}` : ''}</option>)}
          </select>
        </label>
      )}
      {id === 'br-profile' && (
        <label className="row-gap">Player
          <select className="cell" aria-label="Which player" value={pick.player ?? ''} onChange={(e) => set({ player: e.target.value || undefined })}>
            <option value="">The day&rsquo;s best</option>{players.map((p) => <option key={p.openId || p.name} value={p.name}>{p.name} · {p.kills} elims</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function Copy({ url, label }: { url: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button className="btn quiet small" title={url} onClick={() => void air.copy(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => setDone(false))}>{done ? 'Copied' : label}</button>;
}

function Detail({ s, run, l, item }: { s: Snapshot; run: Run; l: Lobby; item: Item | null }) {
  const port = s.engine.port ?? 0;
  if (!item) return <section className="card cp-detail"><div className="cp-empty muted">Pick a graphic on the left.</div></section>;
  if (item.id.startsWith('mo:')) return <MomentDetail s={s} run={run} l={l} id={item.id} />;
  const look = { hud: 'rail' as const, popup: false, templates: {} as Record<string, string>, ...(l.look ?? {}) };
  if (item.id === HUD_ID || item.id === 'popup') {
    return (
      <section className="card cp-detail" aria-label="HUD">
        <div className="card-head"><b>In-game HUD · {HUD_LAYOUT_NAME[look.hud][0]}</b>
          {look.hud === 'strip' && <button className={`btn small ${look.popup ? '' : 'primary'}`} onClick={() => void run(() => air.lobbyLook(l.id, { popup: !look.popup }))}>{look.popup ? 'Hide standings pop-up' : 'Show standings pop-up'}</button>}
        </div>
        <div className="body-pad stack" style={{ gap: 10 }}>
          <Preview key={`hud-${look.hud}`} src={lobbyPage(port, l.code, 'br-hud', '&screen=1')} label="HUD" />
          <p className="faint t-sm">On whenever the HUD source is in your gameplay scene. The layout is chosen in HUD library; alive marks, knocks and live points arrive with the observer data.</p>
          <div className="row-gap"><Copy url={lobbyPage(port, l.code, 'br-hud')} label="Copy browser source" /></div>
        </div>
      </section>
    );
  }
  const id = item.id as BrScreen;
  const on = item.state === 'onair';
  const graphic = `${id}|full`;
  const looks = s.templates.filter((t) => t.graphic === graphic);
  return (
    <section className="card cp-detail" aria-label={item.label}>
      <div className="card-head"><b>{item.label}</b>
        <span className="row-gap">
          <button className={`btn small ${on ? '' : 'primary'}`} disabled={!item.available} onClick={() => void run(() => air.lobbyTake(l.id, on ? null : id))}>{on ? 'Take off' : 'Put on air'}</button>
        </span>
      </div>
      <div className="body-pad stack" style={{ gap: 10 }}>
        <Preview key={id} src={lobbyPage(port, l.code, 'fullscreen', `&only=${id}&always=1&screen=1`)} label={item.label} />
        <p className="muted t-sm">{BR_SCREEN_WHAT[id]}</p>
        {!l.teams.length && <p className="t-sm">Add the lobby&rsquo;s teams in Events first.</p>}
        {BR_FEED_SCREENS.has(id) && (fed(l) ? <PickRow run={run} l={l} id={id} /> : <p className="t-sm">Comes with the first match saved from the game (connect Game data).</p>)}
        <div className="row-gap" style={{ flexWrap: 'wrap' }}>
          {looks.length > 0 && (
            <label className="row-gap t-sm">Look
              <select className="cell" aria-label={`Look for ${GRAPHICS[graphic]?.title ?? item.label}`} value={look.templates[graphic] ?? ''} onChange={(e) => void run(() => air.lobbyLook(l.id, { templates: { [graphic]: e.target.value } }))}>
                <option value="">Standard look</option>
                {looks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          )}
          <Copy url={lobbyPage(port, l.code, 'fullscreen', `&only=${id}&style=full`)} label="Copy browser source" />
        </div>
      </div>
    </section>
  );
}

function Sources({ s, l, close }: { s: Snapshot; l: Lobby; close: () => void }) {
  const port = s.engine.port ?? 0;
  const rows: Array<[string, string, string]> = [
    ['In-game HUD', 'Over the game, in your gameplay scene', lobbyPage(port, l.code, 'br-hud')],
    ['Full screen', 'Shows whichever full screen is on air', lobbyPage(port, l.code, 'fullscreen')],
    ...BR_SCREENS.map((id): [string, string, string] => [BR_SCREEN_NAME[id], 'Only while it is on air', lobbyPage(port, l.code, 'fullscreen', `&only=${id}&style=full`)]),
  ];
  return (
    <div className="scrim right" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="editor all-graphics" role="dialog" aria-modal="true" aria-label="Browser sources">
        <header><h2 className="title-md">Browser sources</h2><button className="btn quiet small" onClick={close}>Esc</button></header>
        <div className="editor-body stack" style={{ gap: 8 }}>
          <p className="muted t-sm">Paste into an OBS browser source at 1920×1080. They follow {l.title}.</p>
          {rows.map(([label, note, url]) => <div key={url} className="between"><span><b>{label}</b><br /><span className="faint t-xs">{note}</span></span><Copy url={url} label="Copy" /></div>)}
        </div>
      </div>
    </div>
  );
}

export function LobbyLive({ s, run, go }: Pick<PageProps, 's' | 'run' | 'go'>) {
  const l = s.lobbies.find((x) => x.id === s.selectedLobbyId) ?? null;
  const [phase, setPhase] = useState<Phase>('pre');
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState(false);
  const [sources, setSources] = useState(false);
  const [data, setData] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setResults(false); setSources(false); setData(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!l) return <div className="cp"><div className="notice">No lobby on the graphics. <button className="btn fix" onClick={() => go('ready')}>Choose a lobby in Events</button></div></div>;
  const game = gameOf(l.game);
  const word = game?.words?.game ?? 'Match';
  const items = lobbyItems(s, l);
  const inPhase = items.filter((x) => x.phase === phase);
  const sel = items.find((x) => x.id === selected && x.phase === phase) ?? inPhase.find((x) => x.state === 'onair') ?? inPhase[0] ?? null;
  const played = l.games.filter((g) => g.results?.length).length;
  const next = l.games.find((g) => !g.results?.length) ?? null;
  const top = standings(l)[0];
  const leader = top ? l.teams.find((t) => t.id === top.team) : null;
  const port = s.engine.port ?? 0;
  return (
    <div className="cp">
      <div className="cp-bar">
        <div className="cp-teams"><b>{l.title}</b>{l.stage && <span className="muted">{l.stage}</span>}</div>
        <div className="cp-mid">
          <span className="pill">{game?.name ?? 'Lobby'}</span>
          <span>{next ? `${word} ${next.n} of ${l.games.length}${next.map ? ` · ${next.map}` : ''}` : `All ${l.games.length} played`}</span>
          {leader && <span className="muted">Leader <b>{leader.name}</b> · {top!.total}</span>}
          <span className="muted">{played} played</span>
        </div>
        <div className="row-gap">
          <button className={`btn small pcob-btn ${s.pcob.state}`} title="Read the game from the PUBG MOBILE observer client (PCOB)" onClick={() => setData(true)}><i className="dot" />Game data · {pcobLabel(s)}</button>
          <button className="btn small" title="Places and elims per match: from the game, or typed" onClick={() => setResults(true)}>Results</button>
          <button className="btn small" onClick={() => setSources(true)}>Sources</button>
          <span className="br-auto t-sm" title="Runs the lobby's Rundown (Events › lobby › Rundown) from the game"><Switch on={showOf(l).autopilot} label="Autopilot" onChange={(v) => void run(() => air.lobbyShow(l.id, { autopilot: v }))} />Autopilot</span>
          {s.lobbyOnAir && <button className="btn small" onClick={() => void run(() => air.lobbyTake(l.id, null))}>Clear full screen</button>}
        </div>
      </div>
      <div className="cp-cols">
        <GraphicList items={items} phase={phase} setPhase={setPhase} selected={sel?.id ?? null} select={setSelected} keymap={s.keymap} />
        <div className="stack cp-midcol">
          {showOf(l).autopilot && (s.brAuto.running || s.brAuto.next.length > 0) && (
            <div className="notice t-sm" role="status">Autopilot · <b>{s.brAuto.running ?? 'next'}</b>{s.brAuto.next.length > 0 && <span className="muted"> then {s.brAuto.next.join(', ')}</span>}
              <button className="btn quiet small" onClick={() => void run(() => air.lobbyShow(l.id, { autopilot: false }))}>Turn off</button></div>
          )}
          <Detail s={s} run={run} l={l} item={sel} />
          <div className="live-log" aria-live="polite">
            {s.log.slice(0, 3).map((e, i) => <div key={`${e.t}-${i}`}><time className="mono">{new Date(e.t).toLocaleTimeString('en-GB')}</time><span>{e.text}</span></div>)}
          </div>
        </div>
        <aside className="stack cp-right">
          <figure className="gmon onair live-monitor" aria-label="On air graphics">
            <Composite srcs={[lobbyPage(port, l.code, 'br-hud', '&screen=1'), lobbyPage(port, l.code, 'fullscreen', '&screen=1')]} label="Graphics on air" image={null} />
            <figcaption className="mono muted"><span>What viewers see</span><span>{s.lobbyOnAir ? BR_SCREEN_NAME[s.lobbyOnAir as BrScreen] ?? 'Full screen' : 'HUD'}</span></figcaption>
          </figure>
          <p className="faint t-sm">{s.pcob.state === 'live' ? 'Live from the observer PC: alive, knocked, eliminations and live points. The match saves itself when it ends.' : 'Connect Game data to read the observer PC. Until then the HUD shows the standings from Results.'}</p>
        </aside>
      </div>
      {results && (
        <div className="scrim right" onClick={(e) => e.target === e.currentTarget && setResults(false)}>
          <div className="editor match-drawer" role="dialog" aria-modal="true" aria-label="Results">
            <header><h2 className="title-md">{l.title} · Results</h2><button className="btn quiet small" onClick={() => setResults(false)}>Esc</button></header>
            <div className="editor-body"><Results run={run} lobby={l} word={word} goTeams={() => { setResults(false); go('ready'); }} /></div>
          </div>
        </div>
      )}
      {sources && <Sources s={s} l={l} close={() => setSources(false)} />}
      {data && <PcobPanel s={s} run={run} l={l} close={() => setData(false)} />}
    </div>
  );
}
