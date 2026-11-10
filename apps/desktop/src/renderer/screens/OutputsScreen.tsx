import { useEffect, useRef, useState } from 'react';
import { air } from '../bridge.ts';
import { Cap, Tally } from '../components/ui.tsx';
import type { PageProps } from '../App.tsx';

/** A live, scaled view of an overlay. Loaded by match code, so it does not count as an OBS connection. */
function Preview({ src, onAir }: { src: string | null; onAir: boolean }) {
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
    <div ref={box} className={`shot ${onAir ? 'onair' : ''}`} style={{ overflow: 'hidden' }}>
      {src ? (
        <iframe title="Live preview" src={src} tabIndex={-1} style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, border: 0, transform: `scale(${scale})`, transformOrigin: '0 0', pointerEvents: 'none', background: 'transparent', colorScheme: 'normal' }} />
      ) : (
        'Choose a match'
      )}
    </div>
  );
}

export function OutputsScreen({ s, run }: PageProps) {
  const connected = s.obs.state === 'connected';
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <Cap>Outputs · browser sources served by this PC</Cap>
        <p className="muted" style={{ marginTop: 6 }}>Add each once in OBS. They never need to change: the content follows the match.</p>
      </div>
      <div className="out-grid">
        {s.outputs.map((o) => {
          const inObs = connected && !s.obs.missingScenes.includes(`Air · ${o.title}`);
          const onAir = s.obs.programScene === `Air · ${o.title}`;
          const ago = o.lastFrameAt ? Math.max(0, (Date.now() - o.lastFrameAt) / 1000) : null;
          return (
            <article className="out-card" key={o.screenId}>
              <Preview onAir={onAir} src={s.match ? `http://127.0.0.1:${s.engine.port}/overlays/${o.overlay}.html?match=${encodeURIComponent(s.match.code)}&screen=1` : null} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h2 className="title-sm" style={{ fontSize: 15 }}>{o.title}</h2>
                {onAir ? <Tally kind="onair" /> : o.connections > 0 ? <Tally kind="live">{o.connections} connected</Tally> : inObs ? <Tally kind="covered">Not loaded</Tally> : <Tally kind="bad" />}
              </div>
              <div className="url"><span>{o.url}</span><button className="btn quiet small" aria-label={`Copy URL for ${o.title}`} onClick={() => void run(() => air.copy(o.url))}>Copy</button></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }} className="mono muted"><span style={{ fontSize: 11 }}>1920×1080 · 60 fps</span><span style={{ fontSize: 11 }}>{ago === null ? 'no frame yet' : `last frame ${ago.toFixed(1)} s`}</span></div>
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
