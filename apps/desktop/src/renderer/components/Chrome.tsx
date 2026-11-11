import { useEffect, useState, type ReactNode } from 'react';
import type { Page, Snapshot } from '../../shared/api.ts';
import { GAMES } from '../../shared/games.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { ICONS, LOGO } from './ui.tsx';

type RailPage = Exclude<Page, 'setup' | 'settings' | 'outputs'>;

const RAIL: Array<[RailPage, string]> = [
  ['console', 'Live'],
  ['ready', 'Matches'],
  ['event', 'Event'],
  ['library', 'Library'],
  ['scenes', 'OBS'],
  ['capture', 'Capture'],
];

/** What each page is called, for the top bar and the command palette. */
export const PAGE_NAME: Record<Page, string> = {
  console: 'Live', ready: 'Matches', event: 'Event', library: 'Library', scenes: 'OBS scenes', outputs: 'Browser sources',
  capture: 'Capture', settings: 'Settings', setup: 'Match graphics',
};

/** The rail item a page belongs to. */
export const railOf = (page: Page): Page => (page === 'setup' ? 'ready' : page === 'outputs' ? 'scenes' : page);

export type StatusId = 'feed' | 'obs' | 'esportra' | 'graphics';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const zone = () => new Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';

/** Health of each connection: one word and one dot, never colour alone. */
export function statusOf(s: Snapshot): Record<StatusId, { dot: 'ok' | 'warn' | 'bad' | 'off'; label: string; value: string }> {
  const feed = s.feed.state === 'live' ? (s.feed.paused ? 'Paused' : 'Live') : s.feed.state === 'waiting' ? 'Waiting' : s.feed.state === 'unavailable' ? 'Unavailable' : 'Off';
  return {
    feed: { label: 'Game', value: feed, dot: s.feed.state === 'live' && !s.feed.paused ? 'ok' : s.feed.state === 'off' ? 'off' : s.feed.state === 'unavailable' ? 'bad' : 'warn' },
    obs: { label: 'OBS', value: s.obs.state === 'connected' ? 'Connected' : s.obs.state === 'error' ? 'Error' : 'Not connected', dot: s.obs.state === 'connected' ? 'ok' : s.obs.state === 'error' ? 'bad' : 'warn' },
    esportra: { label: 'Esportra', value: s.esportra.state === 'signed-out' ? 'Signed out' : s.esportra.state === 'online' ? 'Signed in' : s.esportra.state === 'offline' ? 'Offline' : 'No access', dot: s.esportra.state === 'online' ? 'ok' : s.esportra.state === 'signed-out' ? 'off' : 'warn' },
    graphics: { label: 'Engine', value: s.engine.state === 'running' ? 'Running' : s.engine.state === 'starting' ? 'Starting' : 'Stopped', dot: s.engine.state === 'running' ? 'ok' : s.engine.state === 'starting' ? 'warn' : 'bad' },
  };
}

/** The game for the whole app: a small menu beside the product name, locked while a show is live. */
function GameSwitcher({ s, run }: { s: Snapshot; run: Run }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent | MouseEvent) => { if (!(e instanceof KeyboardEvent) || e.key === 'Escape') setOpen(false); };
    const t = setTimeout(() => window.addEventListener('click', close));
    window.addEventListener('keydown', close);
    return () => { clearTimeout(t); window.removeEventListener('click', close); window.removeEventListener('keydown', close); };
  }, [open]);
  return (
    <div className="game-switch">
      <button className="game-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{s.game?.name ?? 'Choose a game'}<span aria-hidden="true">▾</span></button>
      {open && (
        <div className="game-menu" role="menu" aria-label="Game for the whole app" onClick={(e) => e.stopPropagation()}>
          <p className="faint">Game for the whole app</p>
          {GAMES.map((g) => (
            <button key={g.id} role="menuitemradio" aria-checked={s.game?.id === g.id} disabled={!g.available || (!!s.gameLocked && s.game?.id !== g.id)} onClick={async () => { if (await run(() => air.chooseGame(g.id))) setOpen(false); }}>
              <span>{g.name}</span><span className="faint">{!g.available ? 'Coming later' : s.game?.id === g.id ? '✓' : ''}</span>
            </button>
          ))}
          <p className="faint">{s.gameLocked ?? 'Each game has its own matches; switching hides the others.'}</p>
        </div>
      )}
    </div>
  );
}

export function TopBar({ s, page, open, search, help, run }: { s: Snapshot | null; page?: Page; open?: (id: StatusId) => void; search?: () => void; help?: () => void; run?: Run }) {
  const now = useClock();
  const status = s ? statusOf(s) : null;
  return (
    <header className="topbar">
      <span className="brand">{LOGO}Esportra Air</span>
      {s && run && <GameSwitcher s={s} run={run} />}
      {page && (
        <nav className="crumbs" aria-label="You are here">
          <span className="sep">/</span>
          <span>{PAGE_NAME[page]}</span>
          {s?.match && <><span className="sep">/</span><b title={s.match.title}>{s.match.title}</b>{s.event?.name && <span className="event">· {s.event.name}</span>}</>}
        </nav>
      )}
      {!page && <span className="spacer" />}
      {status && open && (
        <div className="chips" aria-label="Connections">
          {(Object.keys(status) as StatusId[]).map((id) => (
            <button key={id} className={`chip ${status[id].dot}`} onClick={() => open(id)} aria-label={`${status[id].label}: ${status[id].value}. Details`} title={`${status[id].label}: ${status[id].value}`}>
              <span className={`dot ${status[id].dot}`} /><span className="k">{status[id].label}</span><span className="v">{status[id].value}</span>
            </button>
          ))}
        </div>
      )}
      {search && <button className="search-btn" onClick={search} aria-keyshortcuts="Control+K" aria-label="Search and go to"><span className="label">Search and go to…</span><span className="kbd">Ctrl K</span></button>}
      {help && <button className="icon-btn" onClick={help} aria-label="Keyboard shortcuts" aria-keyshortcuts="?" title="Keyboard shortcuts (?)">?</button>}
      <span className="clock" aria-label="Local time">{now.toLocaleTimeString('en-GB')} {zone()}</span>
    </header>
  );
}

export function Rail({ page, go }: { page: Page; go: (p: Page) => void }) {
  const current = railOf(page);
  return (
    <nav className="rail" aria-label="Main">
      {RAIL.map(([id, label]) => (
        <button key={id} aria-current={current === id ? 'page' : undefined} onClick={() => go(id)}>
          {ICONS[id]}
          {label}
        </button>
      ))}
      <span className="spacer" />
      <button aria-current={current === 'settings' ? 'page' : undefined} onClick={() => go('settings')}>
        {ICONS.setup}
        Settings
      </button>
    </nav>
  );
}

/** Every page opens the same way: what it is, one line on what you do there, and its actions. */
export function PageHeader({ eyebrow, title, children, actions }: { eyebrow?: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="text">
        {eyebrow && <span className="cap">{eyebrow}</span>}
        <h1 className="title-lg">{title}</h1>
        {children && <p className="lead">{children}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}
