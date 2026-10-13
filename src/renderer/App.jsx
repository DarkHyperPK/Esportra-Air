import React, { useState, useEffect, useCallback } from 'react';
import ModeScreen from './components/ModeScreen.jsx';
import BroadcastConsole from './components/BroadcastConsole.jsx';
import PairScreen from './components/PairScreen.jsx';
import ReadinessScreen from './components/ProductionReadiness.jsx';
import CaptureScreen from './components/CaptureScreen.jsx';
import OutputsScreen from './components/SourceOutputs.jsx';
import ProducerScreen from './components/ProducerScreen.jsx';

const airApi = window.esportraBroadcast?.air ?? null;

export default function App() {
  const [airStatus, setAirStatus] = useState(null);
  const [airLoading, setAirLoading] = useState(!!airApi);
  const [activeScreen, setActiveScreen] = useState('readiness');
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

  // Loading splash while first status poll resolves
  if (airLoading) {
    return (
      <div className="air-loading-screen">
        <span className="spinner spinner--sm" aria-hidden="true" />
        Loading node status…
      </div>
    );
  }

  if (airStatus && (airStatus.modeConfigured === false || restartRequired)) {
    return <ModeScreen airApi={airApi} restartRequired={restartRequired} onSelected={result => { setRestartRequired(result.restartRequired); fetchAirStatus(); }} />;
  }

  // Not yet paired — show pairing screen
  if (airStatus !== null && airStatus.paired === false) {
    return (
      <PairScreen
        airApi={airApi}
        onPairSuccess={fetchAirStatus}
      />
    );
  }

  // Capture-only mode — observer screen
  if (airStatus?.mode === 'capture-only' && airStatus?.paired) {
    if (activeScreen === 'settings') return <ModeScreen airApi={airApi} restartRequired={restartRequired} onSelected={result => { setRestartRequired(result.restartRequired); setActiveScreen('readiness'); fetchAirStatus(); }} onBack={() => setActiveScreen('readiness')} />;
    return <CaptureScreen status={airStatus} broadcastApi={window.esportraBroadcast.broadcast} onChanged={fetchAirStatus} onSettings={() => setActiveScreen('settings')} />;
  }

  // Paired production node — Readiness / Producer / Outputs
  if (airStatus?.paired) {
    if (activeScreen === 'settings') return <ModeScreen airApi={airApi} restartRequired={restartRequired} onSelected={result => { setRestartRequired(result.restartRequired); setActiveScreen('readiness'); fetchAirStatus(); }} onBack={() => setActiveScreen('readiness')} />;
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
