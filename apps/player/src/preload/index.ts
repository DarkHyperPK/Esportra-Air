// Exposes `window.player` to the interface. The renderer has no Node access.
import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, METHODS, type PlayerApi, type PlayerSnapshot } from '../shared/api.ts';

const plain = (error: unknown) => new Error(String((error as Error)?.message ?? error).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));

const api = Object.fromEntries(METHODS.map((method) => [method, (...args: unknown[]) => ipcRenderer.invoke(CHANNELS.call, method, args).catch((e) => { throw plain(e); })])) as unknown as PlayerApi;

api.onSnapshot = (listener: (snapshot: PlayerSnapshot) => void) => {
  const handler = (_event: unknown, snapshot: PlayerSnapshot) => listener(snapshot);
  ipcRenderer.on(CHANNELS.snapshot, handler);
  return () => ipcRenderer.removeListener(CHANNELS.snapshot, handler);
};

contextBridge.exposeInMainWorld('player', api);
