import React from 'react';

/**
 * Renders one or more keyboard key badges.
 * keys: string[] — e.g. ['Ctrl','Shift','P'] or ['F9']
 */
export default function KbdBadge({ keys }) {
  return (
    <span className="kbd-group">
      {keys.map((k) => (
        <kbd
          key={k}
          className="kbd-badge"
          aria-label={k}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
