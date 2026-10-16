'use strict';
const { normalizeRundown } = require('./rundown-config');
const validVersion = value => Number.isSafeInteger(value) && value > 0;
function publicationDecision(current, incoming) {
  if (incoming.rundownVersion != null && !validVersion(incoming.rundownVersion)) throw new Error('Invalid published rundown version.');
  if (current?.showId !== incoming.showId || !validVersion(current?.rundownVersion)) return 'new';
  if (!validVersion(incoming.rundownVersion)) return 'legacy';
  return incoming.rundownVersion < current.rundownVersion ? 'older' : incoming.rundownVersion === current.rundownVersion ? 'same' : 'new';
}
function selectedRundown(config, mappings = {}) {
  return normalizeRundown((config.rundown || []).filter(item => !item.matchId || item.matchId === config.selectedMatchId), mappings);
}
function upcomingDiff(current, incoming) {
  const previous = new Map((current.rundown || []).map(item => [item.id, item]));
  const next = new Map((incoming.rundown || []).map(item => [item.id, item]));
  const changed = [...next.values()].filter(item => previous.has(item.id) && JSON.stringify(previous.get(item.id)) !== JSON.stringify(item)).map(item => item.title || item.name);
  return { added: [...next.values()].filter(item => !previous.has(item.id)).map(item => item.title || item.name), removed: [...previous.values()].filter(item => !next.has(item.id)).map(item => item.title || item.name), changed, reordered: [...previous.keys()].filter(id => next.has(id)).join(',') !== [...next.keys()].filter(id => previous.has(id)).join(',') };
}
module.exports = { validVersion, publicationDecision, selectedRundown, upcomingDiff };
