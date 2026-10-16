import React, { useEffect, useState } from "react";
import AirShell from "./air/AirShell.jsx";
import { PageHead, useWorkspace } from "../workspace.jsx";
import { TeamEditor, MatchEditor } from "./ProjectEditors.jsx";
import ProjectProductionEditor from "./ProjectProductionEditor.jsx";
import ProjectBracketEditor from "./ProjectBracketEditor.jsx";
const api = window.esportraBroadcast?.projects;
export default function ProjectsPage() {
  const { navigate, refresh } = useWorkspace();
  const [session, setSession] = useState(null),
    [projects, setProjects] = useState([]),
    [project, setProject] = useState(null),
    [workspaceId, setWorkspaceId] = useState(""),
    [editor, setEditor] = useState(null);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    const result = await api.session();
    if (!result.ok) throw new Error(result.error);
    setSession(result);
    if (result.authenticated) {
      const list = await api.list();
      setProjects(list.projects || []);
      setWorkspaceId((value) => value || result.workspaces?.[0]?.id || "");
    }
  }
  useEffect(() => {
    void load().catch((failure) => setError(failure.message));
  }, []);
  async function perform(action, success) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (result?.ok === false) throw new Error(result.error);
      if (result.project) setProject(result.project);
      await load();
      await refresh();
      if (success) setNotice(success);
      return result;
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(document) {
    const result = await perform(
      () => api.save({ ...project, document }),
      "Draft saved locally. Air syncs it when a connection is available.",
    );
    if (result?.ok) setEditor(null);
    return result;
  }
  async function logo() {
    const result = await perform(
      () => api.upload(project.workspaceId),
      "Logo cached for this workspace.",
    );
    return result?.asset;
  }
  if (!session?.authenticated)
    return (
      <AirShell screenTitle="Independent broadcasts">
        <main className="workspace-page">
          <PageHead
            eyebrow="AIR WORKS WITH YOUR TOURNAMENT"
            title="Your matches. Your production."
            action={
              <button
                className="air-ghost-btn"
                onClick={() => navigate("readiness")}
              >
                Back to pairing
              </button>
            }
          >
            Create matches directly in Air. An Esportra account is required; an
            Esportra tournament or organizer verification is not.
          </PageHead>
          <section className="workspace-section">
            <h2>Sign in to Esportra Air</h2>
            <p>
              New accounts receive one 14-day trial. Your verified access
              supports offline event work for up to seven days.
            </p>
            {error && (
              <p role="alert" className="broadcast-error">
                {error}
              </p>
            )}
            <form
              className="workspace-form"
              onSubmit={(event) => {
                event.preventDefault();
                void perform(
                  () => api.login(email, password),
                  "Signed in. Create your first project.",
                ).then((result) => {
                  if (result?.ok) setPassword("");
                });
              }}
            >
              <label>
                Email
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              <div className="product-actions full">
                <button className="air-primary-btn" disabled={busy}>
                  {busy ? "Signing in…" : "Sign in"}
                </button>
                <button
                  className="air-ghost-btn"
                  type="button"
                  onClick={() => api.openSignup()}
                >
                  Create an Esportra account
                </button>
              </div>
            </form>
          </section>
        </main>
      </AirShell>
    );
  return (
    <AirShell screenTitle="Independent projects">
      <main className="workspace-page">
        <PageHead
          eyebrow="INDEPENDENT BROADCASTS"
          title={project?.title || "Make your next broadcast."}
          action={
            <button
              className="air-ghost-btn"
              disabled={busy}
              onClick={() =>
                perform(
                  () => api.sync(),
                  "Sync finished. Local drafts are retained if a conflict needs review.",
                )
              }
            >
              Sync projects
            </button>
          }
        >
          Create teams and matches without a tournament connection. Choose a
          match, then customize its broadcast screens.
        </PageHead>
        {error && (
          <p role="alert" className="broadcast-error">
            {error}
          </p>
        )}
        {notice && (
          <p className="inline-notice" role="status">
            {notice}
          </p>
        )}
        {session.error&&<p className="inline-notice" role="alert">{session.error} Local drafts are retained. <button className="air-ghost-btn" disabled={busy} onClick={()=>perform(()=>api.sync(),'Sync retried.')}>Retry sync</button></p>}
      {session.warning && (
          <p className="inline-notice">
            {session.warning}{" "}
            {session.offlineExpiresAt &&
              `Offline access expires ${new Date(session.offlineExpiresAt).toLocaleString()}.`}{" "}
            <button
              className="air-ghost-btn"
              disabled={busy}
              onClick={() =>
                perform(() => api.checkAccess(), "Access checked.")
              }
            >
              Check access
            </button>
          </p>
        )}
        <div className="workspace-toolbar">
          <span>{session.email}</span>
          <span className="status-pill">
            {session.account?.status || "Account ready"} ·{" "}
            {session.pending || 0} pending drafts
          </span>
          <button
            className="air-ghost-btn"
            onClick={() => {
              setProject(null);
              setEditor(null);
            }}
          >
            All projects
          </button>
          <button
            className="air-ghost-btn"
            disabled={busy}
            onClick={() =>
              perform(
                () => api.tournament(),
                "Tournament workspace restored.",
              ).then((result) => {
                if (result?.ok) navigate("matches");
              })
            }
          >
            Open tournament workspace
          </button>
          <button
            className="air-ghost-btn"
            disabled={busy}
            onClick={() => perform(() => api.logout(), "Signed out.")}
          >
            Sign out
          </button>
        </div>
        {!project ? (
          <>
            <form
              className="workspace-form"
              onSubmit={(event) => {
                event.preventDefault();
                void perform(
                  () => api.create(workspaceId, title),
                  "Project created. Add teams to get started.",
                );
              }}
            >
              <label>
                Workspace
                <select
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  required
                >
                  {session.workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Project name
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  maxLength={120}
                  placeholder="Weekend invitational"
                />
              </label>
              <div className="product-actions full">
                <button
                  className="air-primary-btn"
                  disabled={busy || !workspaceId}
                >
                  Create project
                </button>
              </div>
            </form>
            <section className="workspace-section">
              <h2>Your projects</h2>
              {!projects.length ? (
                <p>
                  No projects yet. Your first project only needs teams and a
                  match.
                </p>
              ) : (
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Matches</th>
                      <th>Saved state</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.title}</strong>
                        </td>
                        <td>{row.document.matches.length}</td>
                        <td>
                          {row.conflict
                            ? "Conflict needs review"
                            : row.dirty
                              ? "Saved locally · sync pending"
                              : "Synced"}
                        </td>
                        <td>
                          <button
                            className="air-ghost-btn"
                            onClick={() => perform(() => api.get(row.id))}
                          >
                            Open project
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        ) : (
          <>
            {project.conflict && (
              <section className="inline-notice">
                <h2>This project changed on another device</h2>
                <p>
                  Your local draft and the cloud revision are both saved.
                  Choosing a version keeps a backup of this local draft.
                </p>
                <div className="product-actions">
                  <button
                    className="air-primary-btn"
                    onClick={() =>
                      perform(
                        () => api.resolve(project.id, "keep-local"),
                        "Local draft retained and queued against the latest cloud revision.",
                      )
                    }
                  >
                    Keep my draft
                  </button>
                  <button
                    className="air-ghost-btn"
                    onClick={() =>
                      perform(
                        () => api.resolve(project.id, "use-cloud"),
                        "Cloud revision loaded. Local backup retained.",
                      )
                    }
                  >
                    Use cloud revision
                  </button>
                </div>
              </section>
            )}
            <section className="workspace-section">
              <div className="product-page-head">
                <h2>Teams & players</h2>
                <button
                  className="air-ghost-btn"
                  disabled={busy}
                  onClick={() => setEditor({ kind: "team" })}
                >
                  Add team
                </button>
              </div>
              {project.document.teams.map((team) => (
                <div className="product-data-row" key={team.id}>
                  <strong>{team.name}</strong>
                  <span>{team.players.length} players</span>
                  <button
                    className="air-ghost-btn"
                    disabled={busy}
                    onClick={() => setEditor({ kind: "team", initial: team })}
                  >
                    Edit team
                  </button>
                </div>
              ))}
              {!project.document.teams.length && (
                <p>Add both teams and their in-game player identities.</p>
              )}
            </section>
            {editor?.kind === "team" && (
              <TeamEditor
                key={editor.initial?.id || "new-team"}
                initial={editor.initial}
                busy={busy}
                onLogo={logo}
                onCancel={() => setEditor(null)}
                onSave={(team) =>
                  save({
                    ...project.document,
                    teams: project.document.teams.some(
                      (row) => row.id === team.id,
                    )
                      ? project.document.teams.map((row) =>
                          row.id === team.id ? team : row,
                        )
                      : [...project.document.teams, team],
                  })
                }
              />
            )}
            <section className="workspace-section">
              <div className="product-page-head">
                <h2>Matches</h2>
                <button
                  className="air-primary-btn"
                  disabled={busy || project.document.teams.length < 2}
                  onClick={() => setEditor({ kind: "match" })}
                >
                  Create match
                </button>
              </div>
              {project.document.teams.length < 2 && (
                <p>Add two teams to enable match creation.</p>
              )}
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Match</th>
                    <th>Format</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {project.document.matches.map((match) => (
                    <tr key={match.id}>
                      <td>
                        <strong>{match.title}</strong>
                        <small>
                          {match.teamIds
                            .map(
                              (id) =>
                                project.document.teams.find(
                                  (team) => team.id === id,
                                )?.name,
                            )
                            .join(" vs ")}
                        </small>
                      </td>
                      <td>Best of {match.bestOf}</td>
                      <td>{match.status}</td>
                      <td>
                        <div className="product-actions">
                          <button
                            className="air-ghost-btn"
                            disabled={busy}
                            onClick={() =>
                              setEditor({ kind: "match", initial: match })
                            }
                          >
                            Edit
                          </button>
                          <button
                            className="air-primary-btn"
                            disabled={
                              busy ||
                              ["completed", "cancelled"].includes(match.status)
                            }
                            onClick={() =>
                              perform(
                                () => api.select(project.id, match.id),
                                "Match prepared in Air.",
                              ).then((result) => {
                                if (result?.ok) navigate("players");
                              })
                            }
                          >
                            Prepare match
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            {editor?.kind === "match" && (
              <MatchEditor
                key={editor.initial?.id || "new-match"}
                teams={project.document.teams}
                initial={editor.initial}
                busy={busy}
                onCancel={() => setEditor(null)}
                onSave={(match) =>
                  save({
                    ...project.document,
                    matches: project.document.matches.some(
                      (row) => row.id === match.id,
                    )
                      ? project.document.matches.map((row) =>
                          row.id === match.id ? match : row,
                        )
                      : [...project.document.matches, match],
                  })
                }
              />
            )}
            <ProjectProductionEditor
              project={project}
              busy={busy}
              onSave={save}
              onLogo={logo}
            />
            <ProjectBracketEditor project={project} busy={busy} onSave={save} />
          </>
        )}
      </main>
    </AirShell>
  );
}
