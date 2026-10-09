import React from 'react';
import AccountPanel from './AccountPanel.jsx';
import MatchPanel from './MatchPanel.jsx';
import HudStatusBar from './HudStatusBar.jsx';
import BroadcastPanel from './BroadcastPanel.jsx';

export default function Sidebar({
  authStatus,
  authError,
  user,
  matchLoadState,
  matchLoadError,
  tournaments,
  selectedMatch,
  hudState,
  hudStatus,
  broadcastState,
  broadcastError,
  onLogin,
  onSignOut,
  onSelectMatch,
  onChangeMatch,
  onStartBroadcast,
  onStopBroadcast,
}) {
  return (
    <aside className="sidebar" aria-label="Broadcast controls">
      <div className="sidebar-scroll">

        {/* Logo row */}
        <div className="sidebar-logo">
          <span className="app-title">Esportra Broadcast</span>
        </div>

        {/* Account section */}
        <AccountPanel
          authStatus={authStatus}
          authError={authError}
          user={user}
          onLogin={onLogin}
          onSignOut={onSignOut}
        />

        {/* Divider between account and match */}
        {authStatus === 'signed-in' && (
          <div className="sidebar-rule" />
        )}

        {/* Match section — visible only when signed in */}
        {authStatus === 'signed-in' && (
          <MatchPanel
            matchLoadState={matchLoadState}
            matchLoadError={matchLoadError}
            tournaments={tournaments}
            selectedMatch={selectedMatch}
            onSelectMatch={onSelectMatch}
            onChangeMatch={onChangeMatch}
          />
        )}

        {/* Divider + Broadcast section — visible only when signed in */}
        {authStatus === 'signed-in' && (
          <>
            <div className="sidebar-rule" />
            <BroadcastPanel
              broadcastState={broadcastState}
              broadcastError={broadcastError}
              matchSelected={!!selectedMatch}
              onStart={onStartBroadcast}
              onStop={onStopBroadcast}
            />
          </>
        )}

      </div>

      {/* Bottom: rule + HUD status bar — always visible */}
      <div className="sidebar-bottom">
        <div className="sidebar-rule--bottom" />
        <HudStatusBar
          hudState={hudState}
          hudStatus={hudStatus}
        />
      </div>
    </aside>
  );
}
