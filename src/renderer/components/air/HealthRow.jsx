import React, { useRef, useEffect, useState } from 'react';

/**
 * Single health indicator row.
 * state: 'healthy' | 'attention' | 'offline' | 'error'
 * fixAction: { label: string, onAction: fn } | null
 */
export default function HealthRow({ label, state, subtext, fixAction }) {
  const prevStateRef = useRef(state);
  const isNew = useRef(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const changed = prevStateRef.current !== state;
    isNew.current = changed;
    if (changed) setAnnouncement(`${label}: ${state}${subtext ? '. ' + subtext : ''}`);
    prevStateRef.current = state;
  });

  const dotClass = `health-dot health-dot--${state}`;
  const subtextClass = `health-subtext health-subtext--${state}`;
  const rowClass = `health-row${state === 'error' && isNew.current ? ' health-row--alert' : ''}`;

  return (
    <div className={rowClass}>
      {/* Hidden live region: fires only on state transitions to avoid chatty poll updates */}
      <span
        className="sr-only"
        aria-live={state === 'error' || state === 'attention' ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {announcement}
      </span>
      <div className={dotClass} role="presentation" />
      <div className="health-row-content">
        <div className="health-label">{label}</div>
        {subtext && <div className={subtextClass}>{subtext}</div>}
      </div>
      {fixAction && (
        <button type="button" className="health-fix-btn" onClick={fixAction.onAction}>
          {fixAction.label}
        </button>
      )}
    </div>
  );
}
