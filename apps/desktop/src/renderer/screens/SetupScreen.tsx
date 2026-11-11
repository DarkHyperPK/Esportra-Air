import { useEffect, useState } from 'react';
import { BANNER_THEMES, type Setup } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import { SCENE_KEYS, SCENES } from '../../shared/scenes.ts';
import { Cap } from '../components/ui.tsx';
import type { PageProps } from '../App.tsx';
import { PageHeader } from '../components/Chrome.tsx';
import { EventPeople } from '../components/MatchEditors.tsx';

export type SetupTab = 'graphics' | 'brand';

const THEME_NOTES: Record<(typeof BANNER_THEMES)[number], string> = {
  broadcast: 'Full-width round banners. The default.',
  compact: 'Smaller banners that cover less of the game.',
  monument: 'Large centred banners for big moments.',
  impact: 'Bold, high-contrast banners.',
};
const HUD_LABELS: Record<string, string> = {
  scorebug: 'Scorebug', players: 'Player cards',
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
    <div className="grid2" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', alignItems: 'start' }}>
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

function EventAndSponsors({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const event = s.event;
  const [name, setName] = useState(event?.name ?? '');
  useEffect(() => { setName(event?.name ?? ''); }, [event?.id]);
  return (
    <div className="stack" style={{ gap: 16 }}>
      {event && (
        <form style={{ display: 'flex', gap: 8, alignItems: 'flex-end', maxWidth: 480 }} onSubmit={(e) => { e.preventDefault(); void run(() => air.updateEvent(event.id, { name })); }}>
          <label className="field" style={{ flex: 1 }}><span>Event name (on the event bug)</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
          <button className="btn" disabled={name === event.name}>Save</button>
        </form>
      )}
      <EventPeople s={s} run={run} event={event} match={s.match} />
      <p className="muted" style={{ fontSize: 12.5 }}>Sponsors rotate in the sponsor slot (title sponsors most often) and are used by Sponsor read (F8).</p>
    </div>
  );
}

export function SetupScreen({ s, run, go, tab, setTab }: PageProps & { tab: SetupTab; setTab: (t: SetupTab) => void }) {
  const tabs: Array<[SetupTab, string]> = [['graphics', 'Graphics'], ['brand', 'Event and sponsors']];
  return (
    <>
      <PageHeader eyebrow="Match graphics" title={s.match?.title ?? 'No match selected'} actions={<button className="btn" onClick={() => go('ready')}>Back to the match</button>}>
        Which graphics this production uses in OBS and which HUD elements start on. Banner styles and previews are in the Library.
      </PageHeader>
      <div className="tabs" role="tablist" aria-label="Graphics sections">
        {tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'graphics' && <Graphics s={s} run={run} />}
      {tab === 'brand' && <EventAndSponsors s={s} run={run} />}
    </>
  );
}
