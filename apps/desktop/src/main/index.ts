// Esportra Air main process (ow-electron). Kept thin: the graphics engine is a separate process.
import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, nativeImage, safeStorage, shell } from 'electron';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { Thumbnails, pruneStills } from './thumbnails.ts';
import { manualHtml } from '../shared/manual.ts';
import { gameOf } from '../shared/games.ts';
import { join, resolve } from 'node:path';
import OBSWebSocket from 'obs-websocket-js';
import { CHANNELS, type ApiMethod } from '../shared/api.ts';
import { dispatch } from './api.ts';
import { EngineSupervisor } from './engine-supervisor.ts';
import { GepBridge, type OverwolfPackages } from '../../../../packages/capture/src/gep.ts';
import { wsIngest } from './ws-ingest.ts';
import { CaptureStats } from './capture-stats.ts';
import { ObsLink, type ObsSocket } from './obs.ts';
import { engineEnv, realProcess } from './process.ts';
import { Production } from './production.ts';
import { Secrets } from '../../../../packages/capture/src/secrets.ts';
import { Store } from './store.ts';
import { EsportraAccount } from './esportra.ts';

if (!app.requestSingleInstanceLock()) app.quit();

const exe = process.platform === 'win32' ? 'air-engine.exe' : 'air-engine';
const repo = resolve(__dirname, '../../..');
const paths = {
  engine: app.isPackaged ? join(process.resourcesPath, 'engine', exe) : join(repo, 'engine/target/release', exe),
  hud: app.isPackaged ? join(process.resourcesPath, 'hud') : join(repo, 'esportra-valorant-hud'),
  data: join(app.getPath('userData'), 'engine'),
};

let window: BrowserWindow | null = null;
let quitting = false;

async function main() {
  await app.whenReady();
  mkdirSync(paths.data, { recursive: true });
  const secrets = new Secrets(join(app.getPath('userData'), 'secrets.json'), safeStorage);
  let key = secrets.get('engineKey');
  if (!key) {
    key = randomBytes(32).toString('hex');
    secrets.set('engineKey', key);
  }
  const store = new Store(join(app.getPath('userData'), 'air.json'));
  // The engine binary's size and date tell an engine left running by an older Air from this one.
  const buildId = (() => { try { const st = statSync(paths.engine); return `${st.size}-${Math.round(st.mtimeMs)}`; } catch { return undefined; } })();
  const engine = new EngineSupervisor({ binary: paths.engine, hudRoot: paths.hud, dataDir: paths.data, port: store.data.enginePort, key, host: store.data.graphicsLan ? '0.0.0.0' : '127.0.0.1', env: engineEnv(), buildId, ...realProcess });
  const ingest = wsIngest();
  // A capture-only PC sends its game data to a producer's Air instead of to its own engine.
  const linkIngest = wsIngest();
  const stats = new CaptureStats();
  const packages = ((app as unknown as { overwolf?: { packages?: OverwolfPackages } }).overwolf?.packages) ?? null;
  const capture = new GepBridge({ packages, send: (m) => { stats.record(m); (store.data.mode === 'capture' ? linkIngest : ingest).send(m); }, log: (m) => console.warn('[gep]', m) });
  const obs = new ObsLink(() => new OBSWebSocket() as unknown as ObsSocket);
  // This PC's identity with Esportra is created once and kept.
  if (!store.data.deviceId) {
    store.data.deviceId = randomUUID();
    store.save();
  }
  const esportra = new EsportraAccount({
    apiBase: process.env.ESPORTRA_API_URL || 'https://api-staging.esportra.com',
    store, secrets, deviceId: store.data.deviceId, deviceName: hostname().slice(0, 80) || 'Air PC',
    changed: () => production.emit('change'),
  });
  // Logos and player photos: any common image, stored as PNG no wider than 512 px.
  const toPng = (bytes: Buffer) => {
    const image = nativeImage.createFromBuffer(bytes);
    if (image.isEmpty()) return null;
    const { width } = image.getSize();
    return (width > 512 ? image.resize({ width: 512, quality: 'best' }) : image).toPNG();
  };
  const production = new Production({ store, engine, obs, capture, ingest, stats, esportra, secrets, linkIngest, toPng, recordingsDir: join(app.getPath('documents'), 'Esportra Air recordings'), journalDir: join(app.getPath('userData'), 'events'), version: app.getVersion() });
  void esportra.start();
  if (store.data.mode === 'capture') production.link.resume();
  // The manual as a PDF: the same source as Help, printed in a hidden window, saved where the producer chooses.
  const saveManualPdf = async () => {
    const html = manualHtml(store.data.keymap, gameOf(store.data.setup.game)?.name ?? 'your game');
    const target = await dialog.showSaveDialog(window!, { title: 'Save the manual', defaultPath: join(app.getPath('documents'), 'Esportra Air manual.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (target.canceled || !target.filePath) return null;
    const page = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    try {
      await page.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      writeFileSync(target.filePath, await page.webContents.printToPDF({ pageSize: 'A4', printBackground: false }));
    } finally {
      page.destroy();
    }
    return target.filePath;
  };
  // A sponsor's break loop: OBS plays the file from this PC, so Air keeps only its path.
  const pickVideo = async () => {
    const choice = await dialog.showOpenDialog(window!, { title: 'Choose the sponsor video', properties: ['openFile'], filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'flv', 'ts', 'm4v'] }] });
    return choice.canceled ? null : choice.filePaths[0] ?? null;
  };
  // Event files (27 Nov): Save event file…, Open event file… and the auto-backup folder.
  const pickEventSave = async (defaultName: string) => {
    const target = await dialog.showSaveDialog(window!, { title: 'Save event file', defaultPath: join(app.getPath('documents'), defaultName), filters: [{ name: 'Esportra Air event file', extensions: ['airevent'] }] });
    if (target.canceled || !target.filePath) return null;
    return /\.airevent$/i.test(target.filePath) ? target.filePath : `${target.filePath}.airevent`;
  };
  const pickEventOpen = async () => {
    const choice = await dialog.showOpenDialog(window!, { title: 'Open event file', defaultPath: app.getPath('documents'), properties: ['openFile'], filters: [{ name: 'Esportra Air event file', extensions: ['airevent'] }] });
    return choice.canceled ? null : choice.filePaths[0] ?? null;
  };
  const pickFolder = async () => {
    const choice = await dialog.showOpenDialog(window!, { title: 'Choose the auto-backup folder', defaultPath: app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
    return choice.canceled ? null : choice.filePaths[0] ?? null;
  };
  const pickPictures = async () => {
    const choice = await dialog.showOpenDialog(window!, { title: 'Choose the folder with the logos and photos', defaultPath: app.getPath('pictures'), properties: ['openDirectory'] });
    return choice.canceled ? null : choice.filePaths[0] ?? null;
  };
  // Still pictures for list cards: each preview page is rendered once in a hidden 1280×720 window (thumbnails.ts).
  // 19 Nov: an offscreen window's capturePage can come back blank on some Windows GPUs, so the picture is taken from
  // its own paint events first, then capturePage, then once more from a hidden normal window. Pictures are kept on
  // disk, and a page that cannot be pictured shows a plain card, never the live page.
  const settle = async (page: BrowserWindow) => {
    for (let i = 0; i < 40 && !(await page.webContents.executeJavaScript('!!window.HUD_READY').catch(() => false)); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 1300));
  };
  const shoot = async (url: string, offscreen: boolean) => {
    const page = new BrowserWindow({ show: false, width: 1280, height: 720, useContentSize: true, transparent: true, frame: false, skipTaskbar: true, paintWhenInitiallyHidden: true, backgroundColor: '#00000000', webPreferences: { offscreen, sandbox: true, backgroundThrottling: false } });
    let painted: Electron.NativeImage | null = null;
    if (offscreen) page.webContents.on('paint', (_e, _dirty, image) => { if (!image.isEmpty()) painted = image; });
    try {
      if (offscreen) page.webContents.setFrameRate(10);
      await page.loadURL(url);
      await settle(page);
      let image = await page.webContents.capturePage();
      if (image.isEmpty() && painted) image = painted;
      if (image.isEmpty()) throw new Error(`blank picture (${offscreen ? 'offscreen' : 'hidden window'})`);
      return `data:image/png;base64,${image.toPNG().toString('base64')}`;
    } finally {
      page.destroy();
    }
  };
  const stillDir = join(app.getPath('userData'), 'thumbs');
  mkdirSync(stillDir, { recursive: true });
  pruneStills(stillDir, 600);
  // The app version is part of the name: a new version redraws graphics that may have changed.
  const stillFile = (id: string) => join(stillDir, `${createHash('sha1').update(`${app.getVersion()}\n${id}`).digest('hex')}.png`);
  const thumbs = new Thumbnails(async (url) => shoot(url, true).catch(() => shoot(url, false)), {
    store: {
      read: (id) => { try { return `data:image/png;base64,${readFileSync(stillFile(id)).toString('base64')}`; } catch { return null; } },
      write: (id, data) => writeFileSync(stillFile(id), Buffer.from(data.slice(data.indexOf(',') + 1), 'base64')),
    },
    log: (url, e) => console.warn(`[thumbnails] ${url.replace(/key=[^&]+/, 'key=…')}: ${e instanceof Error ? e.message : String(e)}`),
  });
  const ctx = { production, obs, secrets, copy: (text: string) => clipboard.writeText(text), showFile: (path: string) => shell.showItemInFolder(path), saveManualPdf, pickVideo, pickEventSave, pickEventOpen, pickFolder, pickPictures, thumbnail: (url: string, key: string) => thumbs.get(url, key) };

  // Keys over the game (F-keys and Ctrl/Alt keys): a press runs the same call as inside Air.
  production.attachKeys(globalShortcut, async (method, args) => { await dispatch(ctx, method, args); production.emit('change'); });
  app.on('will-quit', () => production.stopKeys());

  ipcMain.handle(CHANNELS.call, async (event, method: ApiMethod, args: unknown[]) => {
    if (!window || event.sender !== window.webContents) throw new Error('Not allowed.');
    return dispatch(ctx, method, Array.isArray(args) ? args : []);
  });

  window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 720, backgroundColor: "#09090b", title: 'Esportra Air', show: false,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#09090b', symbolColor: '#8b8b95', height: 34 },
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  window.once('ready-to-show', () => window?.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(www\.)?(esportra\.gg|obsproject\.com)\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (e) => e.preventDefault());
  await window.loadFile(join(__dirname, 'renderer/index.html'));

  // Nothing is sent once the window is gone (17 Nov: a snapshot timer firing during quit threw
  // "Object has been destroyed" every time Air closed).
  window.on('closed', () => { window = null; });
  const send = (channel: string, data: unknown) => {
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(channel, data);
  };
  production.on('monitor', (frame) => send(CHANNELS.monitor, frame));
  production.on('notice', (message: string) => send(CHANNELS.snapshot, { ...production.snapshot(), notice: message }));
  let pending: ReturnType<typeof setTimeout> | null = null;
  production.on('change', () => {
    if (pending || quitting) return;
    pending = setTimeout(() => {
      pending = null;
      send(CHANNELS.snapshot, production.snapshot());
    }, 150);
  });

  await engine.start();
  if (engine.state === 'running') await production.syncEngine().catch((e) => console.warn('[air] engine sync', e));
  production.art.start();
  production.checkRecovery();
  const password = secrets.get('obsPassword');
  const { host, port } = store.data.setup.obs;
  if (password !== null || host === '127.0.0.1') {
    obs.connect(host, port, password ?? '').catch(() => {
      // Shown on the status strip; the producer reconnects from Setup › OBS.
    });
  }

  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    if (pending) { clearTimeout(pending); pending = null; }
    void (async () => {
      let shutdown = false;
      if (engine.state === 'running' && engine.hasViewers()) {
        const opts: Electron.MessageBoxOptions = {
          type: 'question', buttons: ['Keep graphics on air', 'Stop graphics'], defaultId: 0, cancelId: 0, noLink: true,
          title: 'Graphics are on air', message: 'OBS is showing Air graphics.',
          detail: 'Keep them running after Air closes? They stay live and Air reconnects to them next time you open it.',
        };
        // The window may already be closed (closing it is what quits Air).
        const choice = await (window && !window.isDestroyed() ? dialog.showMessageBox(window, opts) : dialog.showMessageBox(opts));
        shutdown = choice.response === 1;
      } else {
        shutdown = engine.state === 'running';
      }
      capture.stop();
      ingest.close();
      linkIngest.close();
      production.joinHost.stop();
      await production.companion.stop();
      await obs.disconnect();
      await engine.stop(shutdown);
      app.exit(0);
    })();
  });
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.on('window-all-closed', () => app.quit());
}

void main();
