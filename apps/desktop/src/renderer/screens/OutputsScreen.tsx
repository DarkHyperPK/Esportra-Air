import { useEffect, useRef, useState } from 'react';
import { SCENE_KEYS, SCENES } from '../../shared/scenes.ts';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import type { PageProps } from '../App.tsx';
import { ObsHeader } from './ScenesScreen.tsx';

/** A live, scaled view of an overlay. Loaded by match code, so it does not count as an OBS connection. */
function Preview({ src, onAir, pvw }: { src: string | null; onAir: boolean; pvw: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.17);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / 1920);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className={`shot ${onAir ? 'onair' : ''}`} style={{ overflow: 'hidden', ...(pvw && !onAir ? { borderColor: 'var(--amber)' } : {}) }}>
      {src ? (
        <iframe title="Live preview" src={src} tabIndex={-1} style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none', background: 'transparent', colorScheme: 'normal' }} />
      ) : (
        'Choose a match'
      )}
    </div>
  );
}

export function OutputsScreen({ s, run, go, embedded }: PageProps & { embedded?: boolean }) {
  const connected = s.obs.state === 'connected';
  return (
    <div className="stack" style={{ gap: 18 }}>
      {!embedded && <div><ObsHeader s={s} run={run} go={go} page="outputs" /></div>}
      <div className="out-grid">
        {SCENE_KEYS.map((key) => {
          const def = SCENES[key];
          const st = s.obs.scenes.find((x) => x.key === key);
          const outs = s.outputs.filter((o) => s.setup.screens.find((x) => x.id === o.screenId)?.scene === key);
          const primary = outs.find((o) => s.setup.screens.find((x) => x.id === o.screenId)?.primary) ?? outs[0];
          const onAir = s.obs.programScene === def.name;
          const pvw = s.obs.previewScene === def.name;
          const loading = outs.filter((o) => o.connections > 0).length;
          return (
            <article className="out-card" key={key}>
              {primary ? <Preview onAir={onAir} pvw={pvw} src={s.match ? `http://127.0.0.1:${s.engine.port}/overlays/${primary.overlay}.html?match=${encodeURIComponent(s.match.code)}&screen=1` : null} /> : <div className="shot">No graphics enabled</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h2 className="title-sm" style={{ fontSize: 15 }}>{def.label}</h2>
                {onAir ? <Tally kind="onair" /> : pvw ? <Tally kind="pvw" /> : st?.inObs ? <Tally kind={loading === outs.length ? 'live' : 'covered'}>{loading} of {outs.length} connected</Tally> : connected ? <Tally kind="bad" /> : <Tally kind="ready" />}
              </div>
              <div>
                {outs.map((o) => {
                  const ago = o.lastFrameAt ? Math.max(0, (Date.now() - o.lastFrameAt) / 1000) : null;
                  return (
                    <div key={o.screenId} className="out-card" style={{ border: 0, padding: '6px 0', gap: 4, background: 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className={`dot ${o.connections > 0 ? 'ok' : 'off'}`} /><span>{o.title}</span></span>
                        <span className="mono muted" style={{ fontSize: 10.5 }}>{ago === null ? 'no frame yet' : `${ago.toFixed(1)} s`}</span>
                      </div>
                      <div className="url"><span>{o.url}</span><button className="btn quiet small" aria-label={`Copy URL for ${o.title}`} onClick={() => void run(() => air.copy(o.url))}>Copy</button></div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
      <section className="panel">
        <div className="head"><Cap>Adding one by hand · if you skipped the one-click build</Cap></div>
        <div className="body-pad grid2" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {['OBS → Sources → + → Browser', 'Paste the URL · 1920 × 1080', 'Leave “Shutdown source when not visible” off', 'It turns green here within a second'].map((t, i) => (
            <div key={t} className="row-item" style={{ border: '1px solid var(--hair)', minHeight: 44 }}><span className="kbd">{i + 1}</span><span style={{ flex: 1, fontSize: 12.5 }}>{t}</span></div>
          ))}
        </div>
      </section>
    </div>
  );
}
