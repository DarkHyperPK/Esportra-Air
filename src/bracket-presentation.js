"use strict";
function registerBracket({
  register,
  commands,
  config,
  getShow,
  getNodeId,
  getToken,
  fetch,
  apiBase,
  patch,
}) {
  let cached = null,
    lastAt = 0,
    inflight = null,
    lastSent = "";
  const context = () => {
    const show = getShow();
    return show
      ? {
          source: show.source || "esportra",
          showId: show.showId,
          matchId: show.selectedMatchId,
          nodeId: getNodeId(),
        }
      : null;
  };
  const key = () => `${getShow()?.source || "esportra"}:${getShow()?.showId}`;
  async function read() {
    const bound = context();
    if (!bound) return { ok: true, stages: [], matches: [], context: null };
    const show = getShow(),
      scope = JSON.stringify(bound);
    let data;
    if (show.source === "standalone")
      data = {
        stages: show.bracketDocument?.stages || [],
        matches: show.bracketMatches || [],
      };
    else {
      if (cached?.scope !== scope) {
        cached = null;
        lastSent = "";
      }
      if (!cached || Date.now() - lastAt >= 5000) {
        if (!inflight)
          inflight = (async () => {
            try {
              const response = await fetch(
                `${apiBase}/api/broadcast/nodes/shows/${show.showId}/bracket`,
                {
                  headers: { Authorization: "Bearer " + getToken() },
                  timeout: 3000,
                  redirect: "error",
                  size: 4 * 1024 * 1024,
                },
              );
              if (!response.ok)
                throw new Error(
                  "Published bracket data is unavailable. Existing on-air data is retained.",
                );
              const result = await response.json();
              if (JSON.stringify(context()) !== scope)
                throw new Error("Selected match changed.");
              cached = { scope, data: result };
              lastAt = Date.now();
            } finally {
              inflight = null;
            }
          })();
        try {
          await inflight;
        } catch (error) {
          if (!cached)
            return {
              ok: false,
              error: error.message,
              context: bound,
              stages: [],
              matches: [],
            };
          return {
            ...cached.data,
            ok: true,
            context: bound,
            view: config().get("bracketViews")?.[key()] || {},
            warning: error.message,
          };
        }
      }
      data = cached.data;
    }
    const view = config().get("bracketViews")?.[key()] || {
      stageId: data.stages?.[0]?.id || "",
      side: "upper",
      page: 0,
      startRound: 0,
      mode: "matches",
    };
    return { ok: true, ...data, context: bound, view };
  }
  async function publish(data) {
    if (
      !data?.context ||
      JSON.stringify(data.context) !== JSON.stringify(context())
    )
      return;
    const state = {
      stages: data.stages,
      matches: data.matches,
      view: data.view,
    };
    const signature = JSON.stringify([data.context, state]);
    if (signature === lastSent) return;
    await patch(getShow().matchCode, { broadcastBracket: state });
    lastSent = signature;
  }
  register(commands.BRACKET_GET, async () => {
    try {
      const data = await read();
      if (data.ok && !data.warning) await publish(data);
      return data;
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  register(commands.BRACKET_VIEW_SET, async (_event, input) => {
    try {
      const data = await read();
      if (
        !data.ok ||
        JSON.stringify(input?.context) !== JSON.stringify(data.context)
      )
        throw new Error("The selected match changed. Reload bracket settings.");
      const view = input.view;
      const stage = data.stages.find((stage) => stage.id === view?.stageId);
      if (
        !stage ||
        !["upper", "lower", "final", "group", "all"].includes(view.side) ||
        !Number.isInteger(view.page) ||
        view.page < 0 ||
        view.page > 250 ||
        !Number.isInteger(view.startRound) ||
        view.startRound < 0 ||
        view.startRound > 32 ||
        !["matches", "standings"].includes(view.mode) ||
        (view.group &&
          (!Array.isArray(stage.matches) ||
            !stage.matches.some((node) => node.group === view.group)))
      )
        throw new Error("Choose an available stage, section, round and page.");
      const next = {
        stageId: view.stageId,
        side: view.side,
        page: view.page,
        startRound: view.startRound,
        mode: view.mode,
        group: view.group || "",
      };
      config().set("bracketViews", {
        ...(config().get("bracketViews") || {}),
        [key()]: next,
      });
      await publish({ ...data, view: next });
      return { ok: true, view: next };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
  return {
    refresh: async () => {
      if (!getShow()) return;
      const data = await read();
      if (data.ok && !data.warning) await publish(data);
    },
  };
}
module.exports = { registerBracket };
