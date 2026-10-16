"use strict";
const CODE = /^[A-Za-z0-9_-]{1,20}$/;
function selectShowMatch(config, preferredCode) {
  if (
    !config ||
    typeof config.showId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(config.showId)
  )
    throw new Error("Show configuration needs a valid show ID.");
  const matches = Array.isArray(config.matches) ? config.matches.filter(match => !['completed', 'finished', 'ended', 'cancelled', 'canceled', 'bye', 'walkover', 'forfeit'].includes(match?.status)) : [];
  if (
    matches.length > (config.source==='standalone'?512:200) ||
    matches.some((match) => !match || !CODE.test(match.matchCode || ""))
  )
    throw new Error("Show contains invalid match codes.");
  const match =
    matches.find((item) => item.matchCode === preferredCode) || matches[0];
  return {
    ...config,
    matches,
    matchCode: match?.matchCode || "MAIN",
    teams: match?.teams || config.teams || [],
    veto: match?.veto || config.veto || [],
    seriesTotal: match?.bestOf || config.seriesTotal || 1,
    selectedMatchId: match?.matchId || null,
  };
}
function isProductionActive(runner) {
  return !!runner
    ?.getState()
    .segments.some((segment) =>
      ["armed", "holding", "taking", "on_air"].includes(segment.state),
    );
}
module.exports = { selectShowMatch, isProductionActive };
