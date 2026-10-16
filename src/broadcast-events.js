'use strict';

// Keep aligned with the existing backend BroadcastEventGuard. Operator actions
// not in this contract remain in the local event log, not the remote queue.
const REMOTE_EVENT_TYPES = new Set([
  'SegmentTake', 'SegmentDone', 'SponsorImpressionStarted',
  'SponsorImpressionEnded', 'MatchResultSubmitted', 'ShowStarted', 'ShowEnded',
  'RoundStarted', 'RoundEnded',
  'ProductionAction', 'ProductionIncident',
]);
module.exports = { REMOTE_EVENT_TYPES };
