import React, { useState, useCallback, useRef, useEffect } from 'react';
import CopyUrlButton from './CopyUrlButton.jsx';

function formatRelativeTime(isoStr) {
  if (!isoStr) return '—';
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} d ago`;
}

/**
 * Single row in the outputs table.
 * output: { id, name, type, url, lastAccessed }
 * onRegenerate: fn(output) — opens the regenerate dialog
 */
export default function OutputRow({ output, onRegenerate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e) {
      if (!dropdownRef.current?.contains(e.target) && e.target !== menuBtnRef.current) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleCopyFromMenu = useCallback(async () => {
    setMenuOpen(false);
    if (output.url) {
      try { await navigator.clipboard.writeText(output.url); } catch (_) {}
    }
  }, [output.url]);

  const handleRegenerate = useCallback(() => {
    setMenuOpen(false);
    onRegenerate(output);
  }, [output, onRegenerate]);

  return (
    <tr>
      <td>
        <div className="output-name" title={output.name}>{output.name}</div>
      </td>
      <td>
        <span className="output-type">{output.type || '—'}</span>
      </td>
      <td>
        <div className="output-url-cell">
          <span className="output-url-text" title={output.url}>{output.url || '—'}</span>
          <CopyUrlButton url={output.url} />
        </div>
      </td>
      <td>
        <span className="output-last-accessed">{formatRelativeTime(output.lastAccessed)}</span>
      </td>
      <td className="output-actions-cell">
        <button
          type="button"
          className="output-menu-btn"
          ref={menuBtnRef}
          aria-label={`More actions for ${output.name}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          ···
        </button>
        {menuOpen && (
          <div className="output-dropdown" ref={dropdownRef} role="menu">
            <button
              type="button"
              className="output-dropdown-item"
              role="menuitem"
              onClick={handleCopyFromMenu}
            >
              Copy URL
            </button>
            <button
              type="button"
              className="output-dropdown-item output-dropdown-item--destructive"
              role="menuitem"
              onClick={handleRegenerate}
            >
              Regenerate key
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
