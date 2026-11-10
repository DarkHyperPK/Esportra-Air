import { SCENE_KEYS, SCENES } from '../../shared/scenes.ts';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import type { PageProps } from '../App.tsx';

export function ScenesScreen({ s, run, go }: PageProps) {
  const connected = s.obs.state === 'connected';
  const open = s.obs.scenes.flatMap((sc) => sc.slots).filter((sl) => !sl.source).length;
  return (
    <div className="cols" style={{ gridTemplateColumns: '300px minmax(0, 1fr) 320px' }}>
      <div className="stack">
        <section className="panel">
          <div className="head"><Cap>OBS</Cap>{connected ? <Tally kind="ok">Connected</Tally> : <Tally kind={s.obs.state === 'error' ? 'bad' : 'off'}>{s.obs.state === 'connecting' ? 'Connecting' : s.obs.state === 'error' ? 'Lost' : 'Not connected'}</Tally>}</div>
          <div className="body-pad stack" style={{ gap: 10 }}>
            {connected ? <div><h2 className="title-sm">OBS Studio {s.obs.version}</h2><p className="muted" style={{ fontSize: 12.5 }}>ws://{s.setup.obs.host}:{s.setup.obs.port} · {s.obs.collection ?? '—'}</p></div> : <p className="muted" style={{ fontSize: 12.5 }}>{s.obs.error ?? 'Not connected yet.'}</p>}
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('settings')}>Connection settings</button>
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
          <div className="head"><Cap>Replay buffer</Cap>{s.obs.replay.bufferActive === null ? <Tally kind="off">Not set up</Tally> : s.obs.replay.bufferActive ? <Tally kind="ok">Active</Tally> : <Tally kind="covered">Off</Tally>}</div>
          <div className="body-pad"><p className="muted" style={{ fontSize: 12.5 }}>{s.obs.replay.bufferActive === null ? 'Enable it in OBS › Settings › Output › Replay Buffer.' : s.obs.replay.bufferActive ? 'Press F3 on Live to save the last moments to the replay buffer. Playing it back is up to you in OBS.' : 'Start the replay buffer in OBS (Controls › Start Replay Buffer). Air never starts it for you.'}</p></div>
        </section>
      </div>
    </div>
  );
}
