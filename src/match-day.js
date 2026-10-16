"use strict";
const { resolvePlayers } = require("./player-identities");
function matchDay(config, nodeId, feed, preferences = {}) {
  if (!config)
    return {
      ok: true,
      matches: [],
      teams: [],
      detectedPlayers: [],
      events: [],
      packets: [],
      live: feed.snapshot(),
      suggestions: [],
    };
  const source = config.source || "esportra";
  const selected = (config.matches || []).find(
    (match) => match.matchCode === config.matchCode,
  );
  const matches = [
    ...(config.matches || []),
    ...(config.matchHistory || []),
  ].map((match) => ({
    id: match.matchId || match.id,
    matchCode: match.matchCode,
    status: match.status || "scheduled",
    bestOf: match.bestOf || config.seriesTotal || 1,
    scheduledAt: match.scheduledAt,
    teams: (match.teams || []).map((team) =>
      typeof team === "string" ? { name: team } : team,
    ),
  }));
  const teams = resolvePlayers(
    (config.teams || selected?.teams || []).map((team) => ({
      ...team,
      id: team.teamId || team.id,
      logo: team.logoUrl || team.logo,
      players: team.roster || team.players || [],
    })),
    feed.state?.players || [],
    preferences,
  );
  const detectedPlayers = (feed.state?.players || []).flatMap((players, team) =>
    players
      .filter((player) => player.name)
      .map((player) => ({
        puuid: player.puuid,
        name: player.inGameName || player.name,
        team,
      })),
  );
  const suggestions = matches
    .filter(
      (match) =>
        match.status !== "completed" &&
        match.teams.length === 2 &&
        resolvePlayers(match.teams, feed.state?.players || []).every(
          (team) =>
            team.players.filter((player) => player.role !== "substitute" && player.role !== "coach")
              .length >= 5 &&
            team.players
              .filter((player) => player.role !== "substitute" && player.role !== "coach")
              .every((player) => player.state === "matched"),
        ),
    )
    .map((match) => ({
      matchCode: match.matchCode,
      label: match.teams.map((team) => team.name).join(" vs "),
    }));
  return {
    ok: true,
    source,
    title: config.title,
    selectedCode: config.matchCode,
    context: {
      source,
      showId: config.showId,
      matchId: config.selectedMatchId,
      matchCode: config.matchCode,
      nodeId,
    },
    matches,
    teams,
    detectedPlayers,
    suggestions,
    live: feed.snapshot(),
    events: feed.events || [],
    packets: feed.packets || [],
  };
}
module.exports = { matchDay };
