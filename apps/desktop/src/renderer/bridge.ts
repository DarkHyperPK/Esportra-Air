// `window.air` in the app. In a plain browser (development and automated walkthroughs), an HTTP
// bridge to the dev host (dev/host.ts) provides the same calls.
import type { AirApi, ApiMethod, Snapshot } from '../shared/api.ts';

declare global {
  interface Window {
    air?: AirApi;
  }
}

function httpBridge(base: string): AirApi {
  const call = async (method: ApiMethod, args: unknown[]) => {
    const res = await fetch(`${base}/call/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Request failed');
    return body;
  };
  const api = new Proxy({} as AirApi, {
    get: (_t, name: string) =>
      name === 'onSnapshot'
        ? (listener: (s: Snapshot) => void) => {
            const source = new EventSource(`${base}/events`);
            source.onmessage = (e) => listener(JSON.parse(e.data));
            return () => source.close();
          }
        : (...args: unknown[]) => call(name as ApiMethod, args),
  });
  return api;
}

export const air: AirApi = window.air ?? httpBridge(new URLSearchParams(location.search).get('host') ?? 'http://127.0.0.1:5320');
