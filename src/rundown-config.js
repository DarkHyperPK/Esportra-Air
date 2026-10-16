"use strict";
const { screenScene } = require('./screen-scenes');
const { validateTransition } = require('./obs-transitions');
const { normalizePlan } = require('./segment-plan');
const SCENES = {
  match: "ESA_Gameplay",
  break: "ESA_Holding",
  pre_show: "ESA_Casters",
  post_show: "ESA_Casters",
  sponsor_slot: "ESA_Fullscreen",
  custom: "ESA_Fullscreen",
};
function normalizeRundown(items, mappings = {}) {
  if (!Array.isArray(items) || items.length > 200)
    throw new Error("Show flow can contain up to 200 screens.");
  const ids = new Set();
  return items.map((item) => {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id))
      throw new Error("Each screen needs a unique ID.");
    ids.add(item.id);
    const name = item.title || item.name;
    if (typeof name !== "string" || !name.trim() || name.length > 200)
      throw new Error("Each screen needs a name.");
    if (!Object.hasOwn(SCENES, item.type))
      throw new Error("Unknown screen type.");
    const mapping = Object.hasOwn(mappings, item.id) ? mappings[item.id] : null;
    const plan = normalizePlan(item.plan);
    const overlay = plan?.graphics[0] || item.overlay;
    if (mapping && (typeof mapping.scene !== 'string' || !mapping.scene.trim() || mapping.scene.length > 256)) throw new Error('Choose a valid scene for every mapped item.');
    return {
      id: item.id,
      name,
      type: item.type,
      scene: mapping?.scene || plan?.scene || (overlay ? screenScene(overlay) : SCENES[item.type]),
      transition: mapping ? validateTransition(mapping.transition) : plan?.transition || null,
      overlay: overlay || null,
      matchId: item.matchId || null,
      autoTake: plan?.mode === 'automatic',
      trigger: plan?.trigger || 'manual',
      mode: plan?.mode || 'manual',
      graphics: plan?.graphics || (overlay ? [overlay] : []),
      mapNumber: plan?.mapNumber || null,
      holdMode: plan?.holdMode || 'manual',
      holdWindowMs: plan ? plan.holdSeconds * 1000 : 30000,
      notes: typeof item.notes === "string" ? item.notes : "",
      planWarning: typeof item.planWarning === 'string' ? item.planWarning : null,
    };
  });
}
function applyRundown(config, runner, mappings = {}) {
  const rundown = normalizeRundown((config.rundown || []).filter(item => !item.matchId || item.matchId === config.selectedMatchId), mappings);
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
        "Production is active. Stop the current show flow before replacing it.",
    };
  runner.loadRundown(rundown);
  return { applied: true, count: rundown.length };
}
module.exports = { normalizeRundown, applyRundown };
