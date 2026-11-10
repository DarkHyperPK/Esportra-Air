import { useState } from 'react';
import { LAYER_DEFS, hotkeyLabel } from '../../shared/layers.ts';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import { JoinPanel, PcModeCard } from '../components/Join.tsx';
import { SyncScreen } from './SyncScreen.tsx';
import type { PageProps } from '../App.tsx';

const SECTIONS = [
  ['pc', 'This PC'],
  ['obs', 'OBS connection'],
  ['account', 'Esportra account'],
  ['network', 'Other PCs'],
  ['keys', 'Keyboard'],
  ['about', 'About'],
] as const;

function ObsConnection({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const [host, setHost] = useState(s.setup.obs.host);
  const [port, setPort] = useState(String(s.setup.obs.port));
  const [password, setPassword] = useState('');
  const connected = s.obs.state === 'connected';
  return (
    <section className="panel">
      <div className="head"><Cap>OBS connection</Cap>{connected ? <Tally kind="ok">Connected</Tally> : <Tally kind={s.obs.state === 'error' ? 'bad' : 'off'}>{s.obs.state === 'connecting' ? 'Connecting' : s.obs.state === 'error' ? 'Lost' : 'Not connected'}</Tally>}</div>
      <div className="body-pad stack" style={{ gap: 14 }}>
        <p className="muted" style={{ fontSize: 12.5 }}>OBS’s built-in WebSocket server (OBS › Tools › WebSocket Server Settings). Air installs its scenes and reads what is on air. It never streams or records.</p>
        {connected && <div><h2 className="title-sm">OBS Studio {s.obs.version}</h2><p className="muted" style={{ fontSize: 12.5 }}>ws://{s.setup.obs.host}:{s.setup.obs.port} · scene collection {s.obs.collection ?? '—'}</p></div>}
        {connected && (
          <div className="row-item" style={{ padding: 0, border: 0, maxWidth: 520 }}>
            <span><b>Studio Mode</b><br /><span className="muted" style={{ fontSize: 12 }}>{s.obs.studioMode ? 'On · takes go through Preview' : 'Off · turn on to use Take, Cut and Stinger'}</span></span>
            <button className="switch" role="switch" aria-checked={s.obs.studioMode} aria-label="Studio Mode" onClick={() => void run(() => air.obsStudioMode(!s.obs.studioMode))} />
          </div>
        )}
        <form className="stack" style={{ gap: 12, maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); void run(() => air.connectObs({ host, port: Number(port), password })); }}>
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
      </div>
    </section>
  );
}

const KEYS: Array<[string, string]> = [
  ['Space', 'Take'],
  ['H / S', 'Hold / skip the next autopilot step'],
  ['F1 – F8', 'Tech pause, timeout, replay, toast, caster lower third, poll, stinger, sponsor read'],
  ['Ctrl + D', 'Fix data'],
];

export function SettingsScreen(props: PageProps) {
  const { s, run } = props;
  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings sections">
        <Cap>Settings</Cap>
        {SECTIONS.map(([id, label]) => <a key={id} href={`#set-${id}`}>{label}</a>)}
      </nav>
      <div className="stack settings-body">
        <div><Cap>Software</Cap><h1 className="title-lg" style={{ marginTop: 8 }}>Settings</h1><p className="lead" style={{ marginTop: 6 }}>How this copy of Air runs on this PC. Teams, players, event and graphics belong to each match.</p></div>
        <div id="set-pc"><PcModeCard s={s} run={run} /></div>
        <div id="set-obs"><ObsConnection s={s} run={run} /></div>
        <div id="set-account"><SyncScreen {...props} /></div>
        <div id="set-network"><JoinPanel s={s} run={run} /></div>
        <section className="panel" id="set-keys">
          <div className="head"><Cap>Keyboard</Cap></div>
          <div className="body-pad">
            <table className="seg-table"><tbody>
              {KEYS.map(([k, v]) => <tr key={k}><td style={{ width: 120 }}><span className="kbd">{k}</span></td><td>{v}</td></tr>)}
              <tr><td><span className="kbd">1 – 8 · Q – I · A – K</span></td><td>Graphic layers: {LAYER_DEFS.slice(0, 4).map((d) => `${hotkeyLabel(d.hotkey)} ${d.label}`).join(', ')} …</td></tr>
            </tbody></table>
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Shortcuts work while the Air window is focused and you are not typing.</p>
          </div>
        </section>
        <section className="panel" id="set-about">
          <div className="head"><Cap>About</Cap></div>
          <div className="body-pad">
            <dl className="readout">
              <dt>Version</dt><dd>{s.version}</dd>
              <dt>Graphics engine</dt><dd>127.0.0.1:{s.engine.port ?? '—'} · {s.engine.state}</dd>
              <dt>Game data</dt><dd>Stays on your network in local mode</dd>
            </dl>
          </div>
        </section>
      </div>
    </div>
  );
}
