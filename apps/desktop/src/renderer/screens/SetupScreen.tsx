import { useEffect, useState } from 'react';
import { BANNER_THEMES, type Screen, type Setup } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import { SCENE_KEYS, SCENES } from '../../shared/scenes.ts';
import { Cap } from '../components/ui.tsx';
import type { PageProps } from '../App.tsx';

export type SetupTab = 'graphics' | 'brand' | 'layout';

const THEME_NOTES: Record<(typeof BANNER_THEMES)[number], string> = {
  broadcast: 'Full-width round banners. The default.',
  compact: 'Smaller banners that cover less of the game.',
  monument: 'Large centred banners for big moments.',
  impact: 'Bold, high-contrast banners.',
};
const HUD_LABELS: Record<string, string> = {
  scorebug: 'Scorebug', players: 'Player cards', killfeed: 'Kill feed', observed: 'Observed player', minimap: 'Minimap frame',
  spikeTimer: 'Spike timer', winProb: 'Win probability (estimate)', roundHistory: 'Round history', moments: 'Highlight moments',
  sponsor: 'Sponsor slot', eventBug: 'Event bug', ticker: 'Ticker',
};

function Toggle({ label, on, flip }: { label: string; on: boolean; flip: () => void }) {
  return (
    <button className="toggle-row" role="switch" aria-checked={on} onClick={flip}>
      <span>{label}</span>
      <span className="switch" aria-checked={on} />
    </button>
  );
}

function Graphics({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const setup = s.setup;
  const update = (patch: Partial<Setup>) => void run(() => air.updateSetup(patch));
  return (
    <div className="grid2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'start' }}>
      <section className="panel"><div className="head"><Cap>Banner style</Cap></div><div className="body-pad stack" style={{ gap: 8 }}>
        {BANNER_THEMES.map((theme) => (
          <button key={theme} className="choice" aria-pressed={setup.package === theme} onClick={() => update({ package: theme })}>
            <b style={{ textTransform: 'capitalize' }}>{theme}</b><br /><span className="muted" style={{ fontSize: 12 }}>{THEME_NOTES[theme]}</span>
          </button>
        ))}
      </div></section>
      <section className="panel"><div className="head"><Cap>Graphics in OBS</Cap></div><div className="body-pad" style={{ padding: '10px 0 8px' }}>
        {SCENE_KEYS.map((key) => (
          <div key={key}>
            <p className="cap" style={{ padding: '8px 12px 2px' }}>{SCENES[key].label}</p>
            {setup.screens.filter((x) => x.scene === key).map((screen) => <Toggle key={screen.id} label={screen.title} on={screen.enabled} flip={() => update({ screens: setup.screens.map((x) => (x.id === screen.id ? { ...x, enabled: !x.enabled } : x)) })} />)}
          </div>
        ))}
      </div></section>
      <section className="panel"><div className="head"><Cap>In-game HUD</Cap></div><div className="body-pad" style={{ padding: '10px 0 8px' }}>
        {Object.keys(setup.hud).map((key) => <Toggle key={key} label={HUD_LABELS[key] ?? key} on={setup.hud[key]!} flip={() => update({ hud: { ...setup.hud, [key]: !setup.hud[key] } })} />)}
      </div></section>
    </div>
  );
}

function Brand({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const [name, setName] = useState(s.setup.name);
  const [eventName, setEvent] = useState(s.setup.brand.eventName);
  const [stage, setStage] = useState(s.setup.brand.stage);
  const [sponsor, setSponsor] = useState('');
  const sponsors = s.setup.sponsors;
  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <form className="panel body-pad stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); void run(() => air.updateSetup({ name, brand: { eventName, stage } })); }}>
        <Cap>Production</Cap>
        <label className="field"><span>Production name (in Air only)</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
        <label className="field"><span>Event name (on the event bug)</span><input value={eventName} onChange={(e) => setEvent(e.target.value)} maxLength={60} placeholder="e.g. Community Cup" /></label>
        <label className="field"><span>Stage (on lower thirds)</span><input value={stage} onChange={(e) => setStage(e.target.value)} maxLength={60} placeholder="e.g. Playoffs" /></label>
        <p className="muted" style={{ fontSize: 12.5 }}>Team names, tags and colours belong to each match.</p>
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} type="submit">Save</button>
      </form>
      <section className="panel body-pad stack" style={{ gap: 10 }}>
        <Cap>Sponsors</Cap>
        <p className="muted" style={{ fontSize: 12.5 }}>Rotated in the sponsor slot and used by Sponsor read (F8).</p>
        {sponsors.length === 0 && <p className="muted">No sponsors yet.</p>}
        {sponsors.map((n) => <div key={n} className="row-item" style={{ border: '1px solid var(--hair)' }}><b>{n}</b><button className="btn quiet small" onClick={() => void run(() => air.updateSetup({ sponsors: sponsors.filter((x) => x !== n) }))}>Remove</button></div>)}
        <form style={{ display: 'flex', gap: 8 }} onSubmit={async (e) => { e.preventDefault(); if (await run(() => air.updateSetup({ sponsors: [...sponsors, sponsor] }))) setSponsor(''); }}>
          <input className="cell" aria-label="Sponsor name" value={sponsor} onChange={(e) => setSponsor(e.target.value)} placeholder="Sponsor name" maxLength={40} />
          <button className="btn" type="submit" disabled={!sponsor.trim()}>Add</button>
        </form>
      </section>
    </div>
  );
}

function Layout({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const [screens, setScreens] = useState<Screen[]>(s.setup.screens);
  const [selected, setSelected] = useState(s.setup.screens.find((x) => x.id === 'in-game')?.id ?? s.setup.screens[0]!.id);
  const [minimap, setMinimap] = useState(s.setup.minimap);
  useEffect(() => setScreens(s.setup.screens), [s.setup.screens]);
  const dirty = JSON.stringify(screens) !== JSON.stringify(s.setup.screens) || JSON.stringify(minimap) !== JSON.stringify(s.setup.minimap);
  const set = (id: string, patch: Partial<Screen>) => setScreens(screens.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const frame = (id: string, key: keyof Screen['frame'], value: string) => set(id, { frame: { ...screens.find((x) => x.id === id)!.frame, [key]: Math.round(Number(value) || 0) } });
  const current = screens.find((x) => x.id === selected) ?? screens[0]!;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px' }}>
      <section className="panel body-pad">
        <Cap>Graphics · placement</Cap>
        <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 12px' }}>Where each graphic sits in its OBS scene on the 1920 × 1080 canvas. Saved placement reaches OBS when you rebuild the scenes.</p>
        <div className="screen-row screen-head" aria-hidden="true"><span /><span>Graphic</span><span>X</span><span>Y</span><span>Width</span><span>Height</span></div>
        {SCENE_KEYS.map((key) => (
          <div key={key}>
            <p className="cap" style={{ margin: '12px 0 6px' }}>{SCENES[key].label}</p>
            {screens.filter((x) => x.scene === key).map((screen) => (
              <div className="screen-row" key={screen.id} onFocus={() => setSelected(screen.id)}>
                <span />
                <span>{screen.title}</span>
                {(['x', 'y', 'width', 'height'] as const).map((k) => <input className="cell" key={k} type="number" aria-label={`${screen.title} ${k}`} value={screen.frame[k]} onChange={(e) => frame(screen.id, k, e.target.value)} />)}
              </div>
            ))}
          </div>
        ))}
      </section>
      <div className="stack">
        <section className="panel body-pad stack" style={{ gap: 10 }}>
          <Cap>{current.title}</Cap>
          <div className="frame-prev" aria-label={`Placement of ${current.title}`}><span className="frame" style={{ left: pct(current.frame.x, 1920), top: pct(current.frame.y, 1080), width: pct(current.frame.width, 1920), height: pct(current.frame.height, 1080) }}>{current.frame.width} × {current.frame.height}</span></div>
        </section>
        <section className="panel body-pad stack" style={{ gap: 10 }}>
          <Cap>Minimap frame</Cap>
          <div className="grid3">{(['x', 'y', 'size'] as const).map((k) => <label className="field" key={k}><span>{k === 'size' ? 'Size' : k.toUpperCase()}</span><input type="number" value={minimap[k]} onChange={(e) => setMinimap({ ...minimap, [k]: Math.round(Number(e.target.value) || 0) })} /></label>)}</div>
        </section>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" disabled={!dirty} onClick={() => void run(() => air.updateSetup({ screens, minimap }))}>Save layout</button>
          <button className="btn quiet" disabled={!dirty} onClick={() => { setScreens(s.setup.screens); setMinimap(s.setup.minimap); }}>Discard</button>
        </div>
        <p className="muted" style={{ fontSize: 12.5 }}>Saved layout reaches OBS the next time you rebuild the scenes.</p>
      </div>
    </div>
  );
}

export function SetupScreen({ s, run, tab, setTab }: PageProps & { tab: SetupTab; setTab: (t: SetupTab) => void }) {
  const tabs: Array<[SetupTab, string]> = [['graphics', 'Graphics'], ['brand', 'Brand'], ['layout', 'Layout']];
  return (
    <>
      <div style={{ marginBottom: 14 }}><Cap>Production setup · done once, used for every match</Cap><h1 className="title-lg" style={{ marginTop: 8 }}>{s.setup.name}</h1></div>
      <div className="tabs" role="tablist" aria-label="Setup sections">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'graphics' && <Graphics s={s} run={run} />}
      {tab === 'brand' && <Brand s={s} run={run} />}
      {tab === 'layout' && <Layout s={s} run={run} />}
    </>
  );
}
