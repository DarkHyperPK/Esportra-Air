// `window.player` in the app. In a plain browser (development and automated checks), an HTTP bridge
// to the dev host (dev/host.ts) provides the same calls.
import type { PlayerApi, PlayerMethod, PlayerSnapshot } from '../shared/api.ts';

declare global {
  interface Window {
    player?: PlayerApi;
  }
}

function httpBridge(base: string): PlayerApi {
  const call = async (method: PlayerMethod, args: unknown[]) => {
    const res = await fetch(`${base}/call/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Request failed');
    return body;
  };
  return new Proxy({} as PlayerApi, {
    get: (_t, name: string) =>
      name === 'onSnapshot'
        ? (listener: (s: PlayerSnapshot) => void) => {
            const source = new EventSource(`${base}/events`);
            source.onmessage = (e) => listener(JSON.parse(e.data));
            return () => source.close();
          }
        : (...args: unknown[]) => call(name as PlayerMethod, args),
  });
}

export const player: PlayerApi = window.player ?? httpBridge(new URLSearchParams(location.search).get('host') ?? 'http://127.0.0.1:5330');
