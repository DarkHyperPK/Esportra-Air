import type { ReactNode } from 'react';
import type { Health } from '../../shared/api.ts';
import markUrl from '../esportra-mark.png';

export type TallyKind = 'onair' | 'pvw' | 'auto' | 'live' | 'covered' | 'off' | 'bad' | 'ready' | 'ok';

const WORDS: Record<TallyKind, string> = { onair: 'On air', pvw: 'PVW', auto: 'Auto', live: 'Live', covered: 'Covered', off: 'Off', bad: 'Not in OBS', ready: 'Ready', ok: 'OK' };

/** Status chip. Always carries a word, never colour alone (PRD §12). */
export function Tally({ kind, children }: { kind: TallyKind; children?: ReactNode }) {
  return <span className={`tally ${kind}`}>{children ?? WORDS[kind]}</span>;
}

const GLYPH: Record<Health, string> = { ok: '✓', warn: '!', bad: '✕', off: '–' };

export function Box({ health }: { health: Health }) {
  return (
    <span className={`box ${health}`} aria-hidden="true">
      {GLYPH[health]}
    </span>
  );
}

export function Cap({ children }: { children: ReactNode }) {
  return <p className="cap">{children}</p>;
}

const svg = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true">
    {paths}
  </svg>
);

export const ICONS = {
  console: svg(<><rect x="3" y="4" width="18" height="12" /><path d="M8 20h8M12 16v4" /></>),
  scenes: svg(<><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></>),
  capture: svg(<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>),
  outputs: svg(<><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v6H4V6h6" /></>),
  ready: svg(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 5v14M3 12h4M17 12h4" /><circle cx="12" cy="12" r="2.5" /></>),
  help: svg(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01" /></>),
  teams: svg(<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M15.5 14.2c2.9.3 5.5 2.6 5.5 5.8" /></>),
  event: svg(<><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 3M16 6h3a3 3 0 0 1-3 3M12 13v4M8 20h8" /></>),
  library: svg(<><rect x="3" y="4" width="8" height="7" rx="1.5" /><rect x="13" y="4" width="8" height="7" rx="1.5" /><rect x="3" y="13" width="8" height="7" rx="1.5" /><path d="M13 16.5h8M17 13v7" /></>),
  data: svg(<><rect x="4" y="5" width="16" height="14" /><path d="M4 10h16M9 5v14" /></>),
  sync: svg(<><path d="M20 8a8 8 0 0 0-14-2M4 4v4h4" /><path d="M4 16a8 8 0 0 0 14 2M20 20v-4h-4" /></>),
  setup: svg(<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>),
} as const;

/** The Esportra mark (from the brand files, white on transparent). */
export const LOGO = <img src={markUrl} alt="" aria-hidden="true" className="logo" />;
