import { SCENE_KEYS, SCENES } from '../../shared/scenes.ts';
import { TRIGGERS, TRIGGER_LABEL, type Segment } from '../../shared/autopilot.ts';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import type { PageProps } from '../App.tsx';

function SegmentTable({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const a = s.autopilot;
  const names = s.obs.sceneNames.length ? s.obs.sceneNames : [];
  const graphics = s.setup.screens.filter((x) => x.scene === 'fullscreen' && x.enabled);
  if (!s.match) return <div className="notice" style={{ margin: 16 }}>Choose a match to see its rundown.</div>;
  const edit = (seg: Segment, patch: Parameters<typeof air.segmentUpdate>[1]) => void run(() => air.segmentUpdate(seg.id, patch));
  return (
    <div style={{ borderTop: '1px solid var(--hair)', marginTop: 16 }}>
      <div className="head" style={{ padding: '14px 16px 6px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div><Cap>Segment → Scene</Cap><p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>The rundown for {s.match.title}. Autopilot walks it top to bottom; Manual segments wait for Take.</p></div>
        {a.enabled ? <Tally kind="ok">Autopilot on</Tally> : <Tally kind="off">Autopilot off</Tally>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="seg-table">
          <thead><tr><th>Segment</th><th>Trigger</th><th>OBS scene</th><th>Transition</th><th>Hold</th><th>Mode</th><th aria-label="Order" /></tr></thead>
          <tbody>
            {a.segments.map((seg, i) => {
              const locked = seg.state !== 'queued';
              const rowClass = seg.state === 'on_air' ? 'live' : seg.state === 'armed' || seg.state === 'holding' || seg.state === 'taking' ? 'next' : '';
              const label = (name: string) => name.replace(/^Esportra · /, '');
              return (
                <tr key={seg.id} className={rowClass} style={seg.state === 'done' ? { opacity: 0.5 } : undefined}>
                  <td><b>{seg.name}</b>{seg.mapNumber ? <span className="muted"> · map {seg.mapNumber}</span> : null}{seg.state !== 'queued' && <div className="mono muted" style={{ fontSize: 10, letterSpacing: '0.1em' }}>{seg.state.replace('_', ' ').toUpperCase()}</div>}</td>
                  <td>
                    <select className="cell" aria-label={`Trigger for ${seg.name}`} disabled={locked} value={seg.trigger} onChange={(e) => edit(seg, { trigger: e.target.value as Segment['trigger'], ...(e.target.value === 'manual' ? { mode: 'manual' as const } : {}) })}>
                      {TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
                    </select>
                    {seg.trigger === 'delay' && <input className="cell" style={{ marginTop: 4 }} type="number" min={1} max={600} aria-label="Delay seconds" disabled={locked} defaultValue={seg.delaySeconds} onBlur={(e) => Number(e.target.value) !== seg.delaySeconds && edit(seg, { delaySeconds: Number(e.target.value) })} />}
                  </td>
                  <td>
                    <select className="cell" aria-label={`Scene for ${seg.name}`} disabled={locked || !names.length} value={seg.scene} onChange={(e) => edit(seg, { scene: e.target.value })}>
                      {!names.includes(seg.scene) && <option value={seg.scene}>{label(seg.scene)} (not in OBS)</option>}
                      {names.map((n) => <option key={n} value={n}>{label(n)}</option>)}
                    </select>
                    {seg.scene === 'Esportra · Fullscreen' && (
                      <select className="cell" style={{ marginTop: 4 }} aria-label={`Graphic for ${seg.name}`} disabled={locked} value={seg.graphic ?? ''} onChange={(e) => edit(seg, { graphic: e.target.value || null })}>
                        <option value="">Graphic: leave as is</option>
                        {graphics.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                      </select>
                    )}
                  </td>
                  <td>
                    <select className="cell" aria-label={`Transition for ${seg.name}`} disabled={locked} value={seg.transition} onChange={(e) => edit(seg, { transition: e.target.value as Segment['transition'] })}>
                      <option value="default">OBS default</option><option value="cut">Cut</option><option value="stinger">Stinger</option>
                    </select>
                  </td>
                  <td>
                    <select className="cell" aria-label={`Hold for ${seg.name}`} disabled={locked} value={seg.holdMode === 'manual' ? 'manual' : String(seg.holdSeconds)} onChange={(e) => edit(seg, e.target.value === 'manual' ? { holdMode: 'manual' } : { holdMode: 'window', holdSeconds: Number(e.target.value) })}>
                      <option value="manual">Manual</option>
                      {[...new Set([1, 3, 5, 10, 15, 30, seg.holdSeconds])].filter((n) => n > 0).sort((x, y) => x - y).map((n) => <option key={n} value={n}>{n} s</option>)}
                    </select>
                  </td>
                  <td>
                    <button className="switch" role="switch" aria-checked={seg.mode === 'automatic'} aria-label={`${seg.name} takes itself`} disabled={locked || seg.trigger === 'manual'} title={seg.trigger === 'manual' ? 'Choose a trigger to make this automatic' : seg.mode === 'automatic' ? 'Automatic' : 'Manual'} onClick={() => edit(seg, { mode: seg.mode === 'automatic' ? 'manual' : 'automatic' })} />
                    <div className="mono muted" style={{ fontSize: 9.5, marginTop: 3 }}>{seg.mode === 'automatic' ? 'AUTO' : 'MANUAL'}</div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn quiet small" disabled={locked || i === 0} aria-label={`Move ${seg.name} up`} onClick={() => void run(() => air.segmentMove(seg.id, -1))}>↑</button>
                    <button className="btn quiet small" disabled={locked || i === a.segments.length - 1} aria-label={`Move ${seg.name} down`} onClick={() => void run(() => air.segmentMove(seg.id, 1))}>↓</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, padding: '8px 16px 14px' }}>A segment that has started is locked; changes apply to the segments still to come.</p>
    </div>
  );
}

export function ScenesScreen({ s, run, go }: PageProps) {
  const connected = s.obs.state === 'connected';
  const stingers = s.obs.transitions.filter((t) => t.kind === 'stinger');
  const activeStinger = stingers.find((t) => t.name === s.setup.obs.stinger) ?? stingers[0] ?? null;
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
        <SegmentTable s={s} run={run} />
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
