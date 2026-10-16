import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
export const Workspace = createContext(null);
export const useWorkspace = () => useContext(Workspace);
export const NAV_GROUPS = [
  ["START HERE", [["home", "Broadcast setup"]]],
  [
    "01 / PREPARE",
    [
      ["matches", "Matches"],
      ["players", "Teams & players"],
      ["connections", "Connections"],
    ],
  ],
  [
    "02 / DESIGN",
    [
      ["template", "Broadcast screens"],
      ["hud", "HUD controls"],
    ],
  ],
  [
    "03 / OPERATE",
    [
      ["producer", "OBS controls"],
      ["live", "Live match"],
      ["shortcuts", "Keyboard shortcuts"],
    ],
  ],
  ["WORKSPACE", [["help", "Settings & help"]]],
];
export const PAGES = NAV_GROUPS.flatMap(([, pages]) => pages);
export function WorkspaceProvider({
  status,
  active,
  navigate,
  refresh,
  children,
}) {
  const screenDrafts = useRef(new Map());
  const reviewKey = `air-player-review:${status?.show?.source || "esportra"}:${status?.show?.id || "new"}:${status?.show?.matchCode || "none"}`;
  const rosterSignature = JSON.stringify(
    (status?.show?.teams || status?.show?.registeredRoster || []).map(
      (team) => ({
        id: team.teamId || team.id,
        name: team.name || team.team,
        players: (team.roster || team.players || []).map((player) => ({
          id: player.playerId || player.userId || player.id,
          name: player.originalName || player.name || player.displayName,
          identity: player.inGameName,
          gameId: player.gameId,
          role: player.role,
        })),
      }),
    ),
  );
  const [, setReviewRevision] = useState(0);
  let playersReviewed = false;
  try {
    playersReviewed = localStorage.getItem(reviewKey) === rosterSignature;
  } catch (_) {}
  const markPlayersReviewed = () => {
    try {
      localStorage.setItem(reviewKey, rosterSignature);
    } catch (_) {}
    setReviewRevision((value) => value + 1);
  };
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("air-appearance") || "dark";
    } catch (_) {
      return "dark";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("air-appearance", theme);
    } catch (_) {}
  }, [theme]);
  useEffect(() => {
    try {
      const key = `air-guide:${status?.show?.id || "new"}:visited`;
      const seen = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...seen, [active]: true }));
    } catch (_) {}
  }, [active, status?.show?.id]);
  return (
    <Workspace.Provider
      value={{
        status,
        active,
        navigate,
        refresh,
        theme,
        setTheme,
        playersReviewed,
        markPlayersReviewed,
        screenDrafts,
      }}
    >
      {children}
    </Workspace.Provider>
  );
}
export function HelpTip({ children, label = "Explain this" }) {
  return (
    <span className="help-tip">
      <button type="button" aria-label={label}>
        ?
      </button>
      <span role="tooltip">{children}</span>
    </span>
  );
}
export function PageHead({ eyebrow, title, children, action }) {
  return (
    <header className="workspace-page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {action}
    </header>
  );
}
