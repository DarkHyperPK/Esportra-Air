const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, generateKeyPairSync, sign } = require("node:crypto");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { resolvePlayers, playerKey } = require("../src/player-identities");
const {
  blankProject,
  showConfig,
  validateProject,
} = require("../src/air-projects");
const Store = require("../src/air-local-store");
const { verifyLease } = require("../src/air-access");
const { AirSession } = require("../src/air-session");
const Feed = require("../src/production-feed");
const {
  defaultTemplate,
  validateTemplate,
  templateRundown,
} = require("../src/obs-template");
const ids = () => ({ id: randomUUID(), workspaceId: randomUUID() });
function project() {
  const p = {
    ...ids(),
    ...blankProject("Independent final"),
    revision: 0,
    localVersion: 0,
  };
  p.document.teams = ["North", "South"].map((name) => ({
    id: randomUUID(),
    name,
    tag: name.slice(0, 3),
    players: [
      {
        id: randomUUID(),
        originalName: name + " official",
        inGameName: name + "#TAG",
        gameId: null,
        hudNickname: name + " TV",
        role: "starter",
      },
    ],
  }));
  p.document.matches = [
    {
      id: randomUUID(),
      title: "Final",
      teamIds: p.document.teams.map((t) => t.id),
      bestOf: 3,
      mapPool: ["Haven"],
      status: "scheduled",
      scores: [0, 0],
    },
  ];
  return p;
}
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  }),
  pem = publicKey.export({ type: "spki", format: "pem" });
function lease(userId, deviceId, now, duration = 86400000) {
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      userId,
      deviceId,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + duration).toISOString(),
    }),
  );
  return {
    algorithm: "RS256",
    publicKey: pem,
    payload: payload.toString("base64"),
    signature: sign("RSA-SHA256", payload, privateKey).toString("base64"),
  };
}

test("verified game IDs survive side and roster order changes without mutating original names", () => {
  const p = project(),
    player = p.document.teams[0].players[0];
  player.gameId = randomUUID();
  const live = [
    [],
    [{ puuid: player.gameId, name: "Renamed", inGameName: "Different#TAG" }],
  ];
  const rows = resolvePlayers(p.document.teams, live);
  assert.equal(rows[0].players[0].state, "matched");
  assert.equal(rows[0].players[0].captured.team, 1);
  assert.equal(rows[0].players[0].originalName, "North official");
  assert.equal(player.originalName, "North official");
});
test("only exact full identity auto matches; partial and duplicate identities need confirmation", () => {
  const p = project(),
    player = p.document.teams[0].players[0],
    live = [
      [{ puuid: randomUUID(), name: "North", inGameName: "North#TAG" }],
      [],
    ];
  assert.equal(
    resolvePlayers(p.document.teams, live)[0].players[0].state,
    "matched",
  );
  player.inGameName = "North";
  assert.equal(
    resolvePlayers(p.document.teams, live)[0].players[0].state,
    "needs_confirmation",
  );
  player.inGameName = "North#TAG";
  p.document.teams[1].players[0].inGameName = player.inGameName;
  assert.equal(
    resolvePlayers(p.document.teams, live)[0].players[0].state,
    "needs_confirmation",
  );
});
test("confirmed binding and HUD nickname follow stable player ID across substitution", () => {
  const p = project(),
    team = p.document.teams[0],
    player = team.players[0],
    gameId = randomUUID(),
    key = playerKey(team, player);
  player.role = "substitute";
  const rows = resolvePlayers(
    p.document.teams,
    [[], [{ puuid: gameId, name: "North" }]],
    { [key]: { gameId, nickname: "TV NAME" } },
  );
  assert.equal(rows[0].players[0].hudNickname, "TV NAME");
  assert.equal(rows[0].players[0].state, "matched");
  assert.equal(player.originalName, "North official");
});
test("packet buffer remains bounded, source scoped and independent of display pause", () => {
  let now = 10000;
  const feed = new Feed({ now: () => now });
  feed.reset("AIR_A");
  feed.recordPackets("OTHER", [{ secret: "different match" }]);
  for (let n = 0; n < 120; n++) feed.recordPackets("AIR_A", [{ n }]);
  assert.equal(feed.packets.length, 100);
  assert.equal(feed.packets[0].data.n, 20);
  const displayed = structuredClone(feed.packets);
  now++;
  feed.recordPackets("AIR_A", [{ n: 121 }]);
  assert.equal(displayed.at(-1).data.n, 119);
  assert.equal(feed.packets.at(-1).data.n, 121);
  feed.reset("AIR_B");
  assert.equal(feed.packets.length, 0);
});
test("signed access rejects tampering, wrong accounts/devices, clock rollback and overlong cache", () => {
  const userId = randomUUID(),
    deviceId = randomUUID(),
    now = Date.now(),
    signed = lease(userId, deviceId, now);
  const context = { userId, deviceId, now, pinnedKey: pem, lastSeenAt: now };
  assert.equal(verifyLease(signed, context), true);
  assert.equal(
    verifyLease(signed, { ...context, userId: randomUUID() }),
    false,
  );
  assert.equal(
    verifyLease(signed, { ...context, deviceId: randomUUID() }),
    false,
  );
  assert.equal(verifyLease(signed, { ...context, now: now + 86400000 }), false);
  assert.equal(
    verifyLease(signed, { ...context, lastSeenAt: now + 600000 }),
    false,
  );
  assert.equal(
    verifyLease(
      { ...signed, payload: Buffer.from("{}").toString("base64") },
      context,
    ),
    false,
  );
  assert.equal(
    verifyLease(lease(userId, deviceId, now, 8 * 86400000), context),
    false,
  );
});
test("atomic local snapshots retain concurrent edits and require explicit conflict resolution", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "air-store-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const user = randomUUID(),
    store = new Store(root, "https://fixture.invalid", user),
    p = project();
  const sent = store.edit(p);
  const newer = store.edit({ ...sent, title: "Local next draft" });
  store.acknowledge(sent, { ...sent, revision: 1 });
  assert.equal(store.read(p.id).title, newer.title);
  assert.equal(store.read(p.id).dirty, true);
  store.conflict(p.id, { ...sent, title: "Cloud change", revision: 2 });
  assert.equal(store.read(p.id).title, newer.title);
  assert.equal(store.resolve(p.id, "keep-local").revision, 2);
  assert.ok(
    fs.readdirSync(store.root).some((name) => name.includes("-conflict-")),
  );
  assert.equal(
    new Store(root, "https://fixture.invalid", randomUUID()).list().length,
    0,
  );
  assert.equal(
    new Store(root, "https://another.invalid", user).list().length,
    0,
  );
});
test("standalone adapter excludes completed matches and uses isolated IDs and Fade default", () => {
  const p = project(),
    m = p.document.matches[0];
  p.document.matches.push({ ...m, id: randomUUID(), status: "completed" });
  const cfg = showConfig(p, m.id);
  assert.equal(cfg.source, "standalone");
  assert.match(cfg.matchCode, /^AIR_/);
  assert.equal(cfg.matches.length, 1);
  assert.equal(cfg.matchHistory.length, 1);
  assert.equal(cfg.rundown[0].plan.transition.durationMs, 300);
  assert.throws(() => showConfig(p, p.document.matches[1].id), /upcoming/);
  assert.equal(cfg.teams[0].roster[0].originalName, "North official");
});
test("screen removal survives save and application to the production screen list", () => {
  const p = project(),
    cfg = showConfig(p, p.document.matches[0].id),
    node = randomUUID(),
    draft = defaultTemplate(cfg, node);
  draft.items = draft.items.slice(1);
  const saved = validateTemplate(draft, cfg, node);
  assert.equal(defaultTemplate(cfg, node, saved).items.length, 4);
  assert.equal(templateRundown(cfg, saved).rundown.length, 4);
});
test("manual brackets reject cycles instead of advancing winners", () => {
  const p = project(),
    a = p.document.matches[0];
  const b = { ...a, id: randomUUID() };
  p.document.matches.push(b);
  p.document.bracket.stages = [
    {
      id: randomUUID(),
      label: "Finals",
      format: "single_elimination",
      matches: [
        {
          id: randomUUID(),
          matchId: a.id,
          round: 0,
          side: "upper",
          nextMatchId: b.id,
        },
        {
          id: randomUUID(),
          matchId: b.id,
          round: 1,
          side: "final",
          nextMatchId: a.id,
        },
      ],
    },
  ];
  assert.throws(() => validateProject(p), /cycle/);
});
test("explicit access denial clears cached lease while transient offline launch retains verified access", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "air-session-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const userId = randomUUID(),
    deviceId = randomUUID(),
    now = Date.now();
  let denied = false;
  const session = new AirSession({
    apiBase: "https://fixture.invalid",
    fetch: async () => {
      if (denied)
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: "Device revoked" }),
        };
      throw new Error("Offline");
    },
    keytar: { setPassword: async () => {} },
    root,
    deviceId,
    deviceName: "Desk",
    mode: "production",
    service: "test",
  });
  session.session = {
    userId,
    accessToken: "fixture",
    refreshToken: "fixture",
    expiresAt: now + 999999,
    account: { validUntil: new Date(now + 86400000).toISOString() },
    workspaces: [],
  };
  session.access = {
    lease: lease(userId, deviceId, now),
    pinnedKey: pem,
    lastSeenAt: now,
    online: false,
  };
  await session.checkAccess();
  assert.equal(session.status().canProduce, true);
  denied = true;
  await assert.rejects(session.checkAccess(), /revoked/);
  assert.equal(session.status().canProduce, false);
  assert.equal(session.access.lease, null);
});
test("refresh requests serialize and a signed-out account cannot be restored by late response", async () => {
  let finish,
    calls = 0;
  const pending = new Promise((resolve) => (finish = resolve));
  const session = new AirSession({
    apiBase: "https://fixture.invalid",
    fetch: async () => {
      calls++;
      await pending;
      return {
        ok: true,
        json: async () => ({
          access_token: "new",
          refresh_token: "new-refresh",
          expires_in: 3600,
        }),
      };
    },
    keytar: { deletePassword: async () => {}, setPassword: async () => {} },
    root: os.tmpdir(),
    deviceId: randomUUID(),
    service: "test",
  });
  session.session = { userId: randomUUID(), refreshToken: "fixture" };
  const a = session.refresh(),
    b = session.refresh();
  await session.logout();
  finish();
  await assert.rejects(a, /Account changed/);
  await assert.rejects(b, /Account changed/);
  assert.equal(calls, 1);
  assert.equal(session.session, null);
});
