import { useEffect, useState } from 'react';
import { BANNER_THEMES, type Screen, type Setup } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import type { ScreenProps } from '../App.tsx';

export type SetupTab = 'graphics' | 'brand' | 'layout' | 'obs';

const THEME_NOTES: Record<(typeof BANNER_THEMES)[number], string> = {
  broadcast: 'Full-width round banners. The default.',
  compact: 'Smaller banners that cover less of the game.',
  monument: 'Large centred banners for big moments.',
  impact: 'Bold, high-contrast banners.',
};

const HUD_LABELS: Record<string, string> = {
  scorebug: 'Scorebug', players: 'Player cards', killfeed: 'Kill feed', observed: 'Observed player', minimap: 'Minimap frame',
  spikeTimer: 'Spike timer', winProb: 'Win probability', roundHistory: 'Round history', moments: 'Highlight moments',
  sponsor: 'Sponsor slot', eventBug: 'Event bug', ticker: 'Ticker',
};

function Toggle({ label, on, flip }: { label: string; on: boolean; flip: () => void }) {
  return (
    <button className="toggle" aria-pressed={on} onClick={flip}>
      <span>{label}</span>
      <span className="switch" aria-hidden="true" />
    </button>
  );
}

function Graphics({ s, run }: Pick<ScreenProps, 's' | 'run'>) {
  const setup = s.setup;
  const update = (patch: Partial<Setup>) => void run(() => air.updateSetup(patch));
  return (
    <div className="grid-auto-wide">
      <section className="card pad stack">
        <div>
          <h2>Graphics style</h2>
          <p className="sub">How round banners and highlight moments look.</p>
        </div>
        {BANNER_THEMES.map((theme) => (
          <button key={theme} className="choice" aria-pressed={setup.package === theme} onClick={() => update({ package: theme })}>
            <span>
              <strong style={{ textTransform: 'capitalize', display: 'block' }}>{theme}</strong>
              <span className="muted" style={{ fontSize: 13 }}>{THEME_NOTES[theme]}</span>
            </span>
          </button>
        ))}
      </section>
      <section className="card pad stack">
        <div>
          <h2>Broadcast screens</h2>
          <p className="sub">Each screen becomes one scene in OBS.</p>
        </div>
        {setup.screens.map((screen) => (
          <Toggle key={screen.id} label={screen.title} on={screen.enabled} flip={() => update({ screens: setup.screens.map((x) => (x.id === screen.id ? { ...x, enabled: !x.enabled } : x)) })} />
        ))}
      </section>
      <section className="card pad stack">
        <div>
          <h2>In-game HUD</h2>
          <p className="sub">Drawn over gameplay from live game data.</p>
        </div>
        {Object.keys(setup.hud).map((key) => (
          <Toggle key={key} label={HUD_LABELS[key] ?? key} on={setup.hud[key]!} flip={() => update({ hud: { ...setup.hud, [key]: !setup.hud[key] } })} />
        ))}
      </section>
    </div>
  );
}

function Brand({ s, run }: Pick<ScreenProps, 's' | 'run'>) {
  const [name, setName] = useState(s.setup.name);
  const [eventName, setEvent] = useState(s.setup.brand.eventName);
  const [stage, setStage] = useState(s.setup.brand.stage);
  const [sponsor, setSponsor] = useState('');
  const sponsors = s.setup.sponsors;
  return (
    <div className="grid-auto-wide">
      <form className="card pad stack" onSubmit={(e) => { e.preventDefault(); void run(() => air.updateSetup({ name, brand: { eventName, stage } })); }}>
        <h2>Production</h2>
        <label className="field">Production name (in Air only)<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
        <label className="field">Event name (on the event bug)<input value={eventName} onChange={(e) => setEvent(e.target.value)} maxLength={60} placeholder="e.g. Community Cup" /></label>
        <label className="field">Stage (on lower thirds)<input value={stage} onChange={(e) => setStage(e.target.value)} maxLength={60} placeholder="e.g. Playoffs" /></label>
        <p className="muted" style={{ fontSize: 13 }}>Team names, tags and colours belong to each match.</p>
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} type="submit">Save</button>
      </form>
      <section className="card pad stack">
        <div>
          <h2>Sponsors</h2>
          <p className="sub">Rotated in the sponsor slot and used by Sponsor read on Live.</p>
        </div>
        {sponsors.length === 0 && <p className="muted">No sponsors yet.</p>}
        {sponsors.map((name) => (
          <div key={name} className="output-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <strong>{name}</strong>
            <button className="btn quiet small" onClick={() => void run(() => air.updateSetup({ sponsors: sponsors.filter((x) => x !== name) }))}>Remove</button>
          </div>
        ))}
        <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await run(() => air.updateSetup({ sponsors: [...sponsors, sponsor] }))) setSponsor(''); }}>
          <label className="field" style={{ flex: 1 }}><span className="sr-only">Sponsor name</span><input value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="Sponsor name" maxLength={40} /></label>
          <button className="btn" type="submit" disabled={!sponsor.trim()}>Add sponsor</button>
        </form>
      </section>
    </div>
  );
}

function Layout({ s, run }: Pick<ScreenProps, 's' | 'run'>) {
  const [screens, setScreens] = useState<Screen[]>(s.setup.screens);
  const [selected, setSelected] = useState(s.setup.screens.find((x) => x.gameplay)?.id ?? s.setup.screens[0]!.id);
  const [minimap, setMinimap] = useState(s.setup.minimap);
  useEffect(() => setScreens(s.setup.screens), [s.setup.screens]);
  const dirty = JSON.stringify(screens) !== JSON.stringify(s.setup.screens) || JSON.stringify(minimap) !== JSON.stringify(s.setup.minimap);
  const set = (id: string, patch: Partial<Screen>) => setScreens(screens.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const frame = (id: string, key: keyof Screen['frame'], value: string) => {
    const screen = screens.find((x) => x.id === id)!;
    set(id, { frame: { ...screen.frame, [key]: Math.round(Number(value) || 0) } });
  };
  const move = (i: number, d: number) => {
    const next = screens.slice();
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setScreens(next);
  };
  const current = screens.find((x) => x.id === selected) ?? screens[0]!;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="split">
      <section className="main card pad stack">
        <div>
          <h2>Screens: order, names and placement</h2>
          <p className="sub">The order and names of Air’s OBS scenes, and where each graphic sits on the 1920 × 1080 canvas. Renaming a screen creates a new scene on the next install.</p>
        </div>
        <div className="screen-row screen-head" aria-hidden="true">
          <span />
          <span>Name</span>
          <span>X</span>
          <span>Y</span>
          <span>Width</span>
          <span>Height</span>
          <span />
        </div>
        {screens.map((screen, i) => (
          <div className="screen-row" key={screen.id} onFocus={() => setSelected(screen.id)}>
            <span className="mono muted">{i + 1}</span>
            <input className="cell" aria-label={`Screen ${i + 1} name`} value={screen.title} maxLength={40} onChange={(e) => set(screen.id, { title: e.target.value })} />
            {(['x', 'y', 'width', 'height'] as const).map((k) => (
              <input className="cell" key={k} type="number" aria-label={`${screen.title} ${k}`} value={screen.frame[k]} onChange={(e) => frame(screen.id, k, e.target.value)} />
            ))}
            <span className="row" style={{ gap: 2 }}>
              <button className="btn quiet small" aria-label={`Move ${screen.title} up`} onClick={() => move(i, -1)}>↑</button>
              <button className="btn quiet small" aria-label={`Move ${screen.title} down`} onClick={() => move(i, 1)}>↓</button>
            </span>
          </div>
        ))}
      </section>
      <section className="side stack">
        <div className="card pad stack">
          <h2>{current.title}</h2>
          <div className="canvas-preview" aria-label={`Placement of ${current.title}`}>
            <span className="frame" style={{ left: pct(current.frame.x, 1920), top: pct(current.frame.y, 1080), width: pct(current.frame.width, 1920), height: pct(current.frame.height, 1080) }}>{current.frame.width} × {current.frame.height}</span>
          </div>
          {current.gameplay && <p className="muted" style={{ fontSize: 13 }}>Gameplay from your OBS game capture sits underneath this screen.</p>}
        </div>
        <div className="card pad stack">
          <h2>Minimap frame</h2>
          <p className="sub">Position and size of the minimap border on the in-game screen.</p>
          <div className="field-row three">
            {(['x', 'y', 'size'] as const).map((k) => (
              <label className="field" key={k}>{k === 'size' ? 'Size' : k.toUpperCase()}<input type="number" value={minimap[k]} onChange={(e) => setMinimap({ ...minimap, [k]: Math.round(Number(e.target.value) || 0) })} /></label>
            ))}
          </div>
        </div>
        <div className="row">
          <button className="btn primary" disabled={!dirty} onClick={() => void run(() => air.updateSetup({ screens, minimap }))}>Save layout</button>
          <button className="btn quiet" disabled={!dirty} onClick={() => { setScreens(s.setup.screens); setMinimap(s.setup.minimap); }}>Discard</button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Saved layout reaches OBS the next time you install or update graphics.</p>
      </section>
    </div>
  );
}

function Obs({ s, run }: Pick<ScreenProps, 's' | 'run'>) {
  const [host, setHost] = useState(s.setup.obs.host);
  const [port, setPort] = useState(String(s.setup.obs.port));
  const [password, setPassword] = useState('');
  const connected = s.obs.state === 'connected';
  return (
    <div className="split">
      <section className="side card pad stack">
        <div>
          <h2>Connect to OBS</h2>
          <p className="sub">In OBS: Tools › WebSocket Server Settings. Air adds its own scenes and reads what is on air. It never switches scenes.</p>
        </div>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void run(() => air.connectObs({ host, port: Number(port), password })); }}>
          <div className="field-row">
            <label className="field">Address<input value={host} onChange={(e) => setHost(e.target.value)} required /></label>
            <label className="field">Port<input type="number" value={port} onChange={(e) => setPort(e.target.value)} required /></label>
          </div>
          <label className="field">Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" placeholder={connected ? 'Saved' : ''} /></label>
          {connected ? (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="row" style={{ color: 'var(--ok)', fontWeight: 600 }}><span className="dot ok" />Connected to OBS {s.obs.version}</span>
              <button type="button" className="btn quiet" onClick={() => void run(() => air.disconnectObs())}>Disconnect</button>
            </div>
          ) : (
            <>
              {s.obs.error && <p style={{ color: 'var(--bad)', fontSize: 14 }}>{s.obs.error}</p>}
              <button className="btn primary" style={{ alignSelf: 'flex-start' }} type="submit">{s.obs.state === 'connecting' ? 'Connecting…' : 'Connect'}</button>
            </>
          )}
        </form>
        {connected && (
          <label className="field">
            Gameplay source (under the in-game screen)
            <select value={s.setup.obs.gameplaySource ?? ''} onChange={(e) => void run(() => air.updateSetup({ obs: { ...s.setup.obs, gameplaySource: e.target.value || null } }))}>
              <option value="">None — I’ll add gameplay myself</option>
              {s.obs.videoInputs.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
      </section>
      <section className="main card pad stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2>Graphics in OBS</h2>
            <p className="sub">{s.obs.installed ? 'Installed. Update after changing screens or layout; your own scenes are never touched.' : 'One scene per screen, added to your current scene collection.'}</p>
          </div>
          <button className={`btn ${s.obs.installed ? '' : 'primary'}`} disabled={!connected} onClick={() => void run(() => air.installGraphics())}>
            {s.obs.installed ? 'Update graphics in OBS' : 'Install graphics in OBS'}
          </button>
        </div>
        {s.outputs.map((o) => {
          const inObs = !s.obs.missingScenes.includes(`Air · ${o.title}`) && connected;
          const health = o.connections > 0 ? 'ok' : inObs ? 'warn' : 'off';
          return (
            <div className="output-row" key={o.screenId}>
              <span className={`dot ${health}`} aria-hidden="true" />
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block' }}>Air · {o.title}</strong>
                <span className="url">{o.url}</span>
              </span>
              <span className="row" style={{ gap: 10 }}>
                <span className="muted" style={{ fontSize: 13 }}>{o.connections > 0 ? 'Loading in OBS' : inObs ? 'In OBS · not loaded' : 'Not installed'}</span>
                <button className="btn quiet small" onClick={() => void run(() => air.copy(o.url))}>Copy URL</button>
              </span>
            </div>
          );
        })}
        <p className="muted" style={{ fontSize: 13 }}>Using vMix or adding sources by hand? Add each URL as a 1920 × 1080 browser input. URLs stay the same for every match.</p>
      </section>
    </div>
  );
}

export function SetupScreen({ s, run, go, tab, setTab }: ScreenProps & { tab: SetupTab; setTab: (t: SetupTab) => void }) {
  const tabs: Array<[SetupTab, string, boolean]> = [
    ['graphics', 'Graphics', true],
    ['brand', 'Brand', true],
    ['layout', 'Layout', true],
    ['obs', 'OBS', s.obs.installed],
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Production setup · done once, used for every match</p>
          <h1>{s.setup.name}</h1>
        </div>
        <button className="btn primary" onClick={() => go('match')}>Back to match day →</button>
      </div>
      <div className="tabs" role="tablist" aria-label="Setup sections">
        {tabs.map(([id, label, ok]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
            <span className={`dot ${ok ? 'ok' : 'warn'}`} style={{ width: 7, height: 7 }} aria-hidden="true" />
          </button>
        ))}
      </div>
      {tab === 'graphics' && <Graphics s={s} run={run} />}
      {tab === 'brand' && <Brand s={s} run={run} />}
      {tab === 'layout' && <Layout s={s} run={run} />}
      {tab === 'obs' && <Obs s={s} run={run} />}
    </>
  );
}
