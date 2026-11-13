import { useEffect, useState } from 'react';
import { BANNER_THEMES, type BannerTheme, type Snapshot } from '../../shared/api.ts';
import { LIBRARY, inShow } from '../../shared/library.ts';
import { PackWindow } from '../components/PackWindow.tsx';
import { air } from '../bridge.ts';
import { Preview, overlayUrl } from '../components/Preview.tsx';
import type { PageProps } from '../App.tsx';
import { PageHeader } from '../components/Chrome.tsx';

const THEME_NOTES: Record<BannerTheme, string> = {
  broadcast: 'Full-width banners. The default.',
  compact: 'Smaller banners that cover less of the game.',
  monument: 'Large centred banners for big moments.',
  impact: 'Bold, high-contrast banners.',
};

/** The four banner styles side by side, each showing the same moment. */
export function BannerStyles({ s, value, onPick }: { s: Snapshot; value: BannerTheme; onPick: (t: BannerTheme) => void }) {
  return (
    <div className="styles-grid" role="radiogroup" aria-label="Banner style">
      {BANNER_THEMES.map((t) => (
        <button key={t} type="button" role="radio" aria-checked={value === t} className="style-card" onClick={() => onPick(t)}>
          <Preview src={overlayUrl(s, 'banners', { hudSettings: JSON.stringify({ bannerTheme: t }) })} label={`${t} banner style`} />
          <span className="style-meta"><b>{t[0]!.toUpperCase() + t.slice(1)}</b><span className="muted">{THEME_NOTES[t]}</span></span>
        </button>
      ))}
    </div>
  );
}

export function LibraryScreen({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const [open, setOpen] = useState(false);
  const game = s.game;
  const items = LIBRARY[game?.id ?? 'valorant'];
  const chosen = items.filter((i) => inShow(s.setup, i)).length;
  const theme = s.match?.theme ?? s.setup.package;
  // The sample room follows the selected match's teams, players and banner style.
  useEffect(() => { void run(() => air.librarySeed()); }, [s.match?.id, theme, s.match?.teams.map((t) => t.name + t.logo + t.color).join()]);
  return (
    <div className="stack" style={{ gap: 26 }}>
      <PageHeader eyebrow={`Library · ${game?.name ?? 'no game chosen'}`} title="Graphics packs">
        Every graphic Air can put on air, live {s.match ? <>with <b>{s.match.teams[0].name}</b> and <b>{s.match.teams[1].name}</b></> : 'with sample teams'}. Open a pack to choose what is in your show.
      </PageHeader>
      <div className="packs">
        <button className="pack-card" onClick={() => setOpen(true)} aria-label={`Open ${game?.pack ?? 'the'} pack`}>
          <Preview src={overlayUrl(s, 'ingame')} label={`${game?.pack ?? 'Graphics'} pack`} />
          <span className="between"><span><b>{game?.pack ?? 'Graphics'}</b><br /><span className="muted t-sm">{items.length} graphics · {chosen} in the show</span></span><span className="state ok"><i className="dot ok" />In use</span></span>
        </button>
        <div className="pack-card soon" aria-hidden="true">
          <div className="pv pv-bg pack-soon"><span className="muted t-sm">More packs later</span></div>
          <span><b>Other packs</b><br /><span className="muted t-sm">Not available yet</span></span>
        </div>
      </div>
      <section className="stack" style={{ gap: 10 }}>
        <div className="between"><h2 className="title-sm">Banner style</h2><span className="muted t-sm">{s.match ? `Used by ${s.match.title}` : 'Choose a match to set its style'}</span></div>
        <BannerStyles s={s} value={theme} onPick={(t) => s.match && void run(() => air.updateMatch(s.match!.id, { theme: t }))} />
      </section>
      {open && <PackWindow s={s} run={run} close={() => setOpen(false)} />}
    </div>
  );
}
