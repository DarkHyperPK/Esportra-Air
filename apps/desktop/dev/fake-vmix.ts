// A stand-in vMix (28 Nov) for the dev host and tests: serves the Web API's state XML at /api/ in the documented
// shape (`<vmix><inputs><input key number type title>`) and accepts only the three functions Air may send
// (SetInputName, BrowserNavigate, BrowserReload). Anything else is refused with 400 and recorded in `refused`,
// so a test fails if Air ever sends a function that could change what is on air.
import { createServer, type Server } from 'node:http';
import { VMIX_FUNCTIONS } from '../src/shared/vmix.ts';

export interface FakeInput { key: string; number: number; type: string; title: string; url?: string }
export interface FakeCall { fn: string; input: string | null; value: string | null }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export class FakeVmix {
  inputs: FakeInput[] = [];
  /** Every accepted call, in order. */
  calls: FakeCall[] = [];
  /** Every call refused for naming another function. */
  refused: string[] = [];
  /** Every request path, accepted or not. */
  requests: string[] = [];
  port = 0;
  private server: Server | null = null;
  private n = 0;

  addInput(type: string, title: string): FakeInput {
    const i: FakeInput = { key: `00000000-0000-4000-8000-${String(++this.n).padStart(12, '0')}`, number: this.inputs.length + 1, type, title };
    this.inputs.push(i);
    return i;
  }
  removeInput(key: string) { this.inputs = this.inputs.filter((i) => i.key !== key).map((i, n) => ({ ...i, number: n + 1 })); }

  xml() {
    return `<?xml version="1.0" encoding="utf-8"?><vmix><version>29.0.0.1</version><edition>Pro</edition><inputs>${this.inputs.map((i) =>
      `<input key="${i.key}" number="${i.number}" type="${esc(i.type)}" title="${esc(i.title)}" shortTitle="${esc(i.title)}" state="Paused" position="0" duration="0" loop="False">${esc(i.title)}</input>`).join('')}</inputs><active>1</active><preview>1</preview></vmix>`;
  }

  listen(port = 0): Promise<this> {
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      this.requests.push(req.url ?? '');
      if (url.pathname !== '/api/' && url.pathname !== '/api') return void res.writeHead(404).end();
      const fn = url.searchParams.get('Function');
      if (!fn) return void res.writeHead(200, { 'Content-Type': 'text/xml' }).end(this.xml());
      if (!(VMIX_FUNCTIONS as readonly string[]).includes(fn)) { this.refused.push(fn); return void res.writeHead(400).end(`Air may not call ${fn}`); }
      const key = url.searchParams.get('Input');
      const input = this.inputs.find((i) => i.key === key || i.title === key || String(i.number) === key);
      if (!input) return void res.writeHead(400).end('No such input');
      const value = url.searchParams.get('Value');
      this.calls.push({ fn, input: key, value });
      if (fn === 'SetInputName' && value !== null) input.title = value;
      if (fn === 'BrowserNavigate' && value !== null) input.url = value;
      res.writeHead(200).end();
    });
    return new Promise((ok) => this.server!.listen(port, '127.0.0.1', () => { this.port = (this.server!.address() as { port: number }).port; ok(this); }));
  }
  close() { return new Promise<void>((ok) => { if (!this.server) return ok(); this.server.close(() => ok()); this.server.closeAllConnections(); this.server = null; }); }
}
