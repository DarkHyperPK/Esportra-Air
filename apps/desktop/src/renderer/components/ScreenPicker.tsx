// New match › Screens: every screen with a live preview, ticked or not. What is ticked becomes the
// match's Rundown (rowsForScreens in the main process), with the starting point's rules.
import { useState } from 'react';
import type { BannerTheme, Snapshot } from '../../shared/api.ts';
import type { Preset } from '../../shared/autopilot.ts';
import { BANNER_THEMES } from '../../shared/api.ts';
import { Preview, screenUrl, StillPreview, stillKey } from './Preview.tsx';
import { BAND_SCREENS } from '../../shared/look.ts';

export interface PickScreen { id: string; overlay: string; title: string; when: string; yours?: boolean }

export const SCREEN_GROUPS: Array<{ label: string; hint: string; screens: PickScreen[] }> = [
  { label: 'Before the match', hint: 'Starting soon, the intro, the veto and agent select', screens: [
    { id: 'holding', overlay: 'holding', title: 'Starting soon', when: 'Its own OBS scene' },
    { id: 'match-intro', overlay: 'match-intro', title: 'Match intro', when: 'Before map 1' },
    { id: 'map-veto', overlay: 'map-veto', title: 'Map veto', when: 'After the veto' },
    { id: 'agent-select', overlay: 'agent-select', title: 'Agent select', when: 'While players lock in' },
    { id: 'schedule', overlay: 'schedule', title: 'Today’s schedule', when: 'Before or between' },
    { id: 'bracket', overlay: 'bracket', title: 'Bracket', when: 'Before or between' },
  ] },
  { label: 'During the game', hint: 'Always on while rounds are played', screens: [
    { id: 'in-game', overlay: 'ingame', title: 'In-game HUD', when: 'Scorebug, cards, banners' },
  ] },
  { label: 'Between maps', hint: 'Autopilot puts these up on the moment (halftime, map end)', screens: [
    { id: 'halftime', overlay: 'halftime', title: 'Halftime', when: 'After round 12' },
    { id: 'map-result', overlay: 'map-result', title: 'Map result', when: 'When a map ends' },
    { id: 'map-breakdown', overlay: 'map-breakdown', title: 'Map breakdown', when: 'After a map' },
    { id: 'postgame-player', overlay: 'postgame-player', title: 'Player of the map', when: 'On Take' },
    { id: 'postgame-matchup', overlay: 'postgame-matchup', title: 'Matchup', when: 'On Take' },
    { id: 'series', overlay: 'series', title: 'Series', when: 'Between maps' },
    { id: 'standings', overlay: 'standings', title: 'Standings', when: 'On Take' },
    { id: 'player-profile', overlay: 'player-profile', title: 'Player profile', when: 'On Take' },
    { id: 'cam-grid', overlay: 'cam-grid', title: 'Player cams', when: 'On Take' },
    { id: 'casters', overlay: 'casters', title: 'Desk', when: 'Its own OBS scene' },
  ] },
  { label: 'After the series', hint: '', screens: [
    { id: 'champion', overlay: 'champion', title: 'Winner', when: 'When a team wins the series' },
  ] },
];

export { START_POINTS, startPoint, type StartPoint } from '../../shared/show-templates.ts';
import type { StartPoint } from '../../shared/show-templates.ts';
import { START_POINTS } from '../../shared/show-templates.ts';

const THEME_LABEL: Record<BannerTheme, string> = { broadcast: 'Broadcast', compact: 'Compact', monument: 'Monument', impact: 'Impact' } as Record<BannerTheme, string>;

export function ScreenPicker({ s, picked, onPick, point, onPoint, theme, onTheme, bands = [], onBands }: {
  s: Snapshot; picked: string[]; onPick: (ids: string[]) => void; point: StartPoint | null; onPoint: (p: StartPoint) => void; theme: BannerTheme; onTheme: (t: BannerTheme) => void;
  /** Screens shown as an overlay bar over the game instead of full screen. */
  bands?: string[]; onBands?: (ids: string[]) => void;
}) {
  const [big, setBig] = useState<PickScreen | null>(null);
  const on = new Set(picked);
  // Your design for a screen replaces it: ticking one unticks the built-in screen (and the other way round).
  const replaces = (id: string) => (id.startsWith('own:') ? s.ownGraphics.find((o) => `own:${o.id}` === id)?.purpose ?? null : null);
  const toggle = (id: string) => {
    if (on.has(id)) return onPick(picked.filter((x) => x !== id));
    const builtin = replaces(id);
    const mine = s.ownGraphics.filter((o) => o.purpose === id).map((o) => `own:${o.id}`);
    onPick([...picked.filter((x) => x !== builtin && !mine.includes(x)), id]);
  };
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="pick-head">
        <span className="faint t-sm">Start from</span>
        <div className="row-gap" role="group" aria-label="Start from">
          {START_POINTS.map(([id, label]) => <button key={id} type="button" className={`pick-chip ${point === id ? 'on' : ''}`} aria-pressed={point === id} onClick={() => onPoint(id)}>{label}</button>)}
        </div>
        <span className="pick-sum"><b>{picked.length} screen{picked.length === 1 ? '' : 's'}</b> in this match · Rehearse plays them in show order</span>
      </div>
      {SCREEN_GROUPS.map((g0) => {
        // Your own graphics sit next to the built-in screen they stand for ("Anything": between maps).
        const own = s.ownGraphics.filter((o) => (o.purpose === 'any' ? g0.label === 'Between maps' : g0.screens.some((x) => x.id === o.purpose)))
          .map((o) => ({ id: `own:${o.id}`, overlay: 'own', title: o.name, when: o.purpose === 'any' ? 'On Take' : `Instead of ${g0.screens.find((x) => x.id === o.purpose)?.title ?? 'it'}`, yours: true }));
        const g = { ...g0, screens: [...g0.screens, ...own] };
        return (
        <section key={g.label} className="stack" style={{ gap: 10 }} aria-label={g.label}>
          <div className="pick-group"><h4>{g.label}</h4>{g.hint && <span className="faint t-sm">{g.hint}</span>}</div>
          <div className="pick-grid">
            {g.screens.map((x) => {
              const fixed = x.id === 'in-game';
              const ticked = fixed || on.has(x.id);
              return (
                <div key={x.id} className={`pick ${ticked ? 'on' : ''}`}>
                  <button type="button" className="pick-hit" role="checkbox" aria-checked={ticked} aria-label={x.title} disabled={fixed} onClick={() => toggle(x.id)}>
                    <StillPreview src={screenUrl(s, x.id, x.overlay)} label={x.title} stamp={stillKey(s)} />
                    <span className="pick-tick" aria-hidden>✓</span>
                    {x.yours && <span className="pick-badge pick-yours">Yours</span>}
                    <span className="pick-meta"><b>{x.title}</b><span className="faint">{x.when}</span></span>
                  </button>
                  {fixed ? <span className="pick-badge">Always</span> : <button type="button" className="pick-eye" onClick={() => setBig(x)}>Preview</button>}
                  {ticked && onBands && BAND_SCREENS.has(x.id) && (
                    <div className="seg pick-look" role="radiogroup" aria-label={`${x.title}: look`}>
                      {([['full', 'Full screen'], ['band', 'Overlay bar']] as const).map(([v, label]) => {
                        const sel = (v === 'band') === bands.includes(x.id);
                        return <button key={v} type="button" role="radio" aria-checked={sel} aria-pressed={sel} onClick={() => onBands(v === 'band' ? [...new Set([...bands, x.id])] : bands.filter((b) => b !== x.id))}>{label}</button>;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {g.label === 'During the game' && (
              <div className="pick-style">
                <span className="muted t-sm">Banner style</span>
                <div className="seg" role="radiogroup" aria-label="Banner style">
                  {BANNER_THEMES.map((t) => <button key={t} type="button" role="radio" aria-checked={theme === t} aria-pressed={theme === t} onClick={() => onTheme(t)}>{THEME_LABEL[t] ?? t}</button>)}
                </div>
                <span className="faint t-xs">Ace, clutch and round-win banners. Each HUD part has its own switch in the Rundown.</span>
              </div>
            )}
          </div>
        </section>
        );
      })}
      {big && (
        <div className="pick-big" role="dialog" aria-label={`Preview: ${big.title}`} onClick={() => setBig(null)}>
          <div className="pick-big-in" onClick={(e) => e.stopPropagation()}>
            <div className="between"><b>{big.title}</b><button type="button" className="btn quiet small" onClick={() => setBig(null)}>Close</button></div>
            <Preview src={screenUrl(s, big.id, big.overlay)} label={big.title} />
            <span className="faint t-sm">Sample data, with this match’s teams once it exists.</span>
          </div>
        </div>
      )}
    </div>
  );
}
