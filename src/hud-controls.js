"use strict";
const {
  validate,
  fromState,
} = require("../esportra-valorant-hud/core/hud-settings");

function registerHudControls({
  register,
  commands,
  getShow,
  previewBase = "http://localhost:5300",
  getNodeId,
  authorized,
  config,
  read,
  patch,
  log = () => {},
}) {
  let pending = Promise.resolve();
  function context() {
    const show = getShow();
    if (!authorized() || !show?.selectedMatchId)
      throw new Error("Choose a match before editing its HUD.");
    return {
      source: show.source || "esportra",
      showId: show.showId,
      matchId: show.selectedMatchId,
      matchCode: show.matchCode,
      nodeId: getNodeId(),
    };
  }
  const key = (c) => `${c.source}:${c.showId}:${c.matchId}`;
  function check(input) {
    const c = context();
    if (!input || Object.keys(c).some((name) => input[name] !== c[name]))
      throw new Error("The selected match changed. Reopen HUD controls.");
    return c;
  }
  function saved(c) {
    return config().get("hudControlSettings")?.[key(c)] || {};
  }
  function store(c, value) {
    config().set("hudControlSettings", {
      ...(config().get("hudControlSettings") || {}),
      [key(c)]: value,
    });
  }
  async function get() {
    const c = context(),
      state = await read(c.matchCode);
    check(c);
    const current = saved(c);
    return {
      ok: true,
      context: c,
      previewBase,
      teams: getShow()?.teams || [],
      draft: current.draft || fromState(state),
      applied: current.applied || null,
      liveSettings: fromState(state),
    };
  }
  async function applyDraft(c = context()) {
    check(c);
    const current = saved(c);
    if (!current.draft) return;
    const value = validate(current.draft);
    await patch(c.matchCode, value);
    check(c);
    store(c, { ...current, applied: current.draft });
  }
  function appliedPatch(show) {
    const c = {
      source: show.source || "esportra",
      showId: show.showId,
      matchId: show.selectedMatchId,
    };
    const current = saved(c);
    return current.applied ? validate(current.applied) : {};
  }
  register(commands.HUD_CONTROLS_GET, async () => {
    try {
      return await get();
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  register(commands.HUD_CONTROLS_UPDATE, (_event, input = {}) => {
    pending = pending
      .catch(() => {})
      .then(async () => {
        try {
          const c = check(input.context),
            current = saved(c);
          if (input.action === "save" || input.action === "apply") {
            validate(input.settings);
            store(c, { ...current, draft: input.settings });
            if (input.action === "apply") await applyDraft(c);
          } else if (input.action === "graphic") {
            const value = require("./graphic-actions").graphicPatch(
              input.graphic?.kind,
              input.graphic?.input,
            );
            await patch(c.matchCode, value);
            check(c);
          } else if (
            input.action === "countdown-start" ||
            input.action === "countdown-stop"
          ) {
            const state = await read(c.matchCode);
            check(c);
            const holding =
              input.action === "countdown-start"
                ? validate({ holding: input.settings?.holding }).holding
                : null;
            await patch(c.matchCode, {
              holding: {
                ...holding,
                target: holding ? Date.now() + holding.minutes * 60000 : 0,
              },
            });
            check(c);
            if (holding)
              store(c, {
                ...current,
                applied: { ...(current.applied || fromState(state)), holding },
              });
          } else throw new Error("Choose a supported HUD action.");
          log({
            type: "hud_controls",
            actor: "operator",
            data: { action: input.action },
          });
          return await get();
        } catch (error) {
          return { ok: false, error: error.message };
        }
      });
    return pending;
  });
  return {
    applyDraft,
    appliedPatch,
    draftSettings: () => saved(context()).draft || null,
  };
}
module.exports = { registerHudControls };
