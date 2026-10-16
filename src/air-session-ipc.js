"use strict";
const { blankProject, showConfig, UUID } = require("./air-projects");
function registerStandalone({
  register,
  commands,
  getSession,
  config,
  getShow,
  activate,
  assertIdle,
  assertAccountIdle = assertIdle,
  selectAsset,
  restoreTournament,
  clearStandalone,
}) {
  let pending = Promise.resolve();
  function mutation(command, action) {
    register(command, (_event, input) => {
      const operation = pending
        .catch(() => {})
        .then(async () => {
          try {
            return { ok: true, ...(await action(input || {})) };
          } catch (error) {
            return { ok: false, error: error.message };
          }
        });
      pending = operation;
      return operation;
    });
  }
  register(commands.AIR_SESSION_GET, () => ({
    ok: true,
    ...getSession()?.status(),
  }));
  mutation(commands.AIR_LOGIN, async ({ email, password }) => {
    assertAccountIdle();
    const session = getSession();
    if (!session) throw new Error("Air is still starting.");
    await session.login(email, password);
    config().set("airAccountKnown", true);
    return { session: session.status() };
  });
  mutation(commands.AIR_LOGOUT, async () => {
    assertAccountIdle();
    if (getShow()?.source === "standalone") await clearStandalone();
    await getSession().logout();
    config().set("airAccountKnown", false);
    return {};
  });
  mutation(commands.AIR_ACCESS_REFRESH, async () => ({
    session: await getSession().checkAccess(),
  }));
  register(commands.AIR_PROJECTS_LIST, (_event, input) => ({
    ok: true,
    projects: getSession()?.list(input?.workspaceId) || [],
    session: getSession()?.status(),
  }));
  mutation(commands.AIR_PROJECT_GET, async ({ id }) => ({
    project: getSession().get(id),
  }));
  mutation(commands.AIR_PROJECT_CREATE, async ({ workspaceId, title }) => ({
    project: await getSession().create(
      workspaceId,
      blankProject(title || "My broadcast"),
    ),
  }));
  mutation(commands.AIR_PROJECT_SAVE, async (input) => ({
    project: await getSession().save(input),
  }));
  mutation(commands.AIR_PROJECT_RESOLVE, async ({ id, choice }) => ({
    project: getSession().resolve(id, choice),
  }));
  mutation(commands.AIR_SYNC, async () => {
    await getSession().sync();
    return { projects: getSession().list(), session: getSession().status() };
  });
  mutation(commands.AIR_ASSET_UPLOAD, async ({ workspaceId }) => {
    if (!UUID.test(workspaceId || "")) throw new Error("Choose a workspace.");
    const bytes = await selectAsset();
    if (!bytes) return { cancelled: true };
    return { asset: await getSession().asset(workspaceId, bytes) };
  });
  async function select({ projectId, matchId }) {
    assertIdle();
    await getSession().assertAccess();
    assertIdle();
    const project = getSession().get(projectId);
    const result = await activate(showConfig(project, matchId));
    if (!result.ok) throw new Error(result.error);
    config().set("activeAirProject", projectId);
    config().set("activeAirMatch", matchId);
    return { projectId, matchId };
  }
  mutation(commands.AIR_PROJECT_SELECT, select);
  mutation(commands.AIR_RESTORE_TOURNAMENT, async () => {
    assertIdle();
    const saved = config().get("tournamentShowConfig");
    if (!saved)
      throw new Error("Pair a tournament workspace and send its setup first.");
    await restoreTournament(saved);
    return {};
  });
  async function restore() {
    const session = getSession();
    if (!session?.status().canProduce) return;
    const projectId = config().get("activeAirProject"),
      matchId = config().get("activeAirMatch");
    if (
      projectId &&
      matchId &&
      session.list().some((project) => project.id === projectId)
    )
      try {
        await select({ projectId, matchId });
      } catch (_) {}
  }
  function onPreference(player, preference) {
    if (getShow()?.source !== "standalone") return;
    const session = getSession(),
      project = session.get(getShow().projectId);
    for (const team of project.document.teams)
      for (const member of team.players)
        if (member.id === player.id) {
          member.hudNickname = preference.nickname;
          member.gameId = preference.gameId || null;
        }
    session.store.edit(project);
    void session.sync().catch(() => {});
  }
  return { restore, onPreference };
}
module.exports = { registerStandalone };
