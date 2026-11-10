import { useState } from 'react';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import type { PageProps } from '../App.tsx';

export function ScenesScreen({ s, run }: PageProps) {
  const [host, setHost] = useState(s.setup.obs.host);
  const [port, setPort] = useState(String(s.setup.obs.port));
  const [password, setPassword] = useState('');
  const connected = s.obs.state === 'connected';
  return (
    <div className="cols">
      <div className="stack">
        <section className="panel">
          <div className="head"><Cap>Connection</Cap>{connected ? <Tally kind="ok">Connected</Tally> : <Tally kind="off">Not connected</Tally>}</div>
          <div className="body-pad stack" style={{ gap: 12 }}>
            {connected && <div><h2 className="title-sm">OBS Studio {s.obs.version}</h2><p className="muted" style={{ fontSize: 12.5 }}>ws://{s.setup.obs.host}:{s.setup.obs.port}</p></div>}
            <form className="stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); void run(() => air.connectObs({ host, port: Number(port), password })); }}>
              <div className="grid3" style={{ gridTemplateColumns: '2fr 1fr' }}>
                <label className="field"><span>Address</span><input value={host} onChange={(e) => setHost(e.target.value)} required /></label>
                <label className="field"><span>Port</span><input type="number" value={port} onChange={(e) => setPort(e.target.value)} required /></label>
              </div>
              <label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" placeholder={connected ? 'Saved' : ''} /></label>
              {s.obs.error && !connected && <p style={{ color: 'var(--bad)', fontSize: 13 }}>{s.obs.error}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" type="submit">{s.obs.state === 'connecting' ? 'Connecting…' : connected ? 'Reconnect' : 'Connect'}</button>
                {connected && <button type="button" className="btn quiet" onClick={() => void run(() => air.disconnectObs())}>Disconnect</button>}
              </div>
            </form>
            {connected && (
              <label className="field"><span>Game feed (under the in-game HUD)</span>
                <select value={s.setup.obs.gameplaySource ?? ''} onChange={(e) => void run(() => air.updateSetup({ obs: { ...s.setup.obs, gameplaySource: e.target.value || null } }))}>
                  <option value="">None — I’ll add it myself</option>
                  {s.obs.videoInputs.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="head"><Cap>How it talks to OBS</Cap></div>
          <div className="body-pad"><p className="muted" style={{ fontSize: 12.5 }}>OBS’s built-in WebSocket server (Tools › WebSocket Server Settings). Air adds its own scenes and reads what is on air. Graphics inside each scene update on their own.</p></div>
        </section>
      </div>

      <section className="panel">
        <div className="head">
          <div><Cap>Scenes in OBS · built by Air</Cap><p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{s.obs.installed ? 'Installed. Update after changing screens or layout; your own scenes are never touched.' : 'Created in one click. Your game feed goes in the in-game scene.'}</p></div>
          <button className={`btn ${s.obs.installed ? '' : 'primary'}`} disabled={!connected} onClick={() => void run(() => air.installGraphics())}>{s.obs.installed ? 'Update' : 'Add for me'}</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {s.outputs.map((o) => {
            const inObs = connected && !s.obs.missingScenes.includes(`Air · ${o.title}`);
            return (
              <div className="tree-row" key={o.screenId}>
                <span><b>Air · {o.title}</b></span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {s.obs.programScene === `Air · ${o.title}` && <Tally kind="onair" />}
                  {o.screenId === 'in-game' && inObs && !s.setup.obs.gameplaySource && <Tally kind="covered">Add your source</Tally>}
                  <span className="mono muted" style={{ fontSize: 11 }}>1920×1080</span>
                  <Tally kind={inObs ? 'ready' : 'bad'}>{inObs ? 'In OBS' : 'Not in OBS'}</Tally>
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
