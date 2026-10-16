'use strict';
const ACTIONS = Object.freeze([
  { id: 'holding', label: 'Change scene · Opening / break', action: 'scene', scene: 'ESA_Holding', description: 'Switch OBS to the holding scene. Studio Mode prepares Preview and then transitions to Program.' },
  { id: 'gameplay', label: 'Change scene · Map', action: 'scene', scene: 'ESA_Gameplay', description: 'Switch OBS to the gameplay scene.' },
  { id: 'fullscreen', label: 'Change scene · Full screen', action: 'scene', scene: 'ESA_Fullscreen', description: 'Switch OBS to the full-screen graphics scene.' },
  { id: 'replayScene', label: 'Change scene · Replay', action: 'scene', scene: 'ESA_Replay', description: 'Switch OBS to the replay scene.' },
  { id: 'casters', label: 'Change scene · Talent', action: 'scene', scene: 'ESA_Casters', description: 'Switch OBS to the caster scene.' },
  { id: 'replay', label: 'Save replay', action: 'replay', description: 'Save the OBS replay buffer, show replay, then return to the previous scene.' },
  { id: 'hold', label: 'Pause automatic switch', action: 'hold', description: 'Stop the active item’s automatic countdown and wait for Take or Skip. Press once; this is not a press-and-hold key.' },
  { id: 'take', label: 'Show next screen on air', action: 'live', description: 'Take the next ready screen through OBS. Unavailable during a technical pause.' },
  { id: 'skip', label: 'Skip this screen', action: 'skip', description: 'Skip the current show flow screen and arm the next.' },
  { id: 'pause', label: 'Technical pause / resume', action: 'pause', description: 'Pause show flow timers and automatic screen changes, or resume them.' },
  { id: 'cut', label: 'Cut preview to program', action: 'cut', description: 'Take the current OBS preview with its Cut transition. Requires an available Cut transition.' },
  { id: 'stinger', label: 'Stinger preview to program', action: 'stinger', description: 'Take the current OBS preview with the selected Stinger. Enable Studio Mode in OBS first.' },
  { id: 'timeout', label: 'Team timeout / end timeout', action: 'timeout', description: 'Block automatic takes during a team timeout. Ending timeout does not clear a technical pause or replay queued takes.' },
  { id: 'toast', label: 'Show update', action: 'graphic-form', form: 'toast', description: 'Open the inline update form. It appears on the HUD for seven seconds after you submit.' },
  { id: 'poll', label: 'Show poll', action: 'graphic-form', form: 'poll', description: 'Open the inline poll form with two options and their current percentages.' },
  { id: 'sponsor', label: 'Sponsor read', action: 'graphic-form', form: 'sponsor', description: 'Open the assigned sponsor list and record the start or end of a sponsor read.' },
  { id: 'dataFix', label: 'Fix on-air data', action: 'data-fix', description: 'Open the current match’s display overrides and Undo. Available during a pause; official tournament records remain unchanged.' },
]);
const DEFAULTS = Object.freeze({ holding: 'F1', gameplay: 'F2', fullscreen: 'F3', replayScene: 'F4', casters: 'F5', replay: 'F6', hold: 'F7', take: 'F8', skip: 'Ctrl+Shift+S', pause: 'Ctrl+Shift+P', cut: 'Ctrl+Shift+C', stinger: 'Ctrl+Shift+G', timeout: 'Ctrl+Shift+O', toast: 'Ctrl+Shift+U', poll: 'Ctrl+Shift+L', sponsor: 'Ctrl+Shift+B', dataFix: 'Ctrl+Shift+D' });
const RESERVED = new Set(['Alt+F4', 'Ctrl+W', 'Ctrl+R', 'Ctrl+Q', 'Ctrl+F4', 'Ctrl+Shift+I', 'Ctrl+Shift+J', 'F5', 'F11', 'F12']);
function eventBinding(event) {
  const key = event.key;
  if (!key || ['Control', 'Shift', 'Alt', 'Meta'].includes(key) || event.metaKey) return '';
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key].filter(Boolean).join('+');
}
function validateBindings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(id => !Object.hasOwn(DEFAULTS, id))) return { ok: false, error: 'Unknown shortcut action.' };
  const bindings = { ...DEFAULTS, ...input }, used = new Map();
  for (const { id, label } of ACTIONS) {
    const key = bindings[id];
    // F5 is retained only for the existing caster shortcut, not new assignments.
    const plainProductionKey = ['Space', 'H', 'S'].includes(key);
    if (typeof key !== 'string' || key.length > 40 || !/^(?:(?:Ctrl\+)?(?:Alt\+)?(?:Shift\+)?(?:F(?:[1-9]|1[0-2])|[A-Z0-9]|Space))$/.test(key) || (/^[A-Z0-9]$/.test(key) && !plainProductionKey) || (RESERVED.has(key) && !(key === 'F5' && id === 'casters'))) return { ok: false, error: `${label}: use F1–F10, Space, H, S or a modified letter. System shortcuts are reserved.` };
    if (used.has(key)) return { ok: false, error: `${key} conflicts with ${used.get(key)}.` };
    used.set(key, label);
  }
  return { ok: true, bindings };
}
function matchesBinding(event, binding) { return !event.repeat && !event.isComposing && eventBinding(event) === binding; }
module.exports = { ACTIONS, DEFAULTS, validateBindings, eventBinding, matchesBinding };
