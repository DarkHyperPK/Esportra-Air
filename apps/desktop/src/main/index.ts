// Esportra Air main process (ow-electron). Kept thin: the graphics engine is a separate process.
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, safeStorage, shell } from 'electron';
import { randomBytes, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { mkdirSync } from 'node:fs';
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
  const engine = new EngineSupervisor({ binary: paths.engine, hudRoot: paths.hud, dataDir: paths.data, port: store.data.enginePort, key, env: engineEnv(), ...realProcess });
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
  const production = new Production({ store, engine, obs, capture, ingest, stats, esportra, secrets, linkIngest, toPng, version: app.getVersion() });
  void esportra.start();
  if (store.data.mode === 'capture') production.link.resume();
  const ctx = { production, obs, secrets, copy: (text: string) => clipboard.writeText(text) };

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

  production.on('monitor', (frame) => window?.webContents.send(CHANNELS.monitor, frame));
  production.on('notice', (message: string) => window?.webContents.send(CHANNELS.snapshot, { ...production.snapshot(), notice: message }));
  let pending: ReturnType<typeof setTimeout> | null = null;
  production.on('change', () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      window?.webContents.send(CHANNELS.snapshot, production.snapshot());
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
    void (async () => {
      let shutdown = false;
      if (engine.state === 'running' && engine.hasViewers()) {
        const choice = await dialog.showMessageBox(window!, {
          type: 'question', buttons: ['Keep graphics on air', 'Stop graphics'], defaultId: 0, cancelId: 0, noLink: true,
          title: 'Graphics are on air', message: 'OBS is showing Air graphics.',
          detail: 'Keep them running after Air closes? They stay live and Air reconnects to them next time you open it.',
        });
        shutdown = choice.response === 1;
      } else {
        shutdown = engine.state === 'running';
      }
      capture.stop();
      ingest.close();
      linkIngest.close();
      production.joinHost.stop();
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
