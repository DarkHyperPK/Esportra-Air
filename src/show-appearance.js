'use strict';
const THEMES = ['broadcast', 'compact', 'monument', 'impact'];
const COLORS = ['#ef4444', '#3b82f6'];
function appearancePatch(config) {
  const value = config.appearance || {};
  const overrides = value.matches?.[config.selectedMatchId] || [];
  return {
    layout: { bannerTheme: THEMES.includes(value.bannerTheme) ? value.bannerTheme : 'broadcast', sponsorRotation: value.sponsorRotation !== false, sponsorSeconds: Number.isInteger(value.sponsorSeconds) && value.sponsorSeconds >= 5 && value.sponsorSeconds <= 120 ? value.sponsorSeconds : 8 },
    show: { eventBug: value.eventBug !== false },
    teams: (config.teams || []).map((team, index) => ({
      ...team,
      name: typeof overrides[index]?.displayName === 'string' && overrides[index].displayName.trim() ? overrides[index].displayName.trim() : team.name,
      color: value.teamColors === false ? COLORS[index] : /^#[\da-f]{6}$/i.test(overrides[index]?.color || '') ? overrides[index].color : team.color || COLORS[index],
    })),
  };
}
module.exports = { appearancePatch };
