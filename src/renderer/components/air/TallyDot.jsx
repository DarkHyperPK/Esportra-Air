import React from 'react';

/**
 * Large tally status dot for the Producer screen.
 * state: 'pgm' | 'pvw' | 'onair' | 'offline'
 */
export default function TallyDot({ state }) {
  const labels = { pgm: 'PGM active', pvw: 'PVW only', onair: 'ON AIR', offline: 'OBS offline' };
  return (
    <div
      className={`tally-dot tally-dot--${state}`}
      role="status"
      aria-label={labels[state] ?? state}
      title={labels[state] ?? state}
    />
  );
}
