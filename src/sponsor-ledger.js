'use strict';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOTS = new Set(['lower_third', 'scorebug', 'break_fullscreen', 'custom']);
class SponsorLedger {
  constructor({ config, queue, now = Date.now }) {
    this.config = config; this.queue = queue; this.now = now;
    const saved = config.get('activeSponsorImpressions');
    this.active = new Map((Array.isArray(saved) ? saved : []).filter(entry => Array.isArray(entry) && UUID.test(entry[1]?.showId || '') && UUID.test(entry[1]?.sponsorId || '') && SLOTS.has(entry[1]?.slotType) && Number.isFinite(Date.parse(entry[1]?.startedAt))).slice(0, 100));
  }
  record(show, { action, sponsorId, slotType, segmentId = null } = {}) {
    if (!['start', 'end'].includes(action) || !UUID.test(sponsorId || '') || !SLOTS.has(slotType) || segmentId && !UUID.test(segmentId)) throw new Error('Choose a valid sponsor slot and action.');
    const queue = this.queue(); if (!queue) throw new Error('Pair this computer before recording sponsor placements.');
    const key = `${sponsorId}:${slotType}`, tracked = this.active.get(key);
    let proof;
    if (action === 'start') {
      if (tracked) throw new Error('This sponsor slot is already active. End it before starting again.');
      if (!UUID.test(show?.showId || '') || !show.sponsors?.some(sponsor => (sponsor.sponsorId || sponsor.id) === sponsorId)) throw new Error('Choose a sponsor assigned to this show.');
      if (this.active.size >= 100) throw new Error('End an active sponsor placement before adding another.');
      proof = { showId: show.showId, sponsorId, segmentId, slotType, startedAt: new Date(this.now()).toISOString(), endedAt: null };
    } else {
      if (!tracked) throw new Error('No matching sponsor placement is active.');
      proof = { ...tracked, endedAt: new Date(Math.max(this.now(), Date.parse(tracked.startedAt))).toISOString() };
    }
    const { showId, ...impression } = proof;
    // The signed queue must accept the proof before the local active ledger changes.
    queue.enqueue({ type: 'SponsorProof', showId, impression });
    if (action === 'start') this.active.set(key, proof); else this.active.delete(key);
    this.config.set('activeSponsorImpressions', [...this.active]);
    return { ok: true, queued: true, showId, impression };
  }
}
module.exports = SponsorLedger;
