import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VmixLink, type VmixContext } from '../src/main/vmix.ts';
import { planLobbyScenes, vmixPages } from '../src/main/scene-plan.ts';
import { VMIX_FUNCTIONS, parseVmixInputs, vmixAddress, type SavedVmix, type VmixPage } from '../src/shared/vmix.ts';
import { FakeVmix } from '../dev/fake-vmix.ts';

const pagesFor = (code: string, port = 5300): VmixPage[] => vmixPages(planLobbyScenes({ port, code, sponsors: [{ id: 's', name: 'S', logo: '', line: '', tier: 'title', video: '/clip.mp4' } as never] }));

const rigs: Array<() => Promise<void>> = [];
after(async () => { for (const d of rigs) await d(); });

async function rig(opts: { lan?: string | null } = {}) {
  const vmix = await new FakeVmix().listen();
  let saved: SavedVmix | undefined;
  let code = 'AAAA';
  const ctx: VmixContext = { pages: () => pagesFor(code), load: () => saved, save: (v) => { saved = v; }, lan: () => opts.lan ?? null, log: () => {}, changed: () => {} };
  const link = new VmixLink(ctx);
  const done = async () => { link.disconnect(); await vmix.close(); };
  rigs.push(done);
  return { vmix, link, saved: () => saved, show: (c: string) => { code = c; }, done };
}

test('reads the documented XML: key, number, type and title; browser inputs found by type', () => {
  const xml = `<vmix><version>29</version><inputs>
    <input key="a-1" number="1" type="Browser" title="Browser 1" state="Paused">Browser 1</input>
    <input title='Cam &amp; &quot;mic&quot;' number="2" key='b-2' type="Capture"/>
    <input key="c-3" number="3" type="WebBrowser" title="ESPORTRA · In-game HUD"><overlay index="0"/></input>
  </inputs><active>1</active></vmix>`;
  const got = parseVmixInputs(xml);
  assert.deepEqual(got.map((i) => [i.key, i.number, i.type, i.title, i.browser]), [
    ['a-1', 1, 'Browser', 'Browser 1', true], ['b-2', 2, 'Capture', 'Cam & "mic"', false], ['c-3', 3, 'WebBrowser', 'ESPORTRA · In-game HUD', true]]);
  assert.deepEqual(parseVmixInputs('<vmix></vmix>'), []);
  assert.deepEqual(parseVmixInputs('not xml'), []);
});

test('the pages are the OBS plan’s browser sources, without sponsor videos', () => {
  const plan = planLobbyScenes({ port: 5300, code: 'AAAA', sponsors: [{ id: 's', name: 'S', logo: '', line: '', tier: 'title', video: '/clip.mp4' } as never] });
  const pages = vmixPages(plan);
  const sources = plan.flatMap((s) => s.sources).filter((x) => x.kind !== 'media');
  assert.deepEqual(pages.map((p) => p.url), sources.map((x) => x.url));
  assert.deepEqual(pages.map((p) => p.id).sort(), ['fullscreen', 'fullscreen-over-game', 'holding', 'in-game']);
  assert.ok(pages.every((p) => p.name.startsWith('ESPORTRA · ') && p.url.includes('code=') === false));
  assert.ok(!pages.some((p) => p.id.startsWith('sponsor:')));
});

test('only local-network addresses; port 8088 by default', () => {
  assert.deepEqual(vmixAddress('127.0.0.1'), { host: '127.0.0.1', port: 8088 });
  assert.deepEqual(vmixAddress('192.168.1.30:8099'), { host: '192.168.1.30', port: 8099 });
  assert.deepEqual(vmixAddress('VMIX-PC'), { host: 'vmix-pc', port: 8088 });
  for (const bad of ['8.8.8.8', 'example.com', 'vmix.example.com:8088', '172.32.0.1', '', 'http://x']) assert.equal(vmixAddress(bad), null, bad);
  const link = new VmixLink({ pages: () => [], load: () => undefined, save: () => {}, log: () => {}, changed: () => {} });
  assert.throws(() => link.connect('8.8.8.8'), /network/);
});

test('inputs already titled ESPORTRA · <page> pair by themselves and are pointed at the page', async () => {
  const r = await rig();
  const pages = pagesFor('AAAA');
  const hud = r.vmix.addInput('Browser', pages.find((p) => p.id === 'in-game')!.name);
  r.vmix.addInput('Browser', 'Browser 2');
  r.vmix.addInput('Video', pages.find((p) => p.id === 'holding')!.name); // not a browser input: never a candidate
  r.link.connect(`127.0.0.1:${r.vmix.port}`);
  await r.link.poll();
  assert.equal(r.saved()!.pairs['in-game'], hud.key);
  assert.equal(Object.keys(r.saved()!.pairs).length, 1);
  assert.deepEqual(r.vmix.calls.map((c) => c.fn), ['BrowserNavigate'], 'already named right: only pointed');
  assert.equal(r.vmix.calls[0]!.value, pages.find((p) => p.id === 'in-game')!.url);
  const v = r.link.view();
  assert.equal(v.state, 'connected');
  assert.deepEqual(v.pages.map((p) => [p.id, p.status]).sort(), [['fullscreen', 'unpaired'], ['fullscreen-over-game', 'unpaired'], ['holding', 'unpaired'], ['in-game', 'paired']]);
  assert.deepEqual(v.inputs.map((i) => i.title), [pages.find((p) => p.id === 'in-game')!.name, 'Browser 2'], 'only Web Browser inputs are offered');
  await r.link.poll();
  assert.equal(r.vmix.calls.length, 1, 'a second read does not reload anything');
  await r.done();
});

test('pairing renames the input and points it, then a show change re-points it', async () => {
  const r = await rig();
  const b = r.vmix.addInput('Browser', 'Browser 1');
  r.link.connect(`127.0.0.1:${r.vmix.port}`);
  await r.link.poll();
  await r.link.pair('fullscreen', b.key);
  const p = pagesFor('AAAA').find((x) => x.id === 'fullscreen')!;
  assert.deepEqual(r.vmix.calls.map((c) => [c.fn, c.input, c.value]), [['SetInputName', b.key, p.name], ['BrowserNavigate', b.key, p.url]]);
  assert.equal(r.vmix.inputs[0]!.title, p.name);
  assert.equal(r.saved()!.pairs.fullscreen, b.key);
  assert.equal(r.link.view().pages.find((x) => x.id === 'fullscreen')!.status, 'paired');
  r.show('BBBB');
  await r.link.poll();
  const next = pagesFor('BBBB').find((x) => x.id === 'fullscreen')!;
  assert.notEqual(next.url, p.url);
  assert.deepEqual(r.vmix.calls.slice(2).map((c) => [c.fn, c.value]), [['BrowserNavigate', next.url]], 'only the page address changed: re-pointed, not renamed');
  assert.equal(r.vmix.inputs[0]!.url, next.url);
  await assert.rejects(r.link.pair('holding', b.key), /already shows/);
  await assert.rejects(r.link.pair('holding', 'nope'), /choose one/);
  await r.done();
});

test('a paired input deleted in vMix shows as missing; unpairing forgets it; a non-browser input cannot be paired', async () => {
  const r = await rig();
  const b = r.vmix.addInput('Browser', 'Browser 1');
  const cam = r.vmix.addInput('Video', 'Camera');
  r.link.connect(`127.0.0.1:${r.vmix.port}`);
  await r.link.poll();
  await assert.rejects(r.link.pair('holding', cam.key), /not a Web Browser/);
  await r.link.pair('holding', b.key);
  r.vmix.removeInput(b.key);
  await r.link.poll();
  const row = r.link.view().pages.find((x) => x.id === 'holding')!;
  assert.equal(row.status, 'missing');
  const before = r.vmix.calls.length;
  await assert.rejects(r.link.reload('holding'), /no input/);
  assert.equal(r.vmix.calls.length, before);
  await r.link.pair('holding', null);
  assert.equal(r.link.view().pages.find((x) => x.id === 'holding')!.status, 'unpaired');
  assert.equal(r.saved()!.pairs.holding, undefined);
  await r.done();
});

test('Reload sends BrowserReload for a paired input', async () => {
  const r = await rig();
  const b = r.vmix.addInput('Browser', 'Browser 1');
  r.link.connect(`127.0.0.1:${r.vmix.port}`);
  await r.link.poll();
  await r.link.pair('in-game', b.key);
  await r.link.reload('in-game');
  assert.deepEqual(r.vmix.calls.at(-1), { fn: 'BrowserReload', input: b.key, value: null });
  await r.done();
});

test('a vMix on another PC gets this PC’s network address in the pages', async () => {
  const r = await rig({ lan: '192.168.1.50' });
  const b = r.vmix.addInput('Browser', 'Browser 1');
  // The stand-in listens on this PC; call it by the network name vMix would have on another PC.
  const link = new VmixLink({ pages: () => pagesFor('AAAA'), load: () => r.saved(), save: () => {}, lan: () => '192.168.1.50', lanOn: () => true, log: () => {}, changed: () => {}, fetch: (u, i) => fetch(String(u).replace('192.168.1.30', '127.0.0.1'), i) });
  link.connect(`192.168.1.30:${r.vmix.port}`);
  await link.poll();
  const page = link.view().pages.find((p) => p.id === 'in-game')!;
  assert.ok(page.url.startsWith('http://192.168.1.50:5300/'), page.url);
  link.disconnect();
  void b;
  await r.done();
});

test('a vMix on another PC keeps 127.0.0.1 and warns while Graphics on the local network is off', async () => {
  const r = await rig({ lan: '192.168.1.50' });
  const link = new VmixLink({ pages: () => pagesFor('AAAA'), load: () => r.saved(), save: () => {}, lan: () => '192.168.1.50', lanOn: () => false, log: () => {}, changed: () => {}, fetch: (u, i) => fetch(String(u).replace('192.168.1.30', '127.0.0.1'), i) });
  link.connect(`192.168.1.30:${r.vmix.port}`);
  await link.poll();
  const v = link.view();
  assert.ok(v.pages.find((p) => p.id === 'in-game')!.url.startsWith('http://127.0.0.1:5300/'));
  assert.match(v.warning ?? '', /vMix is on another PC — turn on .Let other PCs on this network load the graphics. in Settings/);
  link.disconnect();
  // A vMix on this PC never warns.
  r.link.connect(`127.0.0.1:${r.vmix.port}`);
  assert.equal(r.link.view().warning, null);
  await r.done();
});

test('Air can send only SetInputName, BrowserNavigate and BrowserReload to vMix', async () => {
  assert.deepEqual([...VMIX_FUNCTIONS], ['SetInputName', 'BrowserNavigate', 'BrowserReload']);
  const r = await rig();
  const b = r.vmix.addInput('Browser', 'Browser 1');
  r.link.connect(`127.0.0.1:${r.vmix.port}`);
  await r.link.poll();
  // The one place a call leaves Air refuses every other function, including the ones that change what is on air.
  const call = (r.link as unknown as { call(fn: string, input: string, value?: string): Promise<void> }).call.bind(r.link);
  for (const fn of ['Cut', 'Fade', 'ActiveInput', 'PreviewInput', 'OverlayInput1In', 'OverlayInput1Out', 'SetOutputExternal2', 'AddInput', 'RemoveInput', 'StartStreaming', 'StartRecording', 'SetLayerInput']) await assert.rejects(call(fn, b.key), /does not send/, fn);
  await r.link.pair('in-game', b.key);
  await r.link.reload('in-game');
  r.show('CCCC');
  await r.link.poll();
  const sent = r.vmix.requests.map((q) => new URL(q, 'http://x').searchParams.get('Function')).filter(Boolean);
  assert.ok(sent.length >= 3);
  assert.ok(sent.every((f) => (VMIX_FUNCTIONS as readonly string[]).includes(f!)), sent.join());
  assert.deepEqual(r.vmix.refused, []);
  // And nothing else in the client names a vMix function.
  const source = readFileSync(resolve(import.meta.dirname, '../src/main/vmix.ts'), 'utf8');
  const named = [...source.matchAll(/'((?:Set|Add|Remove|Start|Stop|Cut|Fade|Active|Preview|Overlay|Browser|Multi|Layer)[A-Za-z0-9]*)'/g)].map((m) => m[1]!);
  assert.ok(named.every((n) => (VMIX_FUNCTIONS as readonly string[]).includes(n)), named.join());
  await r.done();
});

test('vMix not answering is a plain message, and Air keeps trying', async () => {
  const r = await rig();
  const port = r.vmix.port;
  await r.vmix.close();
  r.link.connect(`127.0.0.1:${port}`);
  await r.link.poll();
  const v = r.link.view();
  assert.equal(v.state, 'error');
  assert.match(v.error!, /does not answer/);
  r.link.disconnect();
  assert.equal(r.link.view().state, 'off');
});
