'use strict';
function reportedFeatures(messages) {
  const keys = new Set(), events = new Set();
  for (const message of messages) {
    if (message?.key) keys.add(message.key);
    for (const category of Object.values(message?.info || {})) if (category && typeof category === 'object') for (const key of Object.keys(category)) keys.add(key);
    for (const event of message?.events || []) if (event?.name) events.add(event.name);
    if (message?.name) events.add(message.name);
    if (message?.captureHeartbeat === true) keys.add('player_capture');
  }
  const scoreboard = [...keys].some(key => /^scoreboard_\d+$/.test(key));
  return [keys.has('match_score') && 'score', (keys.has('round_phase') || keys.has('round_number')) && 'round', scoreboard && 'players', scoreboard && 'credits', (keys.has('planted_location') || [...events].some(name => name.startsWith('spike_') || name === 'planted_location')) && 'spike', (keys.has('health') || keys.has('abilities') || keys.has('player_capture')) && 'playerCapture', keys.has('map') && 'map', keys.has('observing') && 'observed'].filter(Boolean);
}
module.exports = { reportedFeatures };
