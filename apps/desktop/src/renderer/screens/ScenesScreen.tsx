import { useState } from 'react';
import { SCENE_KEYS, SCENES } from '../../shared/scenes.ts';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import type { PageProps } from '../App.tsx';

export function ScenesScreen({ s, run }: PageProps) {
  const [host, setHost] = useState(s.setup.obs.host);
  const [port, setPort] = useState(String(s.setup.obs.port));
  const [password, setPassword] = useState('');
  const connected = s.obs.state === 'connected';
  const stingers = s.obs.transitions.filter((t) => t.kind === 'stinger');
  const activeStinger = stingers.find((t) => t.name === s.setup.obs.stinger) ?? stingers[0] ?? null;
  const open = s.obs.scenes.flatMap((sc) => sc.slots).filter((sl) => !sl.source).length;
  return (
    <div className="cols" style={{ gridTemplateColumns: '300px minmax(0, 1fr) 320px' }}>
      <div className="stack">
        <section className="panel">
          <div className="head"><Cap>Connection</Cap>{connected ? <Tally kind="ok">Connected</Tally> : <Tally kind={s.obs.state === 'error' ? 'bad' : 'off'}>{s.obs.state === 'connecting' ? 'Connecting' : s.obs.state === 'error' ? 'Lost' : 'Not connected'}</Tally>}</div>
          <div className="body-pad stack" style={{ gap: 12 }}>
            {connected && <div><h2 className="title-sm">OBS Studio {s.obs.version}</h2><p className="muted" style={{ fontSize: 12.5 }}>This PC · ws://{s.setup.obs.host}:{s.setup.obs.port}</p></div>}
            {connected && (
              <>
                <div className="row-item" style={{ padding: 0, border: 0 }}>
                  <span><b>Studio Mode</b><br /><span className="muted" style={{ fontSize: 12 }}>{s.obs.studioMode ? 'On · takes go through Preview' : 'Off · turn on to use Take, Cut and Stinger'}</span></span>
                  <button className="switch" role="switch" aria-checked={s.obs.studioMode} aria-label="Studio Mode" onClick={() => void run(() => air.obsStudioMode(!s.obs.studioMode))} />
                </div>
                <div><b>Scene collection</b><br /><span className="muted" style={{ fontSize: 12 }}>{s.obs.collection ?? '—'}</span></div>
                <div><b>Control</b><br /><span className="muted" style={{ fontSize: 12 }}>Esportra scenes, transitions, replays. Never streaming or recording.</span></div>
              </>
            )}
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
          </div>
        </section>
        <section className="panel">
          <div className="head"><Cap>How it talks to OBS</Cap></div>
          <div className="body-pad"><p className="muted" style={{ fontSize: 12.5 }}>OBS’s built-in WebSocket server (Tools › WebSocket Server Settings). Air switches scenes, picks transitions and saves replays. Graphics inside each scene update on their own.</p></div>
        </section>
      </div>

      <section className="panel">
        <div className="head">
          <div><Cap>Scenes in OBS · built by Esportra</Cap><p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{s.obs.installed ? 'Installed. Update after changing screens or layout; your own scenes are never touched.' : 'Created in one click. Slots wait for your own sources.'}</p></div>
          <button className={`btn ${s.obs.installed ? '' : 'primary'}`} disabled={!connected} onClick={() => void run(() => air.installGraphics())}>{s.obs.installed ? 'Rebuild' : 'Add for me'}</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {SCENE_KEYS.map((key) => {
            const def = SCENES[key];
            const st = s.obs.scenes.find((x) => x.key === key);
            const inObs = !!st?.inObs;
            const sources = s.setup.screens.filter((x) => x.scene === key && x.enabled);
            return (
              <div key={key} style={{ borderTop: '1px solid var(--hair)', background: s.obs.programScene === def.name ? 'var(--rose-soft)' : undefined }}>
                <div className="tree-row" style={{ minHeight: 44 }}>
                  <span><b className="title-sm" style={{ fontSize: 15 }}>{def.label}</b> <span className="muted" style={{ fontSize: 12 }}>{def.note}</span></span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {s.obs.programScene === def.name && <Tally kind="onair" />}
                    {s.obs.previewScene === def.name && s.obs.programScene !== def.name && <Tally kind="pvw" />}
                    {!inObs && <Tally kind="bad" />}
                  </span>
                </div>
                {st?.slots.map((slot) => (
                  <div className="tree-row" key={slot.id} style={{ paddingLeft: 34 }}>
                    <span>{slot.label}{slot.source && <span className="muted"> · {slot.source}</span>}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {!slot.source && inObs && s.obs.videoInputs.length > 0 && (
                        <select className="cell" style={{ width: 170, height: 28 }} aria-label={`Use an existing OBS source for ${slot.label}`} value="" onChange={(e) => e.target.value && void run(() => air.useSlotSource(slot.id, e.target.value))}>
                          <option value="">Use existing source…</option>
                          {s.obs.videoInputs.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      )}
                      {inObs ? (slot.source ? <Tally kind="ok">Filled</Tally> : <Tally kind="covered">Add your source</Tally>) : <Tally kind="off">Not in OBS</Tally>}
                    </span>
                  </div>
                ))}
                {sources.map((x) => (
                  <div className="tree-row" key={x.id} style={{ paddingLeft: 34 }}>
                    <span className="muted">Esportra · {x.title}</span>
                    <span className="mono muted" style={{ fontSize: 11 }}>{x.frame.width}×{x.frame.height}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {connected && open > 0 && s.obs.installed && <div className="notice" style={{ margin: 16 }}>{open} slot{open > 1 ? 's' : ''} need your sources: add them in OBS inside the Esportra slot scenes. Air detects them.</div>}
      </section>

      <div className="stack">
        <section className="panel">
          <div className="head"><Cap>Transitions</Cap></div>
          <div className="body-pad stack" style={{ gap: 10 }}>
            {!connected ? <p className="muted" style={{ fontSize: 12.5 }}>Connect to OBS to see its transitions.</p> : (
              <>
                {s.obs.transitions.map((t) => (
                  <div key={t.name} className="row-item" style={{ border: '1px solid var(--hair)' }}>
                    <span>{t.name} <span className="muted mono" style={{ fontSize: 10.5 }}>{t.kind}</span></span>
                    {t.kind === 'stinger' && (activeStinger?.name === t.name ? <Tally kind="ok">Used for Stinger</Tally> : <button className="btn small" onClick={() => void run(() => air.updateSetup({ obs: { ...s.setup.obs, stinger: t.name } }))}>Use</button>)}
                  </div>
                ))}
                {!stingers.length && <p className="muted" style={{ fontSize: 12.5 }}>No Stinger transition yet. In OBS: Scene Transitions › + › Stinger, choose your video file and cut point. Air uses it for Stinger and Replay.</p>}
              </>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="head"><Cap>Replay buffer</Cap>{s.obs.replay.bufferActive === null ? <Tally kind="off">Not set up</Tally> : s.obs.replay.bufferActive ? <Tally kind="ok">Active</Tally> : <Tally kind="covered">Off</Tally>}</div>
          <div className="body-pad"><p className="muted" style={{ fontSize: 12.5 }}>{s.obs.replay.bufferActive === null ? 'Enable it in OBS › Settings › Output › Replay Buffer.' : s.obs.replay.bufferActive ? 'Press F3 on the Console to save the last clip and play it through the stinger.' : 'Start the replay buffer in OBS (Controls › Start Replay Buffer). Air never starts it for you.'}</p></div>
        </section>
      </div>
    </div>
  );
}
