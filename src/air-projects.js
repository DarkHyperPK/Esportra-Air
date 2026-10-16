"use strict";
const { randomUUID } = require("node:crypto");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function text(value, max, label) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[<>\x00-\x1f\x7f]/.test(value)
  )
    throw new Error(`${label} needs plain text, up to ${max} characters.`);
  return value.trim();
}
function unique(rows, label) {
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row) =>
        !row ||
        !UUID.test(row.id) ||
        /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(row.id),
    ) ||
    new Set(rows.map((row) => row.id)).size !== rows.length
  )
    throw new Error(`Use unique ${label} identities.`);
}
function validateProject(project) {
  text(project.title, 120, "Project title");
  const d = project.document;
  if (
    !d ||
    d.schemaVersion !== 1 ||
    !Array.isArray(d.teams) ||
    !Array.isArray(d.matches) ||
    !Array.isArray(d.screens) ||
    !d.bracket ||
    !Array.isArray(d.bracket.stages)
  )
    throw new Error("Use a version 1 Air project document.");
  if (
    d.teams.length > 128 ||
    d.matches.length > 512 ||
    d.screens.length > 200 ||
    d.bracket.stages.length > 32 ||
    Buffer.byteLength(JSON.stringify(d)) > 2097152
  )
    throw new Error("Project exceeds the supported size.");
  unique(d.teams, "team");
  unique(d.matches, "match");
  unique(d.screens, "screen");
  unique(d.bracket.stages, "stage");
  for (const team of d.teams) {
    text(team.name, 80, "Team name");
    text(team.tag, 12, "Team tag");
    if (team.logoAssetId && !UUID.test(team.logoAssetId))
      throw new Error("Choose an uploaded logo.");
    unique(team.players, "player");
    if (team.players.length > 15)
      throw new Error("A team supports up to 15 players.");
    for (const p of team.players) {
      text(p.originalName, 80, "Original player name");
      text(p.inGameName, 100, "In-game identity");
      if (p.hudNickname) text(p.hudNickname, 80, "HUD nickname");
      if (p.gameId && !UUID.test(p.gameId))
        throw new Error("Use a received game identity.");
      if (!["starter", "substitute"].includes(p.role))
        throw new Error("Choose starter or substitute.");
    }
    if (
      new Set(team.players.map((p) => p.inGameName.trim().toLowerCase()))
        .size !== team.players.length
    )
      throw new Error("Team players need distinct in-game identities.");
  }
  for (const match of d.matches) {
    text(match.title, 120, "Match title");
    if (
      !Array.isArray(match.teamIds) ||
      match.teamIds.length !== 2 ||
      match.teamIds[0] === match.teamIds[1] ||
      !match.teamIds.every((id) => d.teams.some((team) => team.id === id))
    )
      throw new Error("Choose two different project teams.");
    if (
      ![1, 3, 5, 7, 9].includes(match.bestOf) ||
      !Array.isArray(match.mapPool) ||
      match.mapPool.length > 15
    )
      throw new Error("Choose a supported best-of and map pool.");
    match.mapPool.forEach((map) => text(map, 80, "Map"));
    if (
      !["scheduled", "in_progress", "completed", "cancelled"].includes(
        match.status,
      )
    )
      throw new Error("Choose a supported match status.");
    if (
      match.scores &&
      (!Array.isArray(match.scores) ||
        match.scores.length !== 2 ||
        match.scores.some(
          (score) =>
            !Number.isInteger(score) ||
            score < 0 ||
            score > Math.floor(match.bestOf / 2) + 1,
        ))
    )
      throw new Error("Enter valid series scores.");
    if (match.scheduledAt && !Number.isFinite(Date.parse(match.scheduledAt)))
      throw new Error("Enter a valid scheduled time.");
  }
  for (const screen of d.screens) {
    text(screen.title, 80, "Screen name");
    if (
      ![
        "pre_show",
        "match",
        "break",
        "post_show",
        "sponsor_slot",
        "custom",
      ].includes(screen.type) ||
      !/^[a-z0-9-]{1,64}$/.test(screen.overlay) ||
      (screen.matchId && !d.matches.some((m) => m.id === screen.matchId))
    )
      throw new Error("Choose a valid broadcast screen.");
  }
  const formats = [
    "single_elimination",
    "double_elimination",
    "round_robin",
    "swiss",
    "groups",
    "manual",
  ];
  if (!formats.includes(d.bracket.format))
    throw new Error("Choose a bracket format.");
  for (const stage of d.bracket.stages) {
    text(stage.label, 100, "Stage label");
    if (
      !formats.includes(stage.format) ||
      !Array.isArray(stage.matches) ||
      stage.matches.length > 512
    )
      throw new Error("Invalid bracket stage.");
    unique(stage.matches, "bracket node");
    for (const node of stage.matches)
      if (
        !d.matches.some((m) => m.id === node.matchId) ||
        !Number.isInteger(node.round) ||
        node.round < 0 ||
        node.round > 32 ||
        !["upper", "lower", "final", "group"].includes(node.side) ||
        (node.nextMatchId &&
          (!d.matches.some((m) => m.id === node.nextMatchId) ||
            node.nextMatchId === node.matchId))
      )
        throw new Error("Bracket connections must use project matches.");
    const links = new Map(
      stage.matches
        .filter((n) => n.nextMatchId)
        .map((n) => [n.matchId, n.nextMatchId]),
    );
    for (const start of links.keys()) {
      const visited = new Set();
      let cursor = start;
      while (links.has(cursor)) {
        if (visited.has(cursor))
          throw new Error("Bracket connections cannot contain a cycle.");
        visited.add(cursor);
        cursor = links.get(cursor);
      }
    }
  }
  for (const field of ["sponsors", "talent", "crew"]) {
    const rows = d[field] || [];
    unique(rows, field);
    if (rows.length > 100) throw new Error("Use up to 100 " + field + ".");
    for (const row of rows) {
      text(row.name, 100, "Name");
      if (field === "sponsors") {
        if (row.logoAssetId && !UUID.test(row.logoAssetId))
          throw new Error("Choose an uploaded sponsor logo.");
      } else text(row.role, 80, "Responsibility");
    }
  }
  return JSON.parse(JSON.stringify(project));
}
function blankProject(title = "My broadcast") {
  return {
    title,
    document: {
      schemaVersion: 1,
      teams: [],
      matches: [],
      screens: [
        ["Opening", "pre_show", "starting-soon"],
        ["Match Introduction", "pre_show", "match-intro"],
        ["Map", "match", "ingame"],
        ["Break", "break", "holding"],
        ["Results", "post_show", "series"],
      ].map(([title, type, overlay]) => ({
        id: randomUUID(),
        title,
        type,
        overlay,
        matchId: null,
      })),
      bracket: { format: "manual", stages: [] },
    },
  };
}
function showConfig(
  project,
  matchId,
  assetUrl = (id) => `http://localhost:5300/air-assets/${id}`,
) {
  validateProject(project);
  const d = project.document;
  const teams = d.teams.map((t) => ({
    teamId: t.id,
    id: t.id,
    name: t.name,
    tag: t.tag,
    logoUrl: t.logoAssetId ? assetUrl(t.logoAssetId) : "",
    roster: t.players.map((p) => ({
      ...p,
      name: p.originalName,
      playerId: p.id,
    })),
  }));
  const matches = d.matches.map((m, index) => ({
    matchId: m.id,
    matchCode: `AIR_${m.id.replaceAll("-", "").slice(0, 16)}`,
    bestOf: m.bestOf,
    status: m.status,
    scheduledAt: m.scheduledAt,
    teams: m.teamIds.map((id, side) => ({
      ...teams.find((t) => t.teamId === id),
      seriesScore: m.scores?.[side] || 0,
    })),
    displayOrder: index,
    veto: [],
  }));
  const selected = matches.find((m) => m.matchId === matchId);
  if (!selected || ["completed", "cancelled"].includes(selected.status))
    throw new Error("Choose an upcoming or live project match.");
  const match = d.matches.find((m) => m.id === matchId);
  return {
    source: "standalone",
    workspaceId: project.workspaceId,
    projectId: project.id,
    showId: project.id,
    title: project.title,
    preferredMatchCode: selected.matchCode,
    matchCode: selected.matchCode,
    selectedMatchId: matchId,
    teams: selected.teams,
    matches: matches.filter(
      (m) => !["completed", "cancelled"].includes(m.status),
    ),
    matchHistory: matches.filter((m) =>
      ["completed", "cancelled"].includes(m.status),
    ),
    seriesTotal: selected.bestOf,
    mapPool: match.mapPool.map((name) => ({ name })),
    game: "valorant",
    sponsors: (d.sponsors || []).map((s) => ({
      ...s,
      sponsorId: s.id,
      logoUrl: s.logoAssetId ? assetUrl(s.logoAssetId) : "",
    })),
    casters: (d.talent || []).map((p) => ({ ...p, displayName: p.name })),
    crew: d.crew || [],
    rundownVersion: project.localVersion || project.revision || 1,
    rundown: d.screens.map((s, index) => ({
      ...s,
      displayOrder: index,
      plan: {
        mode: "manual",
        trigger: "manual",
        graphics: [s.overlay],
        transition: { mode: "fade", name: "Fade", durationMs: 300 },
        holdMode: "manual",
        holdSeconds: 30,
      },
    })),
    bracketDocument: d.bracket,
    bracketMatches: matches,
  };
}
module.exports = { UUID, text, validateProject, blankProject, showConfig };
