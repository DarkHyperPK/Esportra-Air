// The pack window (approved mock): every graphic of the pack in a list with filters, a large live
// preview with your own teams, and what it is, when it is used, where it goes in OBS, and whether it
// is in the show: screens in the selected match's Rundown, HUD parts switched for the production.
import { useEffect, useMemo, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { LIBRARY, LIBRARY_GROUPS, inShow, showLink, showPatch, type LibraryGroup, type LibraryItem } from '../../shared/library.ts';
import { defaultSection } from '../../shared/autopilot.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { useEscape } from './Dialogs.tsx';
import { Preview, overlayUrl } from './Preview.tsx';
import { BAND_SCREENS, bandOverlay } from '../../shared/look.ts';

type Filter = 'all' | 'mine' | LibraryGroup;

export function PackWindow({ s, run, close, start }: { s: Snapshot; run: Run; close: () => void; start?: string }) {
  const ref = useEscape(close);
  const items = LIBRARY[s.game?.id ?? 'valorant'];
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>(start ?? items[0]?.overlay ?? '');
  const [playing, setPlaying] = useState(false);
  const shown = useMemo(() => items.filter((i) =>
    (filter === 'all' || (filter === 'mine' ? inShow(s.setup, i) : i.group === filter))
    && (!query.trim() || `${i.title} ${i.what}`.toLowerCase().includes(query.trim().toLowerCase()))), [items, filter, query, s.setup]);
  const item = items.find((i) => i.overlay === selected) ?? shown[0] ?? null;
  useEffect(() => () => { void air.libraryPlay(false).catch(() => {}); }, []);
  // Arrow keys move through the list (when not typing in the search box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!['ArrowDown', 'ArrowUp'].includes(e.key) || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.preventDefault();
      const i = shown.findIndex((x) => x.overlay === item?.overlay);
      const next = shown[Math.min(shown.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) setSelected(next.overlay);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, item?.overlay]);
  const [band, setBand] = useState(false);
  const filters: Array<[Filter, string]> = [['all', 'All'], ...LIBRARY_GROUPS, ['mine', 'In the show']];
  return (
    <div className="scrim center" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="pack" role="dialog" aria-modal="true" aria-label={`${s.game?.pack ?? 'Graphics'} pack`} ref={ref}>
        <header>
          <b>{s.game?.pack ?? 'Graphics'}</b><span className="muted t-sm">{items.length} graphics</span>
          <span className="spacer" />
          <div className="chips-row" role="group" aria-label="Show">{filters.map(([f, label]) => <button key={f} className="fchip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{label}</button>)}</div>
          <button className="btn quiet small" onClick={close}>Esc · Close</button>
        </header>
        <div className="pack-body">
          <div className="pack-list">
            <input className="cell" aria-label="Search graphics" placeholder="Search graphics…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div role="listbox" aria-label="Graphics">
              {shown.map((i) => (
                <button key={i.overlay} role="option" aria-selected={item?.overlay === i.overlay} onClick={() => setSelected(i.overlay)}>
                  <span>{i.title}</span>{inShow(s.setup, i) && <span className="faint t-xs">{showLink(i).kind === 'always' ? 'Always' : 'In the show'}</span>}
                </button>
              ))}
              {shown.length === 0 && <p className="muted t-sm" style={{ padding: 10 }}>Nothing matches.</p>}
            </div>
          </div>
          <div className="pack-stage">
            {item && BAND_SCREENS.has(item.overlay) && (
              <div className="seg" role="tablist" aria-label="Look">
                <button role="tab" aria-selected={!band} aria-pressed={!band} onClick={() => setBand(false)}>Full screen</button>
                <button role="tab" aria-selected={band} aria-pressed={band} onClick={() => setBand(true)}>Over the game</button>
              </div>
            )}
            {item && <Preview key={`${item.overlay}-${band}`} src={overlayUrl(s, band && BAND_SCREENS.has(item.overlay) ? bandOverlay(item.overlay) : item.overlay)} label={item.title} />}
            <button className="btn small" onClick={() => void run(() => air.libraryPlay(!playing)).then((ok) => ok && setPlaying(!playing))}>{playing ? 'Stop the sample round' : 'Play a sample round'}</button>
          </div>
          {item && <Details s={s} run={run} item={item} />}
        </div>
      </div>
    </div>
  );
}

function Details({ s, run, item }: { s: Snapshot; run: Run; item: LibraryItem }) {
  const link = showLink(item);
  // A screen is in the show when it is in this match's Rundown (HUD parts stay switches of the HUD).
  const screen = link.kind === 'screen' ? s.setup.screens.find((x) => x.overlay === link.overlay) ?? null : null;
  const rows = screen ? s.rundown.filter((r) => r.show === screen.id) : [];
  const on = screen ? rows.length > 0 : inShow(s.setup, item);
  const patch = link.kind === 'hud' ? showPatch(s.setup, item, !on) : null;
  const toggle = async () => {
    if (patch) return void run(() => air.updateSetup(patch));
    if (!screen) return;
    if (on) return void run(async () => { for (const r of rows) await air.rundownRemove(r.id); });
    void run(() => air.rundownSave({ section: defaultSection(screen.id), show: screen.id, trigger: 'manual', map: 'every', forSeconds: 0, delaySeconds: 12, transition: 'stinger', holdMode: 'manual', holdSeconds: 0 }));
  };
  return (
    <aside className="pack-details">
      <b className="title-sm">{item.title}</b>
      <span className="muted t-sm">{item.what}</span>
      <dl className="pack-facts">
        <dt>When</dt><dd>{item.when}</dd>
        <dt>In OBS</dt><dd>{item.scene}</dd>
        <dt>With</dt><dd>{s.match ? `${s.match.teams[0].name} and ${s.match.teams[1].name}` : 'Sample teams'}{s.event ? `, ${s.event.name}` : ''}</dd>
      </dl>
      <span className="spacer" />
      {link.kind === 'always'
        ? <span className="muted t-sm">Always in the HUD. It appears when it is needed.</span>
        : link.kind === 'screen' && !s.match
          ? <button className="btn" disabled>Open a match first</button>
          : <button className={`btn ${on ? '' : 'primary'}`} aria-pressed={on} onClick={() => void toggle()}>{on ? (link.kind === 'screen' ? 'In the Rundown ✓ · Remove' : 'In the HUD ✓ · Remove') : link.kind === 'screen' ? 'Add to this match’s Rundown' : 'Add to the HUD'}</button>}
      <span className="faint t-xs">{link.kind === 'screen' ? (s.match ? `Adds it to ${s.match.title}. Set when it comes up in the match’s Rundown.` : 'Screens go in a match’s Rundown.') : 'HUD parts are switched for the whole production.'}</span>
    </aside>
  );
}
