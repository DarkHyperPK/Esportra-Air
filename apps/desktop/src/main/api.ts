// Dispatches interface calls to the production model. Arguments are validated in Production.
import type { ApiMethod, Snapshot } from '../shared/api.ts';
import type { Production } from './production.ts';
import type { ObsLink } from './obs.ts';
import type { Secrets } from './secrets.ts';

export interface ApiContext {
  production: Production;
  obs: ObsLink;
  secrets: Secrets;
  copy: (text: string) => void;
}

export async function dispatch(ctx: ApiContext, method: ApiMethod, args: unknown[]): Promise<Snapshot | void> {
  const p = ctx.production;
  const a = args as any[];
  switch (method) {
    case 'snapshot': break;
    case 'createQuickMatch': await p.createQuickMatch(a[0]); break;
    case 'selectMatch': await p.selectMatch(String(a[0])); break;
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
    case 'installGraphics': await p.installGraphics(); break;
    case 'startCapture':
      if (a[0]?.consent !== true) throw new Error('Read and accept the capture notice first.');
      p.startCapture();
      break;
    case 'stopCapture': p.stopCapture(); break;
    case 'testRound': await p.testRound(a[0] === 'stop' ? 'stop' : 'start'); break;
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
