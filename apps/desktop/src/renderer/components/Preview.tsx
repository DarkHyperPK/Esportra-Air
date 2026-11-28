// A live graphic preview: the overlay page itself, scaled from 1920×1080 into a 16:9 card over a
// gameplay-like backdrop. A page loads the first time its card comes on screen, once scrolling has
// settled, and then stays loaded (17 Nov: removing and re-creating pages while scrolling made fast
// scrolls hitch). Cards off screen are skipped by the browser's rendering (`content-visibility`).
import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { LIBRARY_ROOM } from '../../shared/library.ts';
import { air } from '../bridge.ts';

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
      // The smaller of width and height, so a box squeezed out of 16:9 never cuts the graphic off.
      const r = e?.contentRect;
      const next = Math.min((r?.width ?? 384) / 1920, r?.height ? r.height / 1080 : Infinity);
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

/** What the sample pages show depends on the selected match (its teams, colours, logos and banner style). */
export function stillKey(s: Snapshot) {
  const m = s.match;
  return m ? [m.id, m.theme, ...m.teams.map((t) => `${t.name}|${t.tag}|${t.color}|${t.logo}`)].join('·') : '';
}

/**
 * A list card's preview as a still picture (17 Nov): the page is rendered once by Air off screen and kept, so a
 * long list scrolls like any other. 19 Nov: a list never runs the live page. When no picture can be made the card
 * says so, with Try again; a graphic runs live only where the producer opens it.
 */
export function StillPreview({ src, label, backdrop = true, stamp = '' }: { src: string; label: string; backdrop?: boolean; stamp?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<string | null | 'failed'>(null);
  const [near, setNear] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!near) return;
    let gone = false;
    setImage(null);
    air.thumbnail(src, stamp).then((data) => { if (!gone) setImage(data ?? 'failed'); }, () => { if (!gone) setImage('failed'); });
    return () => { gone = true; };
  }, [near, src, stamp, attempt]);
  return (
    <div ref={box} className={`pv ${backdrop ? 'pv-bg' : ''} pv-still`} aria-label={`Preview: ${label}`} role="img">
      {image && image !== 'failed' && <img src={image} alt="" draggable={false} />}
      {image === 'failed' && (
        <span className="pv-none">
          <b>{label}</b>
          <span>No picture yet</span>
          <span role="button" tabIndex={0} className="pv-retry" onClick={(e) => { e.stopPropagation(); setAttempt((n) => n + 1); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setAttempt((n) => n + 1); } }}>↻ Try again</span>
        </span>
      )}
    </div>
  );
}
