const test = require("node:test");
const assert = require("node:assert/strict");
const { registerHudControls } = require("../src/hud-controls");
const { validate } = require("../esportra-valorant-hud/core/hud-settings");
function fixture() {
  const handlers = {},
    settings = {},
    patches = [];
  let show = {
    source: "esportra",
    showId: "show",
    selectedMatchId: "match",
    matchCode: "FINAL",
  };
  const state = {
    show: { players: true, ticker: true },
    holding: { minutes: 5, message: "Up next" },
    ticker: ["Welcome"],
    lowerThird: { title: "Desk", sub: "Opening" },
    layout: { bannerTheme: "broadcast" },
    teams: [{ name: "Original", score: 4 }],
    players: [[{ name: "Original player" }]],
  };
  const merge = (a, b) => {
    for (const key of Object.keys(b)) {
      if (b[key] && typeof b[key] === "object" && !Array.isArray(b[key]))
        merge(a[key] || (a[key] = {}), b[key]);
      else a[key] = b[key];
    }
  };
  const controller = registerHudControls({
    register: (name, handler) => (handlers[name] = handler),
    commands: { HUD_CONTROLS_GET: "get", HUD_CONTROLS_UPDATE: "update" },
    getShow: () => show,
    getNodeId: () => "node",
    authorized: () => true,
    config: () => ({
      get: (key) => settings[key],
      set: (key, value) => (settings[key] = value),
    }),
    read: async () => structuredClone(state),
    patch: async (code, patch) => {
      patches.push({ code, patch });
      merge(state, patch);
    },
  });
  return {
    state,
    patches,
    controller,
    get: () => handlers.get(),
    update: (input) => handlers.update(null, input),
    setShow: (next) => (show = { ...show, ...next }),
  };
}
test("HUD drafts do not alter live data; explicit apply persists appearance without changing identity or scores", async () => {
  const f = fixture(),
    initial = await f.get(),
    before = structuredClone(f.state),
    draft = structuredClone(initial.draft);
  draft.layers.players = false;
  draft.lowerThird.title = "Live interview";
  const saved = await f.update({
    context: initial.context,
    action: "save",
    settings: draft,
  });
  assert.equal(saved.ok, true);
  assert.deepEqual(f.state, before);
  assert.equal(saved.applied, null);
  await f.controller.applyDraft();
  assert.equal(f.state.show.players, false);
  assert.equal(f.state.lowerThird.title, "Live interview");
  assert.deepEqual(f.state.teams, before.teams);
  assert.deepEqual(f.state.players, before.players);
  assert.equal(
    f.controller.appliedPatch({
      source: "esportra",
      showId: "show",
      selectedMatchId: "match",
    }).show.players,
    false,
  );
  draft.layers.players = true;
  await f.update({ context: initial.context, action: "save", settings: draft });
  assert.equal(
    f.state.show.players,
    false,
    "a later draft stays separate from the applied HUD",
  );
});
test("HUD controls reject stale contexts and keep identical tournament/independent IDs isolated", async () => {
  const f = fixture(),
    initial = await f.get();
  initial.draft.layers.players = false;
  await f.update({
    context: initial.context,
    action: "save",
    settings: initial.draft,
  });
  f.setShow({ source: "standalone" });
  const next = await f.get();
  assert.equal(next.draft.layers.players, true);
  assert.equal(
    (
      await f.update({
        context: initial.context,
        action: "apply",
        settings: initial.draft,
      })
    ).ok,
    false,
  );
  assert.equal(f.patches.length, 0);
  assert.equal(
    (
      await f.update({
        context: { ...next.context, nodeId: "other-node" },
        action: "apply",
        settings: next.draft,
      })
    ).ok,
    false,
  );
});
test("countdown uses the entered duration and stop preserves every game field", async () => {
  const f = fixture(),
    initial = await f.get();
  initial.draft.holding = { minutes: 12, message: "Back shortly" };
  const start = Date.now();
  const result = await f.update({
    context: initial.context,
    action: "countdown-start",
    settings: initial.draft,
  });
  assert.equal(result.ok, true);
  assert.ok(f.state.holding.target >= start + 12 * 60000);
  assert.equal(f.state.holding.message, "Back shortly");
  const players = structuredClone(f.state.players),
    teams = structuredClone(f.state.teams);
  await f.update({ context: initial.context, action: "countdown-stop" });
  assert.equal(f.state.holding.target, 0);
  assert.deepEqual(f.state.players, players);
  assert.deepEqual(f.state.teams, teams);
});
test("HUD settings reject arbitrary patches, markup, unknown layers and excessive content", () => {
  for (const input of [
    { teams: [] },
    { layers: { notALayer: true } },
    { lowerThird: { title: "<img>", sub: "" } },
    { holding: { minutes: 181, message: "" } },
    { ticker: Array(11).fill("too many") },
  ])
    assert.throws(() => validate(input));
  assert.deepEqual(
    validate({
      layers: { ticker: false },
      holding: { minutes: 1, message: "" },
    }),
    { show: { ticker: false }, holding: { minutes: 1, message: "" } },
  );
});

test("live banner actions are match-scoped graphics and cannot mutate game scores", async () => {
  const f = fixture(),
    initial = await f.get(),
    before = structuredClone(f.state.teams);
  const result = await f.update({
    context: initial.context,
    action: "graphic",
    graphic: {
      kind: "banner",
      input: {
        type: "custom",
        team: 0,
        player: 0,
        headline: "Broadcast update",
        subline: "Back in a moment",
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(f.state.banner.text, "Broadcast update");
  assert.deepEqual(f.state.teams, before);
  assert.equal(
    (
      await f.update({
        context: initial.context,
        action: "graphic",
        graphic: {
          kind: "banner",
          input: { type: "custom", team: 0, player: 0, headline: "<script>" },
        },
      })
    ).ok,
    false,
  );
  await f.update({
    context: initial.context,
    action: "graphic",
    graphic: { kind: "hide-banner" },
  });
  assert.equal(f.state.banner.type, "");
});
