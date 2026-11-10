import { SCENE_KEYS, SCENES } from '../../shared/scenes.ts';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import { PageHeader } from '../components/Chrome.tsx';
import type { PageProps } from '../App.tsx';

/** OBS has two tabs: the scenes Air builds, and the browser sources it serves. */
export function ObsHeader({ s, run, go, page }: Pick<PageProps, 's' | 'run' | 'go'> & { page: 'scenes' | 'outputs' }) {
  const connected = s.obs.state === 'connected';
  return (
    <>
      <PageHeader
        eyebrow="OBS"
        title={page === 'scenes' ? 'Scenes' : 'Browser sources'}
        actions={<>
          {!connected && <button className="btn" onClick={() => go('settings')}>Connect OBS</button>}
          <button className={`btn ${s.obs.installed ? '' : 'primary'}`} disabled={!connected} onClick={() => void run(() => air.installGraphics())}>{s.obs.installed ? 'Rebuild scenes' : 'Add for me'}</button>
        </>}
      >
        {page === 'scenes'
          ? 'Air adds its own scenes and sources to OBS and reads which scene is on air. It never switches scenes, streams or records: that stays in OBS.'
          : 'One browser source per graphic, served by this PC. Add each once; the content follows whichever match is selected.'}
      </PageHeader>
      <div className="tabs" role="tablist" aria-label="OBS">
        <button role="tab" aria-selected={page === 'scenes'} onClick={() => go('scenes')}>Scenes</button>
        <button role="tab" aria-selected={page === 'outputs'} onClick={() => go('outputs')}>Browser sources</button>
      </div>
    </>
  );
}

export function ScenesScreen({ s, run, go }: PageProps) {
  const connected = s.obs.state === 'connected';
  const open = s.obs.scenes.flatMap((sc) => sc.slots).filter((sl) => !sl.source).length;
  return (
    <>
    <ObsHeader s={s} run={run} go={go} page="scenes" />
    <div className="cols">
      <div className="stack">
        <section className="panel">
          <div className="head"><Cap>OBS</Cap>{connected ? <Tally kind="ok">Connected</Tally> : <Tally kind={s.obs.state === 'error' ? 'bad' : 'off'}>{s.obs.state === 'connecting' ? 'Connecting' : s.obs.state === 'error' ? 'Lost' : 'Not connected'}</Tally>}</div>
          <div className="body-pad stack" style={{ gap: 10 }}>
            {connected ? <div><h2 className="title-sm">OBS Studio {s.obs.version}</h2><p className="muted" style={{ fontSize: 12.5 }}>ws://{s.setup.obs.host}:{s.setup.obs.port} · {s.obs.collection ?? '—'}</p></div> : <p className="muted" style={{ fontSize: 12.5 }}>{s.obs.error ?? 'Not connected yet.'}</p>}
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('settings')}>Connection settings</button>
          </div>
        </section>
        <section className="panel">
          <div className="head"><Cap>Replay buffer</Cap>{s.obs.replay.bufferActive === null ? <Tally kind="off">Not set up</Tally> : s.obs.replay.bufferActive ? <Tally kind="ok">Active</Tally> : <Tally kind="covered">Off</Tally>}</div>
          <div className="body-pad"><p className="muted t-sm">{s.obs.replay.bufferActive === null ? 'Enable it in OBS › Settings › Output › Replay Buffer.' : s.obs.replay.bufferActive ? 'F3 on Live saves the last moments to the replay buffer. Playing it back is up to you in OBS.' : 'Start the replay buffer in OBS (Controls › Start Replay Buffer). Air never starts it for you.'}</p></div>
        </section>
        <section className="panel">
          <div className="head"><Cap>What Air does in OBS</Cap></div>
          <div className="body-pad">
            <ul className="muted t-sm" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              <li>Adds the Esportra scenes and browser sources below, and rebuilds them on request.</li>
              <li>Reads which scene is on air and takes small screenshots for the Live monitors.</li>
              <li>Saves the replay buffer when you press F3.</li>
              <li>Never switches scenes, changes transitions, streams or records, and never touches your own scenes.</li>
            </ul>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="head">
          <div><Cap>Scenes built by Esportra</Cap><p className="muted t-sm" style={{ marginTop: 6 }}>{s.obs.installed ? 'Installed. Rebuild after switching graphics on or off; your own scenes are never touched.' : connected ? 'Created in one click with Add for me. Slots wait for your own sources.' : 'Connect OBS first, then add them in one click.'}</p></div>
          {s.obs.installed ? <Tally kind="ok">Installed</Tally> : <Tally kind="off">Not in OBS</Tally>}
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

    </div>
    </>
  );
}
