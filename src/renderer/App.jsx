import React, { useState, useEffect, useCallback } from 'react';
import { WorkspaceProvider } from './workspace.jsx';
import { MatchesPage, PlayersPage } from './components/MatchDayPages.jsx';
import LiveMatchPage from './components/LiveMatchPage.jsx';
import ConnectionsPage from './components/ConnectionsPage.jsx';
import HelpPage from './components/HelpPage.jsx';
import BracketPage from './components/BracketPage.jsx';
import ProjectsPage from './components/ProjectsPage.jsx';
import ModeScreen from './components/ModeScreen.jsx';
import BroadcastConsole from './components/BroadcastConsole.jsx';
import PairScreen from './components/PairScreen.jsx';
import ReadinessScreen from './components/ProductionReadiness.jsx';
import CaptureScreen from './components/CaptureScreen.jsx';
import OutputsScreen from './components/SourceOutputs.jsx';
import ProducerScreen from './components/ProducerScreen.jsx';
import ShortcutSettings from './components/ShortcutSettings.jsx';
import RehearsalScreen from './components/RehearsalScreen.jsx';
import ProductionTimeline from './components/ProductionTimeline.jsx';
import DisplayFixScreen from './components/DisplayFixScreen.jsx';
import TemplateSetup from './components/TemplateSetup.jsx';
import BroadcastHome from './components/BroadcastHome.jsx';
import HudControlsPage from './components/HudControlsPage.jsx';

const airApi = window.esportraBroadcast?.air ?? null;

export default function App() {
  const [airStatus, setAirStatus] = useState(null);
  const [airLoading, setAirLoading] = useState(!!airApi);
  const [activeScreen, setActiveScreen] = useState('home');
  const [restartRequired, setRestartRequired] = useState(false);

  const fetchAirStatus = useCallback(async () => {
    if (!airApi) return;
    try {
      const s = await airApi.getStatus();
      setAirStatus(s ?? null);
    } catch {
      setAirStatus(null);
    } finally {
      setAirLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!airApi) { setAirLoading(false); return; }
    fetchAirStatus();
    const interval = setInterval(fetchAirStatus, 3000);
    const offConnected = airApi.onHubConnected?.(() => fetchAirStatus());
    const offDisconnected = airApi.onHubDisconnected?.(() => fetchAirStatus());
    return () => { clearInterval(interval); offConnected?.(); offDisconnected?.(); };
  }, [fetchAirStatus]);

  return <WorkspaceProvider status={airStatus} active={activeScreen} navigate={setActiveScreen} refresh={fetchAirStatus}><ScreenRouter {...{airStatus,airLoading,activeScreen,setActiveScreen,restartRequired,setRestartRequired,fetchAirStatus}} /></WorkspaceProvider>;
}

function ScreenRouter({airStatus,airLoading,activeScreen,setActiveScreen,restartRequired,setRestartRequired,fetchAirStatus}) {
  // Loading splash while first status poll resolves
  if (airLoading) {
    return (
      <div className="air-loading-screen">
        <span className="spinner spinner--sm" aria-hidden="true" />
        Loading node status…
      </div>
    );
  }

  if (airStatus && (airStatus.modeConfigured === false || restartRequired || airStatus.restartRequired || activeScreen === 'settings')) {
    const needsRestart = restartRequired || airStatus.restartRequired === true;
    return <ModeScreen airApi={airApi} currentMode={airStatus.modeConfigured ? airStatus.mode : null} selectedMode={airStatus.configuredMode} restartRequired={needsRestart} onSelected={result => { setRestartRequired(result.restartRequired); setActiveScreen('home'); fetchAirStatus(); }} onBack={airStatus.modeConfigured && !needsRestart ? () => setActiveScreen('home') : undefined} />;
  }

  if (activeScreen === 'projects') return <ProjectsPage />;
  if (!airStatus?.paired && airStatus?.airAccount?.loading) return <div className="air-loading-screen">Opening your Air account…</div>;

  // Not yet paired — show pairing screen
  if (airStatus !== null && airStatus.paired === false && !airStatus.standalone) {
    return (
      <PairScreen
        airApi={airApi}
        notice={airStatus.pairingNotice}
        onSettings={() => setActiveScreen('settings')}
        onIndependent={() => setActiveScreen('projects')}
        onPairSuccess={()=>{setActiveScreen('home');void fetchAirStatus();}}
      />
    );
  }

  // Capture-only mode — observer screen
  if (airStatus?.mode === 'capture-only' && (airStatus?.paired || airStatus?.standalone)) {
    return <CaptureScreen status={airStatus} broadcastApi={window.esportraBroadcast.broadcast} onChanged={fetchAirStatus} onSettings={() => setActiveScreen('settings')} />;
  }

  // Paired production node — Readiness / Producer / Outputs
  if (airStatus?.paired || airStatus?.standalone) {
    if (activeScreen === 'home') return <BroadcastHome />;
    if (activeScreen === 'hud') return <HudControlsPage />;
    if (activeScreen === 'bracket') return <BracketPage />;
    if (activeScreen === 'matches') return <MatchesPage />;
    if (activeScreen === 'players') return <PlayersPage />;
    if (activeScreen === 'live') return <LiveMatchPage />;
    if (activeScreen === 'connections') return <ConnectionsPage />;
    if (activeScreen === 'help') return <HelpPage />;
    if (activeScreen === 'template') return <TemplateSetup status={airStatus} onScreenChange={setActiveScreen} onChanged={fetchAirStatus} />;
    if (activeScreen === 'data-fixes') return <DisplayFixScreen status={airStatus} onScreenChange={setActiveScreen} />;
    if (activeScreen === 'timeline') return <ProductionTimeline status={airStatus} onScreenChange={setActiveScreen} />;
    if (activeScreen === 'rehearsal') return <RehearsalScreen status={airStatus} onScreenChange={setActiveScreen} />;
    if (activeScreen === 'shortcuts') return <ShortcutSettings status={airStatus} onScreenChange={setActiveScreen} />;
    if (activeScreen === 'producer') {
      return (
        <ProducerScreen
          status={airStatus}
          onScreenChange={setActiveScreen}
        />
      );
    }
    if (activeScreen === 'outputs') {
      return (
        <OutputsScreen
          status={airStatus}
          airApi={airApi}
          onScreenChange={setActiveScreen}
          onChanged={fetchAirStatus}
        />
      );
    }
    return (
      <ReadinessScreen
        status={airStatus}
        airApi={airApi}
        onChanged={fetchAirStatus}
        onScreenChange={setActiveScreen}
      />
    );
  }

  // Fallback: air API not present or status unknown → existing broadcast console
  return <BroadcastConsole />;
}
