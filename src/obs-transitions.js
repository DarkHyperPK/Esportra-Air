'use strict';

function validateTransition(input) {
  if (input === undefined || input === null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose a valid OBS transition.');
  if (!['cut', 'fade', 'stinger'].includes(input.mode)) throw new Error('Choose Cut, Fade or Stinger.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 256) throw new Error('Choose a transition available in OBS.');
  if (input.mode === 'fade' && (!Number.isInteger(input.durationMs) || input.durationMs < 50 || input.durationMs > 10000)) throw new Error('Fade duration must be 50–10,000 milliseconds.');
  return { mode: input.mode, name: input.name, ...(input.mode === 'fade' ? { durationMs: input.durationMs } : {}) };
}

function transitionMatches(choice, transition) {
  const kinds = { cut: 'cut_transition', fade: 'fade_transition', stinger: 'obs_stinger_transition' };
  return transition.transitionName === choice.name && transition.transitionKind === kinds[choice.mode];
}

module.exports = { validateTransition, transitionMatches };
