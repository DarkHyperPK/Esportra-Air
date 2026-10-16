'use strict';
const OVERLAYS = new Set(['agent-select','banners','bracket','brb','break-clock','casters','champion','duel','economy','ending','event-bug','halftime','holding','ingame','killfeed','lower-third','map-breakdown','map-result','map-veto','match-intro','minimap-frame','moments','observed-player','player-cams','player-cards','player-profile','poll','replay','round-history','round-recap','schedule','scoreboard','scorebug','series','spike-timer','sponsor','standings','starting-soon','stinger','team-compare','team-roster-a','team-roster-b','ticker','toast','win-probability']);
function screenScene(overlay) {
  if (!OVERLAYS.has(overlay)) throw new Error('Choose an available HUD screen.');
  if (overlay === 'ingame') return 'ESA_Gameplay'; // Reuse the operator's existing gameplay/video composition.
  return 'ESA_Screen_' + overlay.replaceAll('-', '_');
}
function plannedScreenUrls(segments, matchCode) {
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(matchCode)) throw new Error('Invalid match code.');
  return Object.fromEntries((segments || []).filter(segment => segment.overlay).map(segment => [screenScene(segment.overlay), `http://localhost:5300/overlays/${segment.overlay}.html?match=${encodeURIComponent(matchCode)}`]));
}
function validateSceneUrls(urls, port = 5300) {
  if (!urls || typeof urls !== 'object' || Array.isArray(urls) || Object.keys(urls).length > 50) throw new Error('Invalid screen setup.');
  const legacy = new Set(['holding','gameplay','fullscreen','replay','casters']);
  const planned = new Set([...OVERLAYS].map(screenScene));
  for (const [key, value] of Object.entries(urls)) {
    if (!legacy.has(key) && !planned.has(key)) throw new Error('Unknown production scene.');
    const url = new URL(value), overlay = /^\/overlays\/([\w-]+)\.html$/.exec(url.pathname)?.[1];
    if (url.protocol !== 'http:' || !['localhost','127.0.0.1'].includes(url.hostname) || url.port !== String(port) || url.username || url.password || url.hash || !OVERLAYS.has(overlay) || (planned.has(key) && key !== screenScene(overlay)) || !/^[A-Za-z0-9_-]{1,20}$/.test(url.searchParams.get('match') || '') || [...url.searchParams.keys()].some(name => name !== 'match')) throw new Error('Screens must use a live local HUD match URL.');
  }
  return urls;
}
module.exports = { screenScene, plannedScreenUrls, validateSceneUrls };
