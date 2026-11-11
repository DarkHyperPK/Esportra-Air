import { useEffect, useState } from 'react';
import { LAYER_DEFS } from '../../shared/layers.ts';
import { PageHeader } from '../components/Chrome.tsx';
import { SHORTCUTS } from '../components/Global.tsx';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import { JoinPanel, PcModeCard } from '../components/Join.tsx';
import { ProfilePicker } from '../components/FirstRun.tsx';
import { SyncScreen } from './SyncScreen.tsx';
import type { PageProps } from '../App.tsx';

const SECTIONS = [
  ['setup', 'Setup'],
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


/** Which section is in view, so the list on the left shows where you are. */
function useSection() {
  const [current, setCurrent] = useState<string>(SECTIONS[0][0]);
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setCurrent(top.target.id.replace('set-', ''));
    }, { rootMargin: '0px 0px -60% 0px' });
    for (const [id] of SECTIONS) {
      const el = document.getElementById(`set-${id}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);
  return current;
}

export function SettingsScreen(props: PageProps) {
  const { s, run } = props;
  const current = useSection();
  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings sections">
        <Cap>Settings</Cap>
        {SECTIONS.map(([id, label]) => <a key={id} href={`#set-${id}`} aria-current={current === id ? 'true' : undefined}>{label}</a>)}
      </nav>
      <div className="stack settings-body">
        <PageHeader eyebrow="Software" title="Settings">How this copy of Air runs on this PC. Teams, players, event and graphics belong to each match.</PageHeader>
        <section className="panel" id="set-setup">
          <div className="head"><Cap>Setup · {s.game?.name ?? 'no game chosen'}</Cap><button className="btn quiet small" onClick={() => void run(() => air.restartOnboarding())}>Run first-time setup again</button></div>
          <div className="body-pad stack" style={{ gap: 10 }}>
            <ProfilePicker s={s} value={s.setup.profile} onPick={(p) => void run(() => air.chooseProfile(p))} />
            <p className="faint t-xs">Air checks the right things for your setup. The game is chosen from the top bar.</p>
          </div>
        </section>
        <div id="set-pc"><PcModeCard s={s} run={run} /></div>
        <div id="set-obs"><ObsConnection s={s} run={run} /></div>
        <div id="set-account"><SyncScreen {...props} /></div>
        <div id="set-network"><JoinPanel s={s} run={run} /></div>
        <section className="panel" id="set-keys">
          <div className="head"><Cap>Keyboard</Cap><span className="faint t-xs">Press <span className="kbd">?</span> anywhere for the full list</span></div>
          <div className="body-pad">
            <div className="shortcuts">
              {SHORTCUTS.map(([k, v]) => <div key={k}><span>{v}</span><span className="kbd">{k}</span></div>)}
              <div><span>Graphic layers ({LAYER_DEFS.length})</span><span className="kbd">1 – 5 · Q – I · A – K</span></div>
            </div>
            <p className="faint t-xs" style={{ marginTop: 10 }}>Shortcuts work while the Air window is focused and you are not typing.</p>
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
