"use strict";
const SCENES = {
  match: "ESA_Gameplay",
  break: "ESA_Holding",
  pre_show: "ESA_Casters",
  post_show: "ESA_Casters",
  sponsor_slot: "ESA_Fullscreen",
  custom: "ESA_Fullscreen",
};
function normalizeRundown(items) {
  if (!Array.isArray(items) || items.length > 200)
    throw new Error("Rundown must contain at most 200 segments.");
  const ids = new Set();
  return items.map((item) => {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id))
      throw new Error("Each segment needs a unique ID.");
    ids.add(item.id);
    const name = item.title || item.name;
    if (typeof name !== "string" || !name.trim() || name.length > 200)
      throw new Error("Each segment needs a title.");
    if (!Object.hasOwn(SCENES, item.type))
      throw new Error("Unknown segment type.");
    return {
      id: item.id,
      name,
      type: item.type,
      scene: SCENES[item.type],
      autoTake: false,
      holdWindowMs: 30000,
      notes: typeof item.notes === "string" ? item.notes : "",
    };
  });
}
function applyRundown(config, runner) {
  const rundown = normalizeRundown(config.rundown || []);
  if (
    runner
      .getState()
      .segments.some((segment) =>
        ["armed", "holding", "taking", "on_air"].includes(segment.state),
      )
  )
    return {
      applied: false,
      reason:
        "Production is active. Finish the current rundown before replacing it.",
    };
  runner.loadRundown(rundown);
  return { applied: true, count: rundown.length };
}
module.exports = { normalizeRundown, applyRundown };
