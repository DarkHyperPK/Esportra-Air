import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { OWN_FIELDS, newBox, pngSize, validOwn, type OwnGraphic } from '../src/shared/own-graphics.ts';

const OVERLAYS = resolve(import.meta.dirname, '../../../esportra-valorant-hud/overlays');
let chromium: any = null;
try { chromium = createRequire(import.meta.url)('playwright').chromium; } catch { /* no browser here */ }

const design = (patch: Partial<OwnGraphic> = {}): OwnGraphic => ({
  id: '2c1f5f4e-6a7b-4f3e-9d10-111122223333', name: 'Neon Cup · Map result', purpose: 'map-result', style: 'full',
  image: '/air-assets/6f9619ff-8b86-4011-b42d-00c04fc964ff', fonts: [],
  boxes: [
    { ...newBox('team.0.name', 700, 520, 'a'), w: 300 },
    { ...newBox('team.1.score', 1180, 400, 'b'), size: 200, color: '#ffb22e' },
    { ...newBox('mvp.kda', 1060, 630, 'c') },
    { ...newBox('team.1.logo', 1490, 400, 'd'), radius: 540 },
    { ...newBox('map.label', 500, 190, 'e'), caps: 'upper' },
  ],
  enter: 'cut', exit: 'cut', createdAt: 1, updatedAt: 1, ...patch,
});

test('a design and its boxes are checked before they are saved', () => {
  const ok = validOwn(design());
  assert.equal(ok.boxes.length, 5);
  assert.throws(() => validOwn(design({ image: 'https://example.com/x.png' })), /Import the design/);
  assert.throws(() => validOwn(design({ boxes: [{ ...newBox('team.0.name', 0, 0, 'x'), field: 'sheet.A1' }] })), /field for every box/, 'only verified fields');
  assert.throws(() => validOwn(design({ name: '<script>' })), /no < > \{ \}/);
  assert.throws(() => validOwn(design({ boxes: [{ ...newBox('team.0.name', 0, 0, 'x'), font: 'Comic Sans' }] })), /one of the fonts/);
  assert.throws(() => validOwn(design({ purpose: 'sheets' })), /what the graphic is for/);
  assert.throws(() => validOwn(design({ boxes: [{ ...newBox('team.0.name', 0, 0, 'x'), color: 'red' }] })), /#rrggbb/);
});

test('a PNG’s size is read from its header', () => {
  const png = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(1920, 16); png.writeUInt32BE(1080, 20);
  assert.deepEqual(pngSize(png), { width: 1920, height: 1080 });
  assert.equal(pngSize(Buffer.from('GIF89a and more bytes here...')), null);
});

test('the overlay reads exactly the fields Air offers, fills the boxes and refuses outside pictures', { skip: !chromium && 'needs Playwright' }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    await page.goto(`file://${OVERLAYS}/fullscreen.html?preview=1`);
    await page.waitForFunction(() => (window as any).HUD_READY === true, null, { timeout: 10_000 });
    const keys = await page.evaluate(() => Object.keys((window as any).HUD.OWN.FIELDS).sort());
    assert.deepEqual(keys, OWN_FIELDS.map((f) => f.id).sort(), 'core/own.js and src/shared/own-graphics.ts list the same fields');
    // The full-screen host shows `own:<id>` from state.airOwn, filled from the room's state.
    const g = design({ boxes: [...design().boxes, { ...newBox('team.0.logo', 300, 400, 'f') }] });
    const out = await page.evaluate((g: OwnGraphic) => {
      const HUD = (window as any).HUD;
      HUD.state.teams[0].logo = 'javascript:alert(1)';
      HUD.state.airOwn = [g];
      HUD.state.airFullscreen = `own:${g.id}`;
      HUD.subs.forEach((f: (s: unknown) => void) => f(HUD.state));
      const box = (id: string) => document.querySelector(`[data-own-box="${id}"]`) as HTMLElement | null;
      return {
        name: box('a')?.textContent, score: box('b')?.textContent, kda: box('c')?.textContent, map: box('e')?.textContent,
        scoreColor: (box('b')?.firstElementChild as HTMLElement)?.style.color,
        logoB: (box('d')?.firstElementChild as HTMLImageElement)?.getAttribute('src'),
        logoA: { src: (box('f')?.firstElementChild as HTMLImageElement)?.getAttribute('src'), hidden: (box('f')?.firstElementChild as HTMLElement)?.style.visibility },
        art: document.querySelector('.fs-slot:not([style*="none"]) img')?.getAttribute('src'),
        scripts: document.querySelectorAll('[data-own-box] script').length,
      };
    }, g);
    assert.equal(out.name, 'NIGHT OWLS');
    assert.equal(out.score, '13');
    assert.equal(out.scoreColor, 'rgb(255, 178, 46)');
    assert.equal(out.kda, '24/13/3', 'the map MVP, as Map result picks it');
    assert.equal(out.map, 'MAP 3 · LOTUS', 'all caps');
    assert.equal(out.art, g.image, 'the design itself, as exported');
    assert.equal(out.logoA.src, null, 'a picture from anywhere else is never loaded');
    assert.equal(out.logoA.hidden, 'hidden');
    assert.equal(out.scripts, 0);
    // Shrink to fit: a long name is made smaller until it fits its box.
    const shrunk = await page.evaluate((g: OwnGraphic) => {
      const HUD = (window as any).HUD;
      HUD.state.teams[0].name = 'NIGHT OWLS ACADEMY BLUE';
      HUD.subs.forEach((f: (s: unknown) => void) => f(HUD.state));
      const el = document.querySelector('[data-own-box="a"] span') as HTMLElement;
      return { size: parseFloat(el.style.fontSize), fits: el.scrollWidth <= 301 };
    }, g);
    assert.ok(shrunk.size < 48 && shrunk.fits, JSON.stringify(shrunk));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
