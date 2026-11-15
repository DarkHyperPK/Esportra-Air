// Esportra Player main process (ow-electron): reads the local game and sends it to the production PC.
import { app, BrowserWindow, ipcMain, Menu, nativeImage, safeStorage, Tray } from 'electron';
import { hostname } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { GepBridge, type OverwolfPackages } from '../../../../packages/capture/src/gep.ts';
import { IngestClient, type IngestSocket } from '../../../../packages/capture/src/ingest.ts';
import { Secrets } from '../../../../packages/capture/src/secrets.ts';
import { GameRecorder } from '../../../../packages/capture/src/recorder.ts';
import { CHANNELS, METHODS, type PlayerMethod } from '../shared/api.ts';
import { PlayerController } from './controller.ts';
import { PlayerStore } from './store.ts';

if (!app.requestSingleInstanceLock()) app.quit();

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

async function main() {
  await app.whenReady();
  const secrets = new Secrets(join(app.getPath('userData'), 'secrets.json'), safeStorage);
  const store = new PlayerStore(join(app.getPath('userData'), 'player.json'));
  const ingest = new IngestClient({ connect: (url) => new WebSocket(url) as unknown as IngestSocket });
  const packages = ((app as unknown as { overwolf?: { packages?: OverwolfPackages } }).overwolf?.packages) ?? null;
  let changed = () => {};
  const recorder = new GameRecorder({ dir: join(app.getPath('documents'), 'Esportra Player recordings'), changed: () => changed() });
  const capture = new GepBridge({ packages, role: store.data.link?.role ?? 'player', send: (m) => ingest.send(m), log: (m) => console.warn('[gep]', m), tap: (kind, m) => recorder.write(kind, m) });
  const player = new PlayerController({ store, secrets, ingest, capture, recorder, name: hostname().slice(0, 40) || 'Player PC', version: app.getVersion() });
  changed = () => player.emit('change');
  player.resume();

  ipcMain.handle(CHANNELS.call, async (event, method: PlayerMethod, args: unknown[]) => {
    if (!window || event.sender !== window.webContents || !METHODS.includes(method)) throw new Error('Not allowed.');
    const a = Array.isArray(args) ? (args as any[]) : [];
    switch (method) {
      case 'connect': await player.connect(a[0] ?? {}); break;
      case 'disconnect': player.disconnect(); break;
      case 'retry': player.retry(); break;
      case 'startCapture': player.startCapture(a[0] ?? {}); break;
      case 'stopCapture': player.stopCapture(); break;
      case 'setRecording': player.setRecording(a[0] === true); break;
      case 'snapshot': break;
    }
    return player.snapshot();
  });

  window = new BrowserWindow({
    width: 560, height: 760, minWidth: 480, minHeight: 600, backgroundColor: '#09090b', title: 'Esportra Player', show: false,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#09090b', symbolColor: '#8b8b95', height: 34 },
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  window.once('ready-to-show', () => window?.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (e) => e.preventDefault());
  await window.loadFile(join(__dirname, 'renderer/index.html'));

  // Closing the window keeps capture running in the tray, so a match is never interrupted by a stray click.
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    window?.hide();
  });
  const icon = nativeImage.createFromPath(app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../../assets/esportra-icon.png'));
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Esportra Player');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Esportra Player', click: () => window?.show() }, { type: 'separator' }, { label: 'Quit', click: () => app.quit() }]));
  tray.on('click', () => window?.show());
  app.on('second-instance', () => window?.show());

  let pending: ReturnType<typeof setTimeout> | null = null;
  player.on('change', () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      window?.webContents.send(CHANNELS.snapshot, player.snapshot());
    }, 150);
  });

  app.on('before-quit', () => {
    quitting = true;
    capture.stop();
    ingest.close();
  });
}

void main();
