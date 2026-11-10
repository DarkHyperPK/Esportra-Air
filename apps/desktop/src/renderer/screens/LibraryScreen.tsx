import { useEffect, useState } from 'react';
import { BANNER_THEMES, type BannerTheme, type Snapshot } from '../../shared/api.ts';
import { gameName } from '../../shared/games.ts';
import { LIBRARY, LIBRARY_GROUPS, type LibraryGroup, type LibraryItem } from '../../shared/library.ts';
import { air } from '../bridge.ts';
import { Cap } from '../components/ui.tsx';
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

function Detail({ s, item, close }: { s: Snapshot; item: LibraryItem; close: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  return (
    <div className="scrim center" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="lib-detail" role="dialog" aria-modal="true" aria-label={item.title}>
        <Preview src={overlayUrl(s, item.overlay)} label={item.title} />
        <div className="lib-detail-meta">
          <div><Cap>{LIBRARY_GROUPS.find(([g]) => g === item.group)?.[1]}</Cap><h2 className="title-md" style={{ marginTop: 6 }}>{item.title}</h2></div>
          <p className="lead">{item.what}</p>
          <dl className="readout"><dt>When</dt><dd style={{ fontFamily: 'var(--font)' }}>{item.when}</dd><dt>In OBS</dt><dd style={{ fontFamily: 'var(--font)' }}>Esportra · {item.scene}</dd></dl>
          <button className="btn" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function LibraryScreen({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const [group, setGroup] = useState<LibraryGroup>('ingame');
  const [open, setOpen] = useState<LibraryItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const game = s.match?.game ?? 'valorant';
  const items = LIBRARY[game].filter((i) => i.group === group);
  const theme = s.match?.theme ?? s.setup.package;
  // The sample room follows the selected match's teams, players and banner style.
  useEffect(() => { void run(() => air.librarySeed()); }, [s.match?.id, theme, s.match?.teams.map((t) => t.name + t.logo + t.color).join()]);
  useEffect(() => () => { void air.libraryPlay(false).catch(() => {}); }, []);
  return (
    <div className="stack" style={{ gap: 22 }}>
      <PageHeader eyebrow={`HUD library · ${gameName(game)}`} title="Esportra Broadcast" actions={<button className={`btn ${playing ? '' : 'primary'}`} onClick={() => void run(() => air.libraryPlay(!playing)).then((ok) => ok && setPlaying(!playing))}>{playing ? 'Stop sample round' : 'Play a sample round'}</button>}>
        Every graphic Air puts on air, live, {s.match ? <>with <b>{s.match.teams[0].name}</b> and <b>{s.match.teams[1].name}</b></> : 'with sample teams'}. Nothing here touches your show.
      </PageHeader>

      <section className="stack" style={{ gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 className="title-sm">Banner style</h2>
          <span className="muted" style={{ fontSize: 12.5 }}>{s.match ? `Used by ${s.match.title}` : 'Choose a match to set its style'}</span>
        </div>
        <BannerStyles s={s} value={theme} onPick={(t) => s.match && void run(() => air.updateMatch(s.match!.id, { theme: t }))} />
      </section>

      <section className="stack" style={{ gap: 12 }}>
        <div className="tabs" role="tablist" aria-label="Graphic groups">
          {LIBRARY_GROUPS.map(([id, label]) => <button key={id} role="tab" aria-selected={group === id} onClick={() => setGroup(id)}>{label} <span className="muted" style={{ marginLeft: 6 }}>{LIBRARY[game].filter((i) => i.group === id).length}</span></button>)}
        </div>
        <div className="lib-grid">
          {items.map((item) => (
            <button key={item.overlay} className="lib-card" onClick={() => setOpen(item)}>
              <Preview src={overlayUrl(s, item.overlay)} label={item.title} />
              <span className="lib-meta"><b>{item.title}</b><span className="muted">{item.what}</span><span className="lib-when">{item.when}</span></span>
            </button>
          ))}
        </div>
      </section>
      {open && <Detail s={s} item={open} close={() => setOpen(null)} />}
    </div>
  );
}

