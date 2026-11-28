// vMix (28 Nov): what Air reads from the producer's vMix and the three calls it may make, all from vMix's official
// Web API pages (docs/vmix.md). Air points vMix's Web Browser inputs at its own pages; it never switches, cuts,
// fades, overlays, layers or outputs anything in vMix, and cannot add an input (a Web Browser input is not an
// `AddInput` type in the documentation), so the producer adds each one once (Add Input › Web Browser).
import { localHost } from './pcob-status.ts';

/** The only vMix functions Air sends. `src/main/vmix.ts` refuses anything else; test/vmix.test.ts keeps it so. */
export const VMIX_FUNCTIONS = ['SetInputName', 'BrowserNavigate', 'BrowserReload'] as const;
export type VmixFunction = (typeof VMIX_FUNCTIONS)[number];

export const VMIX_PORT = 8088;
export const VMIX_NOTE = 'Air never switches, cuts or overlays anything in vMix. It only renames and points the Web Browser inputs you pair.';

/** One input of vMix's `/api/` XML (`<input key number type title>`). */
export interface VmixInput { key: string; number: number; type: string; title: string; /** A Web Browser input (its type names a browser). */ browser: boolean }

/** An Air page the show needs in vMix: its input is titled `name` and shows `url`. */
export interface VmixPage { id: string; label: string; name: string; url: string }

/** paired: its input is in vMix; missing: it was paired and the input is gone (deleted in vMix); unpaired: no input yet; unknown: vMix is not connected. */
export type VmixPageStatus = 'paired' | 'missing' | 'unpaired' | 'unknown';
export interface VmixPageView extends VmixPage { status: VmixPageStatus; key: string | null; title: string | null }

export interface VmixView {
  state: 'off' | 'connecting' | 'connected' | 'error';
  /** host:port as typed last, or the default. */
  host: string;
  error: string | null;
  lastAt: number | null;
  /** The Web Browser inputs vMix has now (the pairing choices). */
  inputs: VmixInput[];
  pages: VmixPageView[];
  /** vMix is on another PC while Graphics on the local network is off. */
  warning: string | null;
}
export const VMIX_OFF: VmixView = { state: 'off', host: `127.0.0.1:${VMIX_PORT}`, error: null, lastAt: null, inputs: [], pages: [], warning: null };

/** Saved per PC (`store.data.vmix`): the address, which input shows which page, and the address each was last pointed at. */
export interface SavedVmix { host: string; port: number; pairs: Record<string, string>; pointed?: Record<string, string> }

/** vMix's address: this PC or the local network only, port 8088 unless given. */
export const vmixAddress = (input: string) => localHost(input, VMIX_PORT);
export const isLoopback = (host: string) => host === 'localhost' || /^127\./.test(host);

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return entities[e.toLowerCase()] ?? m;
});

/** Reads the inputs of vMix's `/api/` XML. Tolerant: attribute order, quotes and extra attributes or elements do not matter. */
export function parseVmixInputs(xml: string): VmixInput[] {
  const inside = /<inputs\b[^>]*>([\s\S]*?)<\/inputs>/i.exec(xml)?.[1] ?? '';
  const out: VmixInput[] = [];
  for (const tag of inside.matchAll(/<input\s((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)) {
    const a: Record<string, string> = {};
    for (const m of tag[1]!.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) a[m[1]!.toLowerCase()] = decode(m[2] ?? m[3] ?? '');
    if (!a.key) continue;
    const type = a.type ?? '';
    out.push({ key: a.key, number: Number(a.number) || 0, type, title: a.title ?? a.shorttitle ?? '', browser: /browser/i.test(type) });
  }
  return out;
}
