import type { ReactNode } from 'react';
import type { Health } from '../../shared/api.ts';

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
  data: svg(<><rect x="4" y="5" width="16" height="14" /><path d="M4 10h16M9 5v14" /></>),
  sync: svg(<><path d="M20 8a8 8 0 0 0-14-2M4 4v4h4" /><path d="M4 16a8 8 0 0 0 14 2M20 20v-4h-4" /></>),
  setup: svg(<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>),
} as const;

export const LOGO = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="logo">
    <path d="M3 20 12 4l9 16M7.5 20l4.5-8 4.5 8" />
  </svg>
);
