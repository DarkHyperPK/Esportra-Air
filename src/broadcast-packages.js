"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { UUID } = require("./air-projects");
function decodePackage(packet) {
  if (!packet || !UUID.test(packet.id || "") || !Number.isSafeInteger(packet.version) || packet.version < 1 || typeof packet.configurationJson !== "string" || Buffer.byteLength(packet.configurationJson) > 2097152 || !/^[0-9a-f]{64}$/i.test(packet.checksum || "")) throw new Error("The broadcast download is incomplete.");
  const hash = createHash("sha256").update(packet.configurationJson).digest("hex");
  if (hash !== packet.checksum.toLowerCase()) throw new Error("The broadcast download failed verification. Download it again.");
  const config = JSON.parse(packet.configurationJson);
  if (config.schemaVersion !== 1 || config.packageId !== packet.id || config.showId !== packet.id || config.packageVersion !== packet.version || config.rundownVersion !== packet.version || config.accountPackage !== true || config.source !== "esportra" || config.game !== "valorant" || config.packId !== "esportra-valorant-v1" || !Array.isArray(config.matches) || config.matches.length !== 1 || !UUID.test(config.matches[0]?.matchId || "") || ["completed", "cancelled"].includes(config.matches[0].status)) throw new Error("This broadcast package is unsupported. Update Air or choose an eligible match.");
  return config;
}
class PackageCache {
  constructor(store) { this.store = store; this.root = path.join(store.root, "broadcast-packages"); fs.mkdirSync(this.root, { recursive: true }); }
  write(name, value) { this.store.write(path.join(this.root, name), value); }
  read(name, fallback = null) { try { return JSON.parse(fs.readFileSync(path.join(this.root, name), "utf8")); } catch (_) { return fallback; } }
  save(packet) { const config = decodePackage(packet); const prior=this.read(`${packet.id}-v${packet.version}.json`);if(prior&&prior.checksum!==packet.checksum)throw new Error('A published package version changed. Keep the cached version and contact support.'); this.write(`${packet.id}-v${packet.version}.json`, packet); const index = this.read("index.json", {}); index[config.matches[0].matchId] = { id: packet.id, version: packet.version }; this.write("index.json", index); return config; }
  forMatch(id) { const item = this.read("index.json", {})[id]; if (!item || !UUID.test(item.id || "") || !Number.isSafeInteger(item.version)) return null; const packet = this.read(`${item.id}-v${item.version}.json`); return packet ? { packet, configuration: decodePackage(packet) } : null; }
}
function registerBroadcastPackages({ register, commands, getSession, getShow, activate, assertIdle, config, matchSession: sessionSource = null, beforePrepare = async () => {} }) {
  let pending = Promise.resolve();
  const sessionState = () => (typeof sessionSource === "function" ? sessionSource() : sessionSource);
  const cache = () => { const session = getSession(); if (!session?.store || !session.status().authenticated) throw new Error("Sign in to Esportra to load your tournament matches."); return { session, store: session.store, cache: new PackageCache(session.store), userId: session.status().userId }; };
  function operation(command, fn) { if (!command) return; register(command, (_event, input) => { const next = pending.catch(() => {}).then(async () => { try { return { ok: true, ...await fn(input || {}) }; } catch (error) { return { ok: false, error: error.message }; } }); pending = next; return next; }); }
  function rememberPrepared(scope, packet, configuration, offline) {
    if (!sessionState()) return null;
    const match = configuration.matches[0] || {};
    const saved = scope.cache.read("matches.json", { matches: [] });
    const row = (Array.isArray(saved.matches) ? saved.matches : []).find(item => item.id === match.matchId) || {};
    const teams = Array.isArray(match.teams) ? match.teams : [];
    const teamA = teams[0]?.name || row.teamA || "";
    const teamB = teams[1]?.name || row.teamB || "";
    const setup = {
      matchId: match.matchId,
      matchCode: match.matchCode || row.matchCode || "MAIN",
      label: [teamA, teamB].filter(Boolean).join(" vs ") || row.label || match.matchCode || row.matchCode || "Prepared match",
      tournamentName: row.tournamentName || match.tournamentName || "",
      teamA, teamB,
      bestOf: match.bestOf || row.bestOf,
      scheduledAt: match.scheduledAt || row.scheduledAt,
      status: match.status || row.status,
      packageId: packet.id,
      packageVersion: packet.version,
      offline,
    };
    sessionState().upsert(setup);
    return setup;
  }
  operation(commands.AIR_MATCHES_LIST, async () => {
    const scope = cache();
    try {
      const result = await scope.session.json("/api/air/broadcast/matches");
      if (scope.session.store !== scope.store) throw new Error("Account changed. Reload your matches.");
      if (!Array.isArray(result.matches) || result.matches.length > 500) throw new Error("The match list is incomplete. Reload it.");
      scope.cache.write("matches.json", { matches: result.matches, receivedAt: new Date().toISOString() });
      return { ...result, offline: false };
    } catch (error) {
      if (error.status || !scope.session.status().canProduce || scope.session.store !== scope.store) throw error;
      const saved = scope.cache.read("matches.json");
      if (!saved) throw new Error("Connect to Esportra to download your matches for the first time.");
      return { ...saved, offline: true, matches: saved.matches.map(m => ({ ...m, cached: !!scope.cache.forMatch(m.id) })) };
    }
  });
  operation(commands.AIR_MATCH_PREPARE, async ({ matchId }) => {
    if (!UUID.test(matchId || "")) throw new Error("Choose a match from your tournament list.");
    const scope = cache();
    await scope.session.assertAccess();
    await beforePrepare(matchId);
    let packet, offline = false;
    const requests = scope.cache.read("requests.json", {}); const requestId = requests[matchId] || randomUUID(); requests[matchId] = requestId; scope.cache.write("requests.json", requests);
    try { packet = await scope.session.json(`/api/air/broadcast/matches/${matchId}/prepare`, { method: "POST", body: { requestId } }); }
    catch (error) { if (error.status || scope.session.store !== scope.store) throw error; packet = scope.cache.forMatch(matchId)?.packet; if (!packet) throw new Error("This match has not been downloaded. Reconnect to prepare it."); offline = true; }
    if (scope.session.store !== scope.store) throw new Error("Account changed before the broadcast loaded.");
    const configuration = decodePackage(packet);
    if (configuration.matches[0].matchId !== matchId) throw new Error("The downloaded broadcast belongs to another match.");
    // Private logos are downloaded through the account-bound main process.
    const assetIds = new Set();
    const visit=value=>{if(typeof value==='string'&&/^\/air-assets\/[a-f0-9-]{36}$/i.test(value))assetIds.add(value.split('/').at(-1));else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};visit(configuration);
    for(const id of assetIds){if(!scope.store.asset(id)){if(offline)throw new Error('A sponsor logo is not cached. Reconnect before preparing this match.');const response=await scope.session.request(`/api/air/assets/${id}`);const bytes=await response.buffer();if(scope.session.store!==scope.store)throw new Error('Account changed while downloading artwork.');scope.store.saveAsset(id,scope.session.status().workspaces[0].id,bytes,false);}}
    scope.cache.save(packet);
    if (scope.session.store !== scope.store) throw new Error("Account changed before the broadcast loaded.");
    const setup = rememberPrepared(scope, packet, configuration, offline);
    if (!offline) { delete requests[matchId]; scope.cache.write("requests.json", requests); }
    return { packageId: packet.id, version: packet.version, offline, setup, session: sessionState()?.status() || null };
  });
  // Preparing is deliberately non-activating: it downloads and verifies the
  // package, then leaves program untouched. Arm is the only operation that
  // publishes a match.
  operation(commands.AIR_MATCH_ARM, async ({ matchId }) => {
    if (!UUID.test(matchId || "")) throw new Error("Choose a prepared match to arm.");
    const scope = cache();
    await scope.session.assertAccess();
    await assertIdle();
    const prepared = scope.cache.forMatch(matchId);
    if (!prepared) throw new Error("Prepare this match before arming it.");
    const configuration = prepared.configuration;
    const match = configuration.matches[0];
    if (match.matchId !== matchId) throw new Error("The prepared broadcast belongs to another match.");
    await beforePrepare(matchId);
    await assertIdle();
    if (scope.session.store !== scope.store) throw new Error("Account changed before the broadcast loaded.");
    const result = await activate({ ...configuration, packageAccountId: scope.userId, preferredMatchCode: match.matchCode || configuration.matchCode });
    if (!result.ok) throw new Error(result.error);
    if (scope.session.store !== scope.store) throw new Error("Account changed before the broadcast loaded.");
    config().set("activeAirProject", null);
    config().set("activeAirMatch", null);
    config().set("activeAirPackage", { id: prepared.packet.id, version: prepared.packet.version, matchId, userId: scope.userId });
    const workspaceId = scope.session.status().workspaces?.[0]?.id;
    if (workspaceId) config().set("airSessionId", workspaceId);
    sessionState()?.select(matchId);
    return { packageId: prepared.packet.id, version: prepared.packet.version, session: sessionState()?.status() || null };
  });
  operation(commands.AIR_MATCH_SELECT, async ({ matchId }) => {
    if (!UUID.test(matchId || "")) throw new Error("Choose a match from your tournament list.");
    cache();
    sessionState()?.select(matchId);
    return { selectedMatchId: matchId, session: sessionState()?.status() || null };
  });
  operation(commands.AIR_MATCH_PREVIEW, async ({ matchId }) => {
    if (!UUID.test(matchId || "")) throw new Error("Choose a prepared match to preview.");
    const scope = cache();
    const prepared = scope.cache.forMatch(matchId);
    if (!prepared) throw new Error("Prepare this match before previewing it.");
    const configuration = prepared.configuration;
    const match = configuration.matches[0];
    if (match.matchId !== matchId) throw new Error("The prepared broadcast belongs to another match.");
    const teams = (Array.isArray(match.teams) ? match.teams : []).map(team => ({
      name: typeof team.name === "string" ? team.name.slice(0, 120) : "",
      tag: typeof team.tag === "string" ? team.tag.slice(0, 12) : "",
      color: typeof team.color === "string" ? team.color.slice(0, 32) : "",
      logoUrl: typeof team.logoUrl === "string" ? team.logoUrl : typeof team.logo === "string" ? team.logo : "",
      roster: (Array.isArray(team.roster) ? team.roster : []).slice(0, 10).map(player => ({ name: String(player.name || player.displayName || player.inGameName || "").slice(0, 80) })),
    }));
    const screens = (Array.isArray(configuration.rundown) ? configuration.rundown : [])
      .filter(item => item && /^[\w-]+$/.test(item.overlay || "") && (!item.matchId || item.matchId === matchId))
      .slice(0, 50)
      .map(item => ({
        id: typeof item.id === "string" ? item.id.slice(0, 80) : randomUUID(),
        title: typeof item.title === "string" ? item.title.slice(0, 80) : item.overlay,
        overlay: item.overlay,
        x: Number.isFinite(item.x) ? item.x : 0,
        y: Number.isFinite(item.y) ? item.y : 0,
        width: Number.isFinite(item.width) && item.width > 0 ? item.width : 1920,
        height: Number.isFinite(item.height) && item.height > 0 ? item.height : 1080,
        background: typeof item.background === "string" ? item.background.slice(0, 120) : "",
      }));
    return {
      matchId,
      matchCode: match.matchCode || "MAIN",
      label: teams.map(team => team.name).filter(Boolean).join(" vs ") || match.matchCode || "Prepared match",
      tournamentName: typeof match.tournamentName === "string" ? match.tournamentName.slice(0, 160) : "",
      teams,
      screens,
      preparedAt: sessionState()?.status().setups.find(row => row.matchId === matchId)?.preparedAt || null,
      programUnchanged: true,
    };
  });
  operation(commands.AIR_MATCH_SESSION, async () => ({
    session: sessionState()?.status() || null,
  }));
  operation(commands.AIR_MATCH_ROSTER, async ({ matchId }) => {
    if (!UUID.test(matchId || "")) throw new Error("Choose a match to fetch its roster.");
    const scope = cache();
    return scope.session.json(`/api/air/broadcast/matches/${matchId}/roster`);
  });
  const outbox = new (require('./package-event-outbox').PackageEventOutbox)({ getSession, getShow });
  const syncTimer = setInterval(() => { void outbox.flush(); }, 30000); syncTimer.unref();
  return { eventQueue: outbox, sync: () => outbox.flush(), status: () => outbox.status(), dispose: () => clearInterval(syncTimer) };
}
module.exports = { decodePackage, PackageCache, registerBroadcastPackages };
