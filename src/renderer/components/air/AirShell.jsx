import React from 'react';

/**
 * Shared shell: titlebar (40px) + optional screen header (44px) + screen body.
 *
 * Props:
 *   screenTitle       string          — header title text
 *   nodeName          string|null     — shown in NODE chip; omit for PairScreen
 *   contextualButton  ReactNode|null  — ghost button in header far right
 *   nav               [{id, label}]   — tabs in header; empty = no nav
 *   activeTab         string          — active tab id
 *   onTabChange       fn(id)          — tab change handler
 *   statusBadge       ReactNode|null  — autopilot/manual badge after node chip
 *   showHeader        bool            — false for PairScreen (no node yet)
 *   children          ReactNode       — content below header
 */
export default function AirShell({
  screenTitle,
  nodeName = null,
  contextualButton = null,
  nav = [],
  activeTab = '',
  onTabChange = null,
  statusBadge = null,
  showHeader = true,
  children,
}) {
  return (
    <div className="air-window">
      {/* Titlebar */}
      <div className="air-titlebar" role="banner">
        <div className="air-titlebar-identity">
          <div className="air-titlebar-dot" aria-hidden="true" />
          <span className="air-titlebar-wordmark">ESPORTRA AIR</span>
        </div>
      </div>

      {/* Screen header */}
      {showHeader && (
        <div className="air-screen-header">
          <div className="air-header-left">
            <span className="air-screen-title">{screenTitle}</span>
            {nodeName && (
              <div className="air-node-chip" aria-label={`Node: ${nodeName}`}>
                <span className="air-node-chip-label">NODE</span>
                <span className="air-node-chip-name">{nodeName}</span>
              </div>
            )}
            {statusBadge}
            {nav.length > 0 && (
              <nav className="air-header-nav" aria-label="Screen navigation">
                {nav.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className={`air-header-nav-btn${activeTab === id ? ' air-header-nav-btn--active' : ''}`}
                    onClick={() => onTabChange?.(id)}
                    aria-current={activeTab === id ? 'page' : undefined}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            )}
          </div>
          <div className="air-header-right">
            {contextualButton}
          </div>
        </div>
      )}

      {/* Screen body */}
      <div className="air-screen-body">
        {children}
      </div>
    </div>
  );
}
