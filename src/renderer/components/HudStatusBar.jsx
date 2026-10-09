import React from 'react';

export default function HudStatusBar({ hudState, hudStatus }) {
  const clients = hudStatus?.clients ?? 0;
  const errorCode = hudStatus?.errorCode;

  function getStatusText() {
    if (hudState === 'offline' && errorCode === 'EADDRINUSE') {
      return `Port 5300 in use — close other Esportra tools and restart`;
    }
    return {
      online:     'Online',
      offline:    'HUD offline',
      connecting: 'Connecting…',
      error:      'HUD error',
    }[hudState] ?? 'Connecting…';
  }
  const statusText = getStatusText();

  return (
    <div
      className={`hud-status-bar hud-status-bar--${hudState}`}
      role="status"
      aria-live="polite"
      aria-label={`HUD status: ${statusText}${hudState === 'online' ? `, ${clients} sources` : ''}`}
    >
      <div className="hud-status-left">
        <span className={`hud-dot hud-dot--${hudState}`} aria-hidden="true" />
        <span className={`hud-status-text hud-status-text--${hudState}`}>
          {statusText}
        </span>
        {hudState === 'online' && (
          <span className="hud-source-count">
            {`— ${clients} source${clients !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>
    </div>
  );
}
