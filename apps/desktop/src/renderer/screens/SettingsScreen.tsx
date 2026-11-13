import { useEffect, useState } from 'react';
import { ACTIONS, MOMENT_IDS, effectiveKeys, keyFromEvent, keyLabel, type KeyAction } from '../../shared/keymap.ts';
import type { Snapshot } from '../../shared/api.ts';
import type { Run } from '../App.tsx';
import { PageHeader } from '../components/Chrome.tsx';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import { PcModeCard } from '../components/Join.tsx';
import { ProfilePicker } from '../components/FirstRun.tsx';
import { SyncScreen } from './SyncScreen.tsx';
import type { PageProps } from '../App.tsx';

const SECTIONS = [
  ['setup', 'Setup'],
  ['pc', 'This PC'],
  ['account', 'Esportra account'],
  ['keys', 'Keyboard'],
  ['moments', 'Moments on Live'],
  ['about', 'About'],
] as const;

export function ObsConnection({ s, run }: Pick<PageProps, 's' | 'run'>) {
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

/** Rebind any key: Change, then press the new key. A key in use is offered as a swap. Saved on this PC. */
function KeyboardSettings({ s, run }: { s: Snapshot; run: Run }) {
  const [listening, setListening] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ id: string; key: string; text: string } | null>(null);
  useEffect(() => {
    if (!listening) return;
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setListening(null);
      const key = keyFromEvent(e);
      if (!key) return;
      setListening(null);
      try {
        await air.setKey(listening, key);
        setConflict(null);
      } catch (err) {
        const text = (err as Error).message;
        if (/already/.test(text)) setConflict({ id: listening, key, text });
        else await run(async () => { throw err; });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening]);
  const keys = effectiveKeys(s.keymap);
  const changed = (id: string) => id in s.keymap;
  const row = (a: KeyAction) => (
    <div key={a.id} className="li key-row">
      <span>{a.label}</span>
      <span className={`kbd ${listening === a.id ? 'listening' : changed(a.id) ? 'changed' : ''}`}>{listening === a.id ? 'Press a key…' : keyLabel(a.key)}</span>
      <span className="row-gap">
        {listening === a.id
          ? <button className="btn quiet small" onClick={() => setListening(null)}>Cancel</button>
          : <button className="btn quiet small" onClick={() => { setConflict(null); setListening(a.id); }} aria-label={`Change the key for ${a.label}`}>Change</button>}
        {changed(a.id) && listening !== a.id && <button className="btn quiet small" onClick={() => void run(() => air.setKey(a.id, null))}>Default</button>}
      </span>
      {conflict?.id === a.id && (
        <span className="key-conflict" role="alert">{conflict.text} <button className="btn small" onClick={async () => { if (await run(() => air.setKey(conflict.id, conflict.key, true))) setConflict(null); }}>Swap</button> <button className="btn quiet small" onClick={() => setConflict(null)}>Pick another</button></span>
      )}
    </div>
  );
  return (
    <section className="panel" aria-label="Keyboard">
      <div className="head"><Cap>Keyboard</Cap><button className="btn quiet small" onClick={() => void run(() => air.resetKeys())}>Reset to defaults</button></div>
      <div className="body-pad stack" style={{ gap: 8 }}>
        <p className="muted t-sm">Click Change, then press the new key. Saved on this PC. Live, the keyboard list and the manual show your keys.</p>
        <div className="lst">{keys.filter((a) => a.group !== 'layer').map(row)}</div>
        <details><summary className="muted t-sm">Graphic layers ({keys.filter((a) => a.group === 'layer').length})</summary><div className="lst">{keys.filter((a) => a.group === 'layer').map(row)}</div></details>
      </div>
    </section>
  );
}

/** The moments shown as keys on Live: up to six, in order. */
function MomentSettings({ s, run }: { s: Snapshot; run: Run }) {
  const label = (id: string) => ACTIONS.find((a) => a.id === id)?.label ?? id;
  const toggle = (id: string) => {
    const next = s.moments.includes(id) ? s.moments.filter((x) => x !== id) : [...s.moments, id];
    void run(() => air.setMoments(next));
  };
  return (
    <section className="panel" aria-label="Moments on Live">
      <div className="head"><Cap>Moments on Live</Cap><span className="faint t-xs">{s.moments.length} of 6</span></div>
      <div className="body-pad stack" style={{ gap: 6 }}>
        <p className="muted t-sm">The keys on Live for what happens during a show. Everything else is in All graphics.</p>
        <div className="moment-picks">
          {MOMENT_IDS.map((id) => {
            const on = s.moments.includes(id);
            return <button key={id} className="fchip" aria-pressed={on} disabled={!on && s.moments.length >= 6} onClick={() => toggle(id)}>{on ? `${s.moments.indexOf(id) + 1} · ` : ''}{label(id)}</button>;
          })}
        </div>
      </div>
    </section>
  );
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
        <PageHeader eyebrow="Software" title="Settings">How this copy of Air runs on this PC. OBS, player PCs and everything for a show are set up in its match.</PageHeader>
        <section className="panel" id="set-setup">
          <div className="head"><Cap>Setup · {s.game?.name ?? 'no game chosen'}</Cap><button className="btn quiet small" onClick={() => void run(() => air.restartOnboarding())}>Run first-time setup again</button></div>
          <div className="body-pad stack" style={{ gap: 10 }}>
            <ProfilePicker s={s} value={s.setup.profile} onPick={(p) => void run(() => air.chooseProfile(p))} />
            <p className="faint t-xs">Air checks the right things for your setup. The game is chosen from the top bar.</p>
          </div>
        </section>
        <div id="set-pc"><PcModeCard s={s} run={run} /></div>
        <div id="set-account"><SyncScreen {...props} /></div>
        <div id="set-keys"><KeyboardSettings s={s} run={run} /></div>
        <div id="set-moments"><MomentSettings s={s} run={run} /></div>
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
