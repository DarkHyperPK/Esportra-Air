// Dispatches interface calls to the production model. Arguments are validated in Production.
import type { ApiMethod, Snapshot } from '../shared/api.ts';
import type { Production } from './production.ts';
import type { ObsLink } from './obs.ts';
import type { Secrets } from '../../../../packages/capture/src/secrets.ts';

export interface ApiContext {
  production: Production;
  obs: ObsLink;
  secrets: Secrets;
  copy: (text: string) => void;
}

export async function dispatch(ctx: ApiContext, method: ApiMethod, args: unknown[]): Promise<Snapshot | string | void> {
  const p = ctx.production;
  const a = args as any[];
  switch (method) {
    case 'snapshot': break;
    case 'createQuickMatch': await p.createQuickMatch(a[0]); break;
    case 'selectMatch': await p.selectMatch(String(a[0])); break;
    case 'createMatch': await p.createMatch(a[0]); break;
    case 'uploadImage': return p.uploadImage(String(a[0]));
    case 'updateMatch': await p.updateMatch(String(a[0]), a[1] ?? {}); break;
    case 'updateSetup': await p.updateSetup(a[0] ?? {}); break;
    case 'connectObs': {
      const { host, port, password } = a[0] ?? {};
      await ctx.obs.connect(String(host), Number(port), String(password ?? ''));
      ctx.secrets.set('obsPassword', password ? String(password) : null);
      await p.updateSetup({ obs: { ...p.setup.obs, host: String(host), port: Number(port) } });
      break;
    }
    case 'disconnectObs': await ctx.obs.disconnect(); break;
    case 'setLayer': await p.setLayer(String(a[0]), a[1]); break;
    case 'toast': await p.toast(String(a[0])); break;
    case 'poll': await p.poll(a[0] ?? null); break;
    case 'stingerPlay': await p.stingerPlay(); break;
    case 'lowerThird': await p.lowerThird(a[0] ?? null); break;
    case 'autopilotStart': p.autopilotStart(); break;
    case 'autopilotStop': p.autopilotStop(); break;
    case 'autopilotHold': p.autopilotHold(); break;
    case 'autopilotSkip': p.autopilotSkip(); break;
    case 'autopilotTake': await p.autopilotTake(); break;
    case 'autopilotResume': await p.autopilotResume(); break;
    case 'segmentUpdate': p.segmentUpdate(String(a[0]), a[1] ?? {}); break;
    case 'segmentMove': p.segmentMove(String(a[0]), Number(a[1])); break;
    case 'obsStudioMode': await p.studioMode(a[0] === true); break;
    case 'obsPreview': await p.preview(String(a[0])); break;
    case 'obsTake': await p.take(); break;
    case 'obsCut': await p.cut(); break;
    case 'obsStinger': await p.stinger(); break;
    case 'replay': await p.playReplay(); break;
    case 'useSlotSource': await p.useSlotSource(a[0], String(a[1])); break;
    case 'monitor': p.setMonitoring(a[0] === true); return;
    case 'installGraphics': await p.installGraphics(); break;
    case 'startCapture':
      if (a[0]?.consent !== true) throw new Error('Read and accept the capture notice first.');
      p.startCapture();
      break;
    case 'stopCapture': p.stopCapture(); break;
    case 'testRound': await p.testRound(a[0] === 'stop' ? 'stop' : a[0] === 'seek' ? 'seek' : 'start', a[1] ?? {}); break;
    case 'setMode': await p.setMode(a[0]); break;
    case 'joinSet': await p.joinSet(a[0] === true); break;
    case 'joinRotate': await p.joinRotate(); break;
    case 'linkConnect': await p.linkConnect(a[0] ?? {}); break;
    case 'linkDisconnect': p.linkDisconnect(); break;
    case 'linkRetry': p.linkRetry(); break;
    case 'esportraSignIn': await p.esportraSignIn(String(a[0] ?? ''), String(a[1] ?? '')); break;
    case 'esportraSignOut': await p.esportraSignOut(); break;
    case 'esportraRefresh': await p.esportraRefresh(); break;
    case 'useEsportraMatch': await p.useEsportraMatch(String(a[0])); break;
    case 'camsSet': await p.camsSet(a[0] ?? {}); break;
    case 'camCreate': await p.camCreate(Number(a[0]), Number(a[1])); break;
    case 'camRemove': await p.camRemove(Number(a[0]), Number(a[1])); break;
    case 'pause': await p.pause(a[0] === 'technical' || a[0] === 'timeout' ? a[0] : null); break;
    case 'casterStrap': await p.casterStrap(a[0] === true); break;
    case 'sponsorRead': await p.sponsorRead(typeof a[0] === 'string' ? a[0] : null); break;
    case 'correct': await p.correct(a[0]); break;
    case 'copy':
      if (typeof a[0] !== 'string' || a[0].length > 2000) throw new Error('Nothing to copy.');
      ctx.copy(a[0]);
      return;
    default: throw new Error('Unknown action.');
  }
  return p.snapshot();
}
