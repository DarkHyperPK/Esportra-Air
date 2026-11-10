// Exposes `window.air` to the interface. The renderer has no Node access.
import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type AirApi, type ApiMethod, type Snapshot } from '../shared/api.ts';

const METHODS: ApiMethod[] = [
  'snapshot', 'createQuickMatch', 'selectMatch', 'updateMatch', 'updateSetup', 'connectObs', 'disconnectObs', 'installGraphics',
  'startCapture', 'stopCapture', 'testRound', 'pause', 'casterStrap', 'sponsorRead', 'correct', 'copy',
];

// Electron prefixes errors with "Error invoking remote method …: Error: "; keep only the message.
const plain = (error: unknown) => new Error(String((error as Error)?.message ?? error).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));

const api = Object.fromEntries(
  METHODS.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(CHANNELS.call, method, args).catch((e) => { throw plain(e); })]),
) as unknown as AirApi;

api.onSnapshot = (listener: (snapshot: Snapshot) => void) => {
  const handler = (_event: unknown, snapshot: Snapshot) => listener(snapshot);
  ipcRenderer.on(CHANNELS.snapshot, handler);
  return () => ipcRenderer.removeListener(CHANNELS.snapshot, handler);
};

contextBridge.exposeInMainWorld('air', api);
