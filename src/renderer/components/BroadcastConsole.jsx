import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar.jsx';
import OverlayCatalogue from './OverlayCatalogue.jsx';
import StateEditor from './StateEditor.jsx';

const api = window.esportraBroadcast;

/**
 * Self-contained three-panel broadcast console.
 * All legacy auth/match/hud/broadcast state lives here.
 */
export default function BroadcastConsole() {
  const [authStatus, setAuthStatus]     = useState('signed-out');
  const [authError, setAuthError]       = useState(null);
  const [user, setUser]                 = useState(null);
  const [matchLoadState, setMatchLoadState] = useState('idle');
  const [matchLoadError, setMatchLoadError] = useState(null);
  const [tournaments, setTournaments]   = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [hudState, setHudState]         = useState('connecting');
  const [hudStatus, setHudStatus]       = useState(null);
  const [broadcastState, setBroadcastState] = useState('inactive');
  const [broadcastError, setBroadcastError] = useState(null);

  useEffect(() => {
    async function pollHud() {
      try {
        const s = await api.hud.getStatus();
        setHudStatus(s);
        setHudState(s.online ? 'online' : 'offline');
      } catch { setHudState('error'); }
    }
    pollHud();
    const interval = setInterval(pollHud, 2000);
    api.hud.onHudPersistentError?.(() => setHudState('error'));
    api.hud.onHudRestarted?.(() => setHudState('connecting'));
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    api.broadcast?.onStatusChange?.((s) => {
      setBroadcastState(s.active ? 'active' : 'inactive');
      if (!s.active && s.reason) setBroadcastError(s.reason);
    });
  }, []);

  const handleLogin = useCallback(async (email, password) => {
    setAuthStatus('signing-in');
    setAuthError(null);
    const result = await api.ops.login(email, password);
    if (!result.ok) { setAuthError(result.error || 'Sign in failed.'); setAuthStatus('signed-out'); return; }
    setUser(result.user);
    setAuthStatus('signed-in');
    setMatchLoadState('loading');
    const mr = await api.ops.getMatches();
    if (mr.ok) { setTournaments(mr.tournaments); setMatchLoadState('loaded'); }
    else { setMatchLoadError(mr.error || 'Could not load matches.'); setMatchLoadState('error'); }
  }, []);

  const handleSignOut = useCallback(() => {
    setUser(null); setAuthStatus('signed-out'); setAuthError(null);
    setTournaments(null); setSelectedMatch(null);
    setMatchLoadState('idle'); setMatchLoadError(null);
  }, []);

  const handleSelectMatch = useCallback(async (tournamentSlug, matchId) => {
    try {
      const result = await api.ops.selectMatch(tournamentSlug, matchId);
      if (result.ok) { setSelectedMatch(result.match); return null; }
      return result.error || 'Could not load match data.';
    } catch { return 'Could not load match data.'; }
  }, []);

  const handleStartBroadcast = useCallback(async () => {
    setBroadcastState('starting'); setBroadcastError(null);
    try {
      const matchCode = selectedMatch?.code || selectedMatch?.id || 'MAIN';
      const result = await api.broadcast?.start({ matchCode });
      if (result?.ok) { setBroadcastState('active'); }
      else { setBroadcastError(result?.error || 'Could not start broadcast.'); setBroadcastState('error'); }
    } catch { setBroadcastError('Broadcast not available in this version.'); setBroadcastState('inactive'); }
  }, [selectedMatch]);

  const handleStopBroadcast = useCallback(async () => {
    try { await api.broadcast?.stop(); } catch (_) {}
    setBroadcastState('inactive');
  }, []);

  return (
    <div className="app-shell">
      <div className="app-panels">
        <Sidebar
          authStatus={authStatus} authError={authError} user={user}
          matchLoadState={matchLoadState} matchLoadError={matchLoadError}
          tournaments={tournaments} selectedMatch={selectedMatch}
          hudState={hudState} hudStatus={hudStatus}
          broadcastState={broadcastState} broadcastError={broadcastError}
          onLogin={handleLogin} onSignOut={handleSignOut}
          onSelectMatch={handleSelectMatch} onChangeMatch={() => setSelectedMatch(null)}
          onStartBroadcast={handleStartBroadcast} onStopBroadcast={handleStopBroadcast}
        />
        <main className="app-main"><OverlayCatalogue /></main>
        <aside className="app-right-panel"><StateEditor /></aside>
      </div>
    </div>
  );
}
