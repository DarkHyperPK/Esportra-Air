"use strict";
const { createHash } = require("node:crypto");
const {
  correctionScope,
  validateCorrectionScope,
} = require("./correction-scope");
const { normalizeRundown } = require("./rundown-config");
const { screenScene } = require("./screen-scenes");
const isLocalScreen = (id) =>
  /^air_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id || "",
  );
const DEFAULT_OVERLAY = {
  match: "ingame",
  break: "holding",
  pre_show: "casters",
  post_show: "series",
  sponsor_slot: "sponsor",
  custom: "scoreboard",
};
function templateContext(config, nodeId) {
  let context;
  try {
    context = correctionScope(config, nodeId);
  } catch (_) {
    throw new Error(
      "Choose a match in Air before customizing its broadcast screens.",
    );
  }
  const items = (config.rundown || []).filter(
    (item) => !item.matchId || item.matchId === config.selectedMatchId,
  );
  return {
    ...context,
    source: config.source || "esportra",
    planVersion: createHash("sha256")
      .update(JSON.stringify({ items, version: config.rundownVersion || 0 }))
      .digest("hex"),
  };
}
function templateKey(context) {
  return `${context.source || "esportra"}:${context.showId}:${context.matchId}`;
}
function defaultTemplate(config, nodeId, saved) {
  const context = templateContext(config, nodeId);
  const items = normalizeRundown(
    (config.rundown || []).filter(
      (item) => !item.matchId || item.matchId === config.selectedMatchId,
    ),
  );
  const known = new Map((saved?.items || []).map((item) => [item.id, item]));
  const rows = new Map(
    items.map((item) => [
      item.id,
      {
        id: item.id,
        title: item.name.slice(0, 80),
        overlay: item.overlay || DEFAULT_OVERLAY[item.type],
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        background: "",
        ...known.get(item.id),
      },
    ]),
  );
  const ordered = [];
  for (const id of saved?.removedIds || []) rows.delete(id);
  for (const item of saved?.items || [])
    if (rows.has(item.id)) {
      ordered.push(rows.get(item.id));
      rows.delete(item.id);
    } else if (isLocalScreen(item.id)) {
      ordered.push({ ...item });
    }
  return {
    context,
    revision: saved?.revision || 0,
    items: [...ordered, ...rows.values()],
    removedIds: (saved?.removedIds || []).filter((id) =>
      items.some((item) => item.id === id),
    ),
  };
}
function validateTemplate(input, config, nodeId, saved) {
  const context = templateContext(config, nodeId);
  const { planVersion, ...scope } = context;
  try {
    validateCorrectionScope(input?.context, scope);
  } catch (_) {
    throw new Error(
      "The match or desktop pairing changed. Reload the match template.",
    );
  }
  if (input.context.planVersion !== context.planVersion)
    throw new Error(
      "The published match screens changed. Reload the template before saving or pushing.",
    );
  if (input.revision !== (saved?.revision || 0))
    throw new Error(
      "This template changed in another window. Reload before saving or pushing.",
    );
  const expected = defaultTemplate(config, nodeId).items;
  if (
    !Array.isArray(input.items) ||
    input.items.length > 50 ||
    !input.items.length
  )
    throw new Error("Choose 1–50 broadcast screens.");
  const ids = new Set(expected.map((item) => item.id));
  const seen = new Set();
  const rows = input.items.map((item) => {
    if (
      !item ||
      seen.has(item.id) ||
      !(ids.has(item.id) || isLocalScreen(item.id)) ||
      Object.keys(item).some(
        (key) =>
          ![
            "id",
            "title",
            "overlay",
            "x",
            "y",
            "width",
            "height",
            "background",
          ].includes(key),
      )
    )
      throw new Error("Choose a published or local screen with a unique ID.");
    seen.add(item.id);
    if (
      typeof item.title !== "string" ||
      !item.title.trim() ||
      item.title.length > 80 ||
      /[<>\x00-\x1f\x7f]/.test(item.title)
    )
      throw new Error("Use a plain screen title (1–80 characters).");
    screenScene(item.overlay);
    if (
      typeof item.background !== "string" ||
      item.background.length > 256 ||
      /[\x00-\x1f\x7f]/.test(item.background)
    )
      throw new Error("Choose a valid OBS video or camera input.");
    if (
      ![item.x, item.y, item.width, item.height].every(Number.isSafeInteger) ||
      item.x < 0 ||
      item.y < 0 ||
      item.width < 1 ||
      item.height < 1 ||
      item.x + item.width > 1920 ||
      item.y + item.height > 1080
    )
      throw new Error("Keep the HUD inside the 1920 × 1080 canvas.");
    return { ...item, title: item.title.trim() };
  });
  return {
    context,
    revision: (saved?.revision || 0) + 1,
    items: rows,
    removedIds: expected
      .filter((item) => !rows.some((row) => row.id === item.id))
      .map((item) => item.id),
  };
}
function sceneName(context, item) {
  const suffix = createHash("sha256")
    .update(`${templateKey(context)}:${item.id}`)
    .digest("hex")
    .slice(0, 10);
  return `Air · ${item.title} · ${suffix}`;
}
function templateRows(draft, registry) {
  return draft.items.map((item) => {
    let output = registry
      .list()
      .find((output) => output.overlay === item.overlay && output.followMatch);
    if (!output) {
      registry.add({
        name: item.overlay.replaceAll("-", " "),
        overlay: item.overlay,
        followMatch: true,
      });
      output = registry
        .list()
        .find(
          (output) => output.overlay === item.overlay && output.followMatch,
        );
    }
    return {
      ...item,
      sceneName: sceneName(draft.context, item),
      url: output.url,
    };
  });
}
function templateRundown(config, applied) {
  if (
    !applied ||
    applied.context?.showId !== config.showId ||
    applied.context?.matchId !== config.selectedMatchId
  )
    return config;
  const selected = new Map(
    (config.rundown || [])
      .filter(
        (item) => !item.matchId || item.matchId === config.selectedMatchId,
      )
      .map((item) => [item.id, item]),
  );
  const ordered = (applied.items || [])
    .filter((item) => selected.has(item.id) || isLocalScreen(item.id))
    .map((item) => {
      const original = selected.get(item.id) || {
        id: item.id,
        type: "custom",
        matchId: config.selectedMatchId,
        plan: {
          trigger: "manual",
          mode: "manual",
          holdMode: "manual",
          holdSeconds: 0,
          graphics: [item.overlay],
          transition: { mode: "fade", name: "Fade", durationMs: 300 },
        },
      };
      selected.delete(item.id);
      return {
        ...original,
        title: item.title,
        overlay: item.overlay,
        ...(original.plan
          ? { plan: { ...original.plan, graphics: [item.overlay] } }
          : {}),
      };
    });
  return {
    ...config,
    rundown: [
      ...ordered,
      ...(config.rundown || []).filter(
        (item) => item.matchId && item.matchId !== config.selectedMatchId,
      ),
    ],
  };
}
module.exports = {
  templateContext,
  templateKey,
  defaultTemplate,
  validateTemplate,
  sceneName,
  templateRows,
  templateRundown,
};
