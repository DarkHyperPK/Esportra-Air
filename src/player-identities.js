"use strict";
const { createHash } = require("node:crypto");
const identity = (value) =>
  typeof value === "string"
    ? value.normalize("NFC").trim().toLocaleLowerCase("en-US")
    : "";
function playerKey(team, player) {
  return createHash("sha256")
    .update(
      `${team.id || team.teamId || team.name}:${player.id || player.playerId || player.inGameName || player.name}`,
    )
    .digest("hex")
    .slice(0, 24);
}
function resolvePlayers(teams = [], liveTeams = [], preferences = {}) {
  const captured = liveTeams.flatMap((players, team) =>
    (players || [])
      .map((player, slot) => ({ ...player, team, slot }))
      .filter((player) => player.name),
  );
  return teams.map((team) => ({
    ...team,
    players: (team.players || team.roster || []).map((player) => {
      const key = playerKey(team, player),
        preference = preferences[key] || {};
      const gameId = player.gameId || player.puuid || preference.gameId;
      const fullName = identity(player.inGameName || player.riotId);
      const exact = captured.filter((item) =>
        gameId
          ? item.puuid === gameId
          : fullName.includes("#") &&
            identity(item.inGameName || item.name) === fullName,
      );
      const unique =
        exact.length === 1 &&
        !teams
          .flatMap((other) =>
            (other.players || other.roster || []).map((member) => ({
              team: other,
              member,
            })),
          )
          .some(
            (other) =>
              playerKey(other.team, other.member) !== key &&
              ((gameId &&
                (other.member.gameId ||
                  other.member.puuid ||
                  preferences[playerKey(other.team, other.member)]?.gameId) ===
                  gameId) ||
                (!gameId &&
                  fullName &&
                  identity(other.member.inGameName || other.member.riotId) ===
                    fullName)),
          );
      const candidate = unique ? exact[0] : null;
      return {
        ...player,
        key,
        originalName: player.originalName || player.name,
        inGameName: player.inGameName || player.riotId || "",
        hudNickname: preference.nickname || player.hudNickname || "",
        gameId: gameId || candidate?.puuid || "",
        state: candidate
          ? "matched"
          : captured.some(
                (item) =>
                  identity(item.inGameName || item.name).split("#")[0] ===
                  identity(player.inGameName || player.name).split("#")[0],
              ) || exact.length
            ? "needs_confirmation"
            : "not_detected",
        captured: candidate
          ? {
              puuid: candidate.puuid,
              team: candidate.team,
              slot: candidate.slot,
              name: candidate.name,
            }
          : null,
      };
    }),
  }));
}
module.exports = { identity, playerKey, resolvePlayers };
