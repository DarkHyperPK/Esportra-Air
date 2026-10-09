import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import OverlayCatalogue from './components/OverlayCatalogue.jsx';
import StateEditor from './components/StateEditor.jsx';

const api = window.esportraBroadcast;

export default function App() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [authStatus, setAuthStatus] = useState('signed-out');
  // authStatus: 'signed-out' | 'signing-in' | 'signed-in'
  const [authError, setAuthError] = useState(null);
  const [user, setUser] = useState(null);

  // ── Matches ─────────────────────────────────────────────────────────────────
  const [matchLoadState, setMatchLoadState] = useState('idle');
  // matchLoadState: 'idle' | 'loading' | 'loaded' | 'error'
  const [matchLoadError, setMatchLoadError] = useState(null);
  const [tournaments, setTournaments] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);

  // ── HUD ─────────────────────────────────────────────────────────────────────
  const [hudState, setHudState] = useState('connecting');
  // hudState: 'connecting' | 'online' | 'offline' | 'error'
  const [hudStatus, setHudStatus] = useState(null);

  // ── Broadcast ────────────────────────────────────────────────────────────────
  const [broadcastState, setBroadcastState] = useState('inactive');
  // broadcastState: 'inactive' | 'starting' | 'active' | 'error'
  const [broadcastError, setBroadcastError] = useState(null);

  // ── HUD polling ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function pollHud() {
      try {
        const status = await api.hud.getStatus();
        setHudStatus(status);
        setHudState(status.online ? 'online' : 'offline');
      } catch {
        setHudState('error');
      }
    }

    pollHud();
    const interval = setInterval(pollHud, 2000);

    // T7 may not have added these push listeners yet — wrap in ?.
    api.hud.onHudPersistentError?.((msg) => {
      setHudState('error');
    });
    api.hud.onHudRestarted?.(() => {
      setHudState('connecting');
    });

    return () => clearInterval(interval);
  }, []);

  // ── Login ────────────────────────────────────────────────────────────────────
  const handleLogin = useCallback(async (email, password) => {
    setAuthStatus('signing-in');
    setAuthError(null);

    const result = await api.ops.login(email, password);

    if (!result.ok) {
      setAuthError(result.error || 'Sign in failed.');
      setAuthStatus('signed-out');
      return;
    }

    setUser(result.user);
    setAuthStatus('signed-in');

    // Immediately fetch matches
    setMatchLoadState('loading');
    const matchResult = await api.ops.getMatches();
    if (matchResult.ok) {
      setTournaments(matchResult.tournaments);
      setMatchLoadState('loaded');
    } else {
      setMatchLoadError(matchResult.error || 'Could not load matches.');
      setMatchLoadState('error');
    }
  }, []);

  // ── Sign out ─────────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(() => {
    setUser(null);
    setAuthStatus('signed-out');
    setAuthError(null);
    setTournaments(null);
    setSelectedMatch(null);
    setMatchLoadState('idle');
    setMatchLoadError(null);
  }, []);

  // ── Select match ─────────────────────────────────────────────────────────────
  // Returns an error string on failure, or null on success.
  const handleSelectMatch = useCallback(async (tournamentSlug, matchId) => {
    try {
      const result = await api.ops.selectMatch(tournamentSlug, matchId);
      if (result.ok) {
        setSelectedMatch(result.match);
        return null;
      }
      return result.error || 'Could not load match data.';
    } catch {
      return 'Could not load match data.';
    }
  }, []);

  // ── Change match ─────────────────────────────────────────────────────────────
  const handleChangeMatch = useCallback(() => {
    setSelectedMatch(null);
  }, []);

  // ── Broadcast ────────────────────────────────────────────────────────────────
  const handleStartBroadcast = useCallback(async () => {
    setBroadcastState('starting');
    setBroadcastError(null);
    try {
      const matchCode = selectedMatch?.code || selectedMatch?.id || 'MAIN';
      const result = await api.broadcast?.start({ matchCode });
      if (result?.ok) {
        setBroadcastState('active');
      } else {
        setBroadcastError(result?.error || 'Could not start broadcast.');
        setBroadcastState('error');
      }
    } catch (_e) {
      setBroadcastError('Broadcast not available in this version.');
      setBroadcastState('inactive');
    }
  }, [selectedMatch]);

  const handleStopBroadcast = useCallback(async () => {
    try { await api.broadcast?.stop(); } catch (_) {}
    setBroadcastState('inactive');
  }, []);

  useEffect(() => {
    api.broadcast?.onStatusChange?.((status) => {
      if (status.active) {
        setBroadcastState('active');
      } else {
        setBroadcastState('inactive');
        if (status.reason) setBroadcastError(status.reason);
      }
    });
  }, []);

  return (
    <div className="app-shell">
      <div className="app-panels">
        <Sidebar
          authStatus={authStatus}
          authError={authError}
          user={user}
          matchLoadState={matchLoadState}
          matchLoadError={matchLoadError}
          tournaments={tournaments}
          selectedMatch={selectedMatch}
          hudState={hudState}
          hudStatus={hudStatus}
          broadcastState={broadcastState}
          broadcastError={broadcastError}
          onLogin={handleLogin}
          onSignOut={handleSignOut}
          onSelectMatch={handleSelectMatch}
          onChangeMatch={handleChangeMatch}
          onStartBroadcast={handleStartBroadcast}
          onStopBroadcast={handleStopBroadcast}
        />
        <main className="app-main">
          <OverlayCatalogue />
        </main>
        <aside className="app-right-panel">
          <StateEditor />
        </aside>
      </div>
    </div>
  );
}
