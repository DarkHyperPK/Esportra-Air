import { useEffect, useState } from 'react';
import type { MonitorFrame } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import { PREFIX } from '../../shared/scenes.ts';
import { Tally } from './ui.tsx';

/** Latest PVW / PGM frames from OBS. Polls only while a monitor is mounted. */
export function useMonitor(active: boolean): MonitorFrame | null {
  const [frame, setFrame] = useState<MonitorFrame | null>(null);
  useEffect(() => {
    if (!active) return;
    const off = air.onMonitor(setFrame);
    void air.monitor(true);
    return () => {
      off();
      void air.monitor(false);
    };
  }, [active]);
  return frame;
}

export const sceneLabel = (name: string | null) => (name ? name.replace(PREFIX, '') : '—');

export function Monitor({ kind, scene, image, note }: { kind: 'pvw' | 'pgm'; scene: string | null; image: string | null; note?: string }) {
  const onAir = kind === 'pgm';
  return (
    <figure style={{ margin: 0, minWidth: 0 }} aria-label={onAir ? 'Program monitor' : 'Preview monitor'}>
      <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#050507', border: `2px solid ${onAir ? 'var(--rose)' : 'var(--amber)'}`, overflow: 'hidden' }}>
        {image ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'center', padding: 12 }}>{note ?? 'No picture'}</div>
        )}
        <span style={{ position: 'absolute', top: 0, left: 0 }}><Tally kind={onAir ? 'onair' : 'pvw'}>{onAir ? 'PGM · On air' : 'PVW'}</Tally></span>
      </div>
      <figcaption className="mono muted" style={{ fontSize: 11, marginTop: 6, letterSpacing: '0.06em' }}>OBS scene · {sceneLabel(scene)}</figcaption>
    </figure>
  );
}
