'use strict';
const { validateTransition } = require('./obs-transitions');
const TRIGGERS = ['manual', 'match_room_opened', 'check_in_complete', 'veto_step', 'veto_complete', 'agent_select', 'round_live', 'round_end', 'kill', 'multi_kill', 'spike_planted', 'spike_defused', 'map_end', 'series_decided', 'rescheduled', 'forfeit', 'clock_time', 'delay', 'hotkey', 'remote_command', 'observer_flag'];
const AUTOMATIC_TRIGGERS = ['round_live', 'round_end', 'spike_planted', 'spike_defused', 'map_end', 'observer_flag'];
function normalizePlan(input) {
  if (input == null) return null;
  if (!input || typeof input !== 'object' || !TRIGGERS.includes(input.trigger) || !['manual', 'automatic'].includes(input.mode)) throw new Error('Choose a supported item trigger and mode.');
  if (input.mode === 'automatic' && !AUTOMATIC_TRIGGERS.includes(input.trigger)) throw new Error('This cue requires a manual Take until its live trigger is available.');
  if (!['manual', 'window', 'immediate'].includes(input.holdMode) || !Number.isInteger(input.holdSeconds) || input.holdSeconds < 0 || input.holdSeconds > 60 || input.holdMode === 'window' && input.holdSeconds < 1) throw new Error('Hold window must be 1–60 seconds, Manual, or immediate.');
  if (!Array.isArray(input.graphics) || input.graphics.length > 1 || input.graphics.some(name => typeof name !== 'string' || !/^[a-z-]{1,40}$/.test(name))) throw new Error('Choose one existing screen for this item.');
  if (input.scene != null && (typeof input.scene !== 'string' || !input.scene.trim() || input.scene.length > 256 || /[\x00-\x1f\x7f]/.test(input.scene))) throw new Error('Choose a valid OBS scene.');
  if (input.mapNumber != null && (!Number.isInteger(input.mapNumber) || input.mapNumber < 1 || input.mapNumber > 9)) throw new Error('Map number must be 1–9.');
  return { ...input, transition: input.transition?.mode === 'current' ? null : validateTransition(input.transition) };
}
function triggerMatches(segment, event) {
  if (!segment?.autoTake || segment.state !== 'armed') return false;
  if (segment.mapNumber != null && segment.mapNumber !== event.state?.map?.number) return false;
  const types = { round_end: 'round.won', spike_planted: 'spike.planted', spike_defused: 'spike.defused', map_end: 'match.end', observer_flag: 'observer.flag' };
  return segment.trigger === 'round_live' ? event.type === 'round.phase' && event.phase === 'live' : event.type === types[segment.trigger];
}
const triggerLabel = trigger => (trigger || 'manual').replaceAll('_', ' ');
module.exports = { TRIGGERS, AUTOMATIC_TRIGGERS, normalizePlan, triggerMatches, triggerLabel };
