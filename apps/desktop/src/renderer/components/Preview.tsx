// A live graphic preview: the overlay page itself, scaled from 1920×1080 into a 16:9 card over a
// gameplay-like backdrop. A page loads the first time its card comes on screen, once scrolling has
// settled, and then stays loaded (17 Nov: removing and re-creating pages while scrolling made fast
// scrolls hitch). Cards off screen are skipped by the browser's rendering (`content-visibility`).
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

// When the page last scrolled, anywhere: new previews wait until scrolling has paused.
let lastScroll = 0;
if (typeof document !== 'undefined') document.addEventListener('scroll', () => { lastScroll = performance.now(); }, { capture: true, passive: true });
const SETTLE = 160;

export function Preview({ src, label, backdrop = true }: { src: string; label: string; backdrop?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const next = (e?.contentRect.width ?? 384) / 1920;
      setScale((cur) => (Math.abs(cur - next) > 0.0005 ? next : cur));
    });
    ro.observe(el);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let seen = false;
    const tryLoad = () => {
      timer = null;
      if (!seen) return;
      const wait = lastScroll + SETTLE - performance.now();
      if (wait > 0) { timer = setTimeout(tryLoad, wait); return; }
      setLoaded(true);
      io.disconnect();
    };
    const io = new IntersectionObserver(([e]) => {
      seen = !!e?.isIntersecting;
      if (seen && !timer) timer = setTimeout(tryLoad, 0);
    }, { rootMargin: '150px' });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); if (timer) clearTimeout(timer); };
  }, []);
  return (
    <div ref={box} className={`pv ${backdrop ? 'pv-bg' : ''}`} aria-label={`Preview: ${label}`} role="img">
      {loaded && <iframe title={label} src={src} tabIndex={-1} loading="lazy" style={{ transform: `scale(${scale})` }} />}
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
