'use strict';
const { validateTransition, transitionMatches } = require('./obs-transitions');

function validateSceneMappings(input, segments, inspection) {
  if (!Array.isArray(input) || input.length !== segments.length || input.length > 200) throw new Error('Map every current rundown item once.');
  if (!inspection.connected || inspection.inspectionIncomplete) throw new Error('Connect OBS and refresh its scenes before saving.');
  const expected = new Set(segments.map(item => item.id)), seen = new Set(), result = {};
  for (const item of input) {
    if (!item || !expected.has(item.id) || seen.has(item.id)) throw new Error('Rundown changed. Refresh scene mappings.');
    if (typeof item.scene !== 'string' || !inspection.scenes.includes(item.scene)) throw new Error('A mapped scene is missing from the current OBS collection.');
    const transition = validateTransition(item.transition);
    if (transition && !(inspection.transitions || []).some(available => transitionMatches(transition, available))) throw new Error('A mapped transition is missing from OBS.');
    seen.add(item.id); result[item.id] = { scene: item.scene, transition };
  }
  return result;
}

function missingScenes(segments, scenes) {
  const available = new Set(scenes);
  return [...new Set(segments.map(segment => segment.scene).filter(scene => !available.has(scene)))];
}

module.exports = { validateSceneMappings, missingScenes };
