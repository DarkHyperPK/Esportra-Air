// A live graphic preview: the overlay page itself, scaled from 1920×1080 into a 16:9 card over a
// gameplay-like backdrop. Pages are only loaded while the card is on screen.
import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { LIBRARY_ROOM } from '../../shared/library.ts';

export function overlayUrl(s: Snapshot, overlay: string, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({ match: LIBRARY_ROOM, screen: '1', ...extra });
  return `http://127.0.0.1:${s.engine.port}/overlays/${overlay}.html?${q}`;
}

/** The preview page for a screen of the setup; your own graphics are overlays/own.html?own=<id>. */
export function screenUrl(s: Snapshot, screenId: string, overlay?: string | null) {
  if (screenId.startsWith('own:')) return overlayUrl(s, 'own', { own: screenId.slice(4) });
  return overlayUrl(s, overlay ?? s.setup.screens.find((x) => x.id === screenId)?.overlay ?? screenId);
}

export function Preview({ src, label, backdrop = true }: { src: string; label: string; backdrop?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale((e?.contentRect.width ?? 384) / 1920));
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: '200px' });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, []);
  return (
    <div ref={box} className={`pv ${backdrop ? 'pv-bg' : ''}`} aria-label={`Preview: ${label}`} role="img">
      {visible && <iframe title={label} src={src} tabIndex={-1} style={{ transform: `scale(${scale})` }} />}
    </div>
  );
}

/** Several overlay pages stacked over one picture: how the graphics look together on air. */
export function Composite({ srcs, label, image }: { srcs: string[]; label: string; image?: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale((e?.contentRect.width ?? 576) / 1920));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className={`pv ${image ? '' : 'pv-bg'}`} aria-label={label} role="img">
      {image && <img src={image} alt="" className="pv-frame" />}
      {srcs.map((src) => <iframe key={src} title={label} src={src} tabIndex={-1} style={{ transform: `scale(${scale})` }} />)}
    </div>
  );
}
