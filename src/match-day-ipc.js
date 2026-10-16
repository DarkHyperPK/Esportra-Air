"use strict";
const { matchDay } = require("./match-day");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function registerMatchDay({
  register,
  commands,
  config,
  getShow,
  getNodeId,
  feed,
  patch,
  onPreference = () => {},
}) {
  const key = () =>
    `${getShow()?.source || "esportra"}:${getShow()?.showId || ""}`;
  const preferences = () => config().get("playerPreferences")?.[key()] || {};
  const read = () => matchDay(getShow(), getNodeId(), feed, preferences());
  let pending = Promise.resolve(),
    last = "";
  function syncNicknames() {
    pending = pending
      .catch(() => {})
      .then(async () => {
        const show = getShow();
        if (!show?.matchCode || !feed.state) return;
        const day = read(),
          nicknames = {};
        for (const team of day.teams)
          for (const player of team.players)
            if (
              player.state === "matched" &&
              player.hudNickname &&
              UUID.test(player.captured?.puuid || "")
            )
              nicknames[player.captured.puuid] = player.hudNickname;
        const signature = JSON.stringify([
          show.showId,
          show.matchCode,
          nicknames,
        ]);
        if (signature === last) return;
        await patch(show.matchCode, { hudNicknames: nicknames });
        last = signature;
      });
    return pending;
  }
  register(commands.MATCH_DAY_GET, () => read());
  register(commands.PACKETS_CLEAR, () => {
    feed.packets = [];
    return { ok: true };
  });
  register(commands.PLAYER_PREFERENCE_SET, async (_event, input) => {
    try {
      const day = read();
      if (
        !day.context ||
        !input?.context ||
        !Object.entries(day.context).every(
          ([name, value]) => input.context[name] === value,
        )
      )
        throw new Error("The selected match changed. Reopen the player list.");
      const player = day.teams
        .flatMap((team) => team.players)
        .find((row) => row.key === input.playerKey);
      if (!player)
        throw new Error("Choose a registered player from the selected match.");
      if (
        typeof input.nickname !== "string" ||
        input.nickname.length > 80 ||
        /[<>\x00-\x1f\x7f]/.test(input.nickname)
      )
        throw new Error("Use a plain HUD nickname, up to 80 characters.");
      const saved = preferences(),
        gameId = input.gameId || "";
      if (
        gameId &&
        (!UUID.test(gameId) ||
          (!day.detectedPlayers.some((row) => row.puuid === gameId) &&
            player.gameId !== gameId))
      )
        throw new Error(
          "Choose a detected game player to confirm the identity.",
        );
      if (
        gameId &&
        day.teams
          .flatMap((team) => team.players)
          .some((row) => row.key !== player.key && row.gameId === gameId)
      )
        throw new Error(
          "That game identity already belongs to another registered player. Clear the other binding first.",
        );
      const next = {
        ...saved,
        [player.key]: { nickname: input.nickname.trim(), gameId },
      };
      config().set("playerPreferences", {
        ...(config().get("playerPreferences") || {}),
        [key()]: next,
      });
      await onPreference(player, next[player.key]);
      await syncNicknames();
      return { ok: true };
    } catch (failure) {
      return { ok: false, error: failure.message };
    }
  });
  return { read, syncNicknames };
}
module.exports = { registerMatchDay };
