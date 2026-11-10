import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EsportraAccount } from '../src/main/esportra.ts';
import { Store } from '../src/main/store.ts';
import { FakeEsportra } from '../dev/fake-esportra.ts';

class MemorySecrets {
  values = new Map<string, string>();
  get(k: string) { return this.values.get(k) ?? null; }
  set(k: string, v: string | null) { if (v === null) this.values.delete(k); else this.values.set(k, v); }
}

async function setup(options: { now?: () => number } = {}) {
  const backend = await new FakeEsportra().start();
  const dir = mkdtempSync(join(tmpdir(), 'air-esp-'));
  const store = new Store(join(dir, 'air.json'));
  const secrets = new MemorySecrets();
  const deviceId = randomUUID();
  const make = () => new EsportraAccount({ apiBase: backend.url, store, secrets, deviceId, deviceName: 'STUDIO-PC', now: options.now });
  return { backend, store, secrets, deviceId, make, account: make() };
}

test('sign-in registers this PC, stores the lease and lists the producer’s matches', async () => {
  const { backend, store, secrets, deviceId, account } = await setup();
  try {
    assert.equal(account.view().state, 'signed-out');
    await assert.rejects(account.login(backend.email, 'wrong'), /Check your email and password/);
    assert.equal(account.view().state, 'signed-out', 'a failed sign-in leaves nothing behind');
    await account.login(` ${backend.email} `, backend.password);
    const view = account.view();
    assert.equal(view.state, 'online');
    assert.equal(view.email, backend.email);
    assert.equal(view.deviceName, 'STUDIO-PC');
    assert.deepEqual(backend.devices.get(deviceId), { name: 'STUDIO-PC', mode: 'production' });
    assert.equal(view.matches.length, 2);
    assert.deepEqual([view.matches[0]!.teamA, view.matches[0]!.tagA, view.matches[0]!.bestOf, view.matches[0]!.supported], ['Paper Rex', 'PRX', 3, true]);
    assert.equal(view.matches[1]!.logoB, null);
    assert.ok(view.syncedAt);
    // Tokens are in the encrypted secrets, not in the saved settings.
    assert.equal(secrets.values.size, 1);
    assert.equal(JSON.stringify(store.data).includes('access-'), false);
    assert.equal(JSON.stringify(store.data).includes('refresh-'), false);
    assert.equal(JSON.stringify(store.data).includes(backend.password), false);
  } finally { await backend.stop(); }
});

test('a saved sign-in resumes after a restart, and signing out forgets everything', async () => {
  const { backend, store, secrets, make, account } = await setup();
  try {
    await account.login(backend.email, backend.password);
    const again = make();
    assert.equal(again.view().state, 'offline', 'until access is confirmed again, only the saved lease speaks for it');
    await again.start();
    assert.equal(again.view().state, 'online');
    again.logout();
    assert.equal(again.view().state, 'signed-out');
    assert.equal(secrets.values.size, 0);
    assert.equal(store.data.esportra, undefined);
    assert.equal(make().view().state, 'signed-out');
  } finally { await backend.stop(); }
});

test('an expired access token is refreshed, and a dead session signs out cleanly', async () => {
  const { backend, account, secrets } = await setup();
  try {
    await account.login(backend.email, backend.password);
    backend.expireNow();
    await account.refreshMatches();
    assert.ok(backend.calls.includes('POST /api/air/auth/refresh'), 'the 401 triggered one refresh');
    assert.equal(account.view().matches.length, 2);
    // The refresh token is rejected: the session is over.
    backend.expireNow();
    (backend as any).refresh += 1;
    await assert.rejects(account.refreshMatches(), /Sign in again/);
    assert.equal(account.view().state, 'signed-out');
    assert.equal(secrets.values.size, 0, 'the dead tokens are forgotten');
    assert.match(account.view().error ?? '', /session ended/);
  } finally { await backend.stop(); }
});

test('when Esportra is unreachable a signed lease keeps the PC in offline mode, with the last matches', async () => {
  const { backend, account } = await setup();
  try {
    await account.login(backend.email, backend.password);
    backend.down = true;
    await assert.rejects(account.checkAccess(), /not reachable/);
    const view = account.view();
    assert.equal(view.state, 'offline');
    assert.match(view.warning!, /offline on a verified lease/);
    assert.equal(view.matches.length, 2, 'the last list stays available');
  } finally { await backend.stop(); }
});

test('a refusal from Esportra means denied, and removes any lease', async () => {
  const { backend, account, store } = await setup();
  try {
    await account.login(backend.email, backend.password);
    backend.allowed = false;
    await assert.rejects(account.checkAccess(), /expired or was suspended/);
    const view = account.view();
    assert.equal(view.state, 'denied');
    assert.match(view.warning!, /no active Air access/);
    assert.equal(store.data.esportra!.access!.lease, null);
    backend.down = true;
    await assert.rejects(account.checkAccess());
    assert.equal(account.view().state, 'denied', 'being offline afterwards does not bring a refused PC back');
  } finally { await backend.stop(); }
});

test('a lease is refused when it is for another PC, tampered with, or the clock ran backwards', async () => {
  let t = Date.now();
  const { backend, account, store } = await setup({ now: () => t });
  try {
    await account.login(backend.email, backend.password);
    backend.down = true;
    t += 6 * 60_000; // past the five-minute "recently confirmed" window
    assert.equal(account.view().state, 'offline');
    t += 80 * 3600_000; // past the 72 h lease
    assert.equal(account.view().state, 'denied', 'an expired lease no longer proves access');
    t -= 80 * 3600_000;
    const saved = store.data.esportra!;
    const original = saved.access!.lease!;
    saved.access!.lease = { ...original, payload: Buffer.from(JSON.stringify({ version: 1, userId: saved.userId, deviceId: saved.deviceId, issuedAt: new Date(t).toISOString(), expiresAt: new Date(t + 6 * 86400_000).toISOString() })).toString('base64') };
    assert.equal(account.view().state, 'denied', 'a changed payload fails its signature');
    saved.access!.lease = original;
    saved.deviceId = randomUUID();
    assert.equal(account.view().state, 'denied', 'a lease for another PC is refused');
  } finally { await backend.stop(); }
});

test('the roster comes from the backend and malformed matches are ignored', async () => {
  const { backend, account } = await setup();
  try {
    await account.login(backend.email, backend.password);
    const id = account.view().matches[0]!.id;
    const roster = await account.roster(id);
    assert.equal(roster.team1.players.length, 5);
    await assert.rejects(account.roster('not-an-id'), /Choose an Esportra match/);
    backend.matches.push({ ...backend.matches[0]!, id: 'not-a-guid' });
    backend.matches.push({ ...backend.matches[0]!, id: randomUUID(), game: 'cs2', logoA: 'javascript:alert(1)' });
    await account.refreshMatches();
    const list = account.view().matches;
    assert.equal(list.length, 3, 'the row without a valid id is dropped');
    assert.equal(list[2]!.supported, false, 'a game Air cannot produce is marked');
    assert.equal(list[2]!.logoA, null, 'only https logos are kept');
  } finally { await backend.stop(); }
});
