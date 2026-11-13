// Exposes `window.air` to the interface. The renderer has no Node access.
import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type AirApi, type ApiMethod, type MonitorFrame, type Snapshot } from '../shared/api.ts';

const METHODS: ApiMethod[] = [
  'snapshot', 'monitor', 'setLayer', 'toast', 'poll', 'stingerPlay', 'lowerThird', 'autopilotStart', 'autopilotStop', 'autopilotHold', 'autopilotSkip', 'autopilotTake', 'autopilotResume', 'rundownSave', 'rundownRemove', 'rundownEnable', 'rundownMove', 'cueMode', 'cueTake', 'cueClear', 'rundownStartFrom', 'setControl', 'companionRenewKey', 'replay', 'useSlotSource', 'createQuickMatch', 'selectMatch', 'updateMatch', 'chooseGame', 'setKey', 'resetKeys', 'setMoments', 'saveManualPdf', 'chooseProfile', 'finishOnboarding', 'restartOnboarding', 'createEvent', 'deleteEvent', 'saveTeam', 'removeTeam', 'savePlayer', 'removePlayer', 'setMatchTeam', 'setStarters', 'deleteMatch', 'markFinished', 'updateEvent', 'saveTalent', 'removeTalent', 'renewTalentLink', 'saveSponsor', 'removeSponsor', 'createMatch', 'librarySeed', 'libraryPlay', 'artDownload', 'autopilotRestart', 'recoveryDismiss', 'rehearsalStart', 'rehearsalStop', 'rehearsalTake', 'uploadImage', 'updateSetup', 'connectObs', 'disconnectObs', 'installGraphics',
  'startCapture', 'stopCapture', 'testRound', 'setMode', 'joinSet', 'joinRotate', 'linkConnect', 'linkDisconnect', 'linkRetry', 'esportraSignIn', 'esportraSignOut', 'esportraRefresh', 'useEsportraMatch', 'camsSet', 'camCreate', 'camRemove', 'pause', 'casterStrap', 'sponsorRead', 'correct', 'copy',
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

api.onMonitor = (listener: (frame: MonitorFrame) => void) => {
  const handler = (_event: unknown, frame: MonitorFrame) => listener(frame);
  ipcRenderer.on(CHANNELS.monitor, handler);
  return () => ipcRenderer.removeListener(CHANNELS.monitor, handler);
};

contextBridge.exposeInMainWorld('air', api);
