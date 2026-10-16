# Independent Air project format

Version 1, 15 October 2026. These are account-owned broadcast documents, separate from official tournament records.

In **Matches → Create a match**, open a project and use **Bracket graphics → Import teams, matches and bracket JSON**. Import accepts a document below or a saved project containing a `document` property. Review the replacement before confirming. Import replaces the project's teams, matches, screens, bracket and optional production assignments; it does not generate a tournament or advance winners. Export a backup before replacing a project.

Every entity uses a nonempty UUID. `teamIds` references two different teams in this document. `matchId` and `nextMatchId` reference supplied matches. Bracket connections cannot loop; a match appears once per stage. Round numbers start at zero. `side` is `upper`, `lower`, `final` or `group`. Formats are `single_elimination`, `double_elimination`, `round_robin`, `swiss`, `groups` or `manual`. Group/Swiss match boards display the supplied results; Air does not calculate a tournament pairing or advance standings.

Each player has separate `originalName`, exact `inGameName` including its tag, optional `gameId` received from the game, optional `hudNickname`, and `role` (`starter` or `substitute`). A nickname affects the HUD only. Ambiguous identities require a detected-player confirmation in **Teams & players**. Don't invent game IDs.

Matches contain `bestOf` (1/3/5/7/9), `mapPool`, optional ISO `scheduledAt`, `status` (`scheduled`, `in_progress`, `completed`, `cancelled`) and optional two-element series-win `scores`. Completed/cancelled matches are history and cannot be prepared for a new broadcast. Supplied results are presentation data, never official Esportra results.

Screens use an installed overlay name (for example `starting-soon`, `match-intro`, `ingame`, `brb`, `map-result`, `bracket`), a title, type (`pre_show`, `match`, `break`, `post_show`, `sponsor_slot`, `custom`) and optional match binding. Array order controls screen order. Customize the selected match before **Send to OBS**.

Optional `sponsors` contain `{id,name,logoAssetId}`. Optional `talent` and `crew` contain `{id,name,role}`. Logo IDs must refer to uploads in this workspace; import cannot reference another workspace's asset. Upload assets through the editor, rather than embedding base64 or file paths. Files are capped at 2 MB, 128 teams, 15 players per team, 512 matches, 200 screens and 32 stages.

[Example document](examples/air-project.json) has no played-match results. Replace its example identities before broadcasting. The app preserves local drafts during revision conflicts and retains a backup when resolving a conflict. Preview/sample practice is separate from real project state.
