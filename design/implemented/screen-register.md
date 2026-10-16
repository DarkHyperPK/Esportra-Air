# Aâ€“Z current screen register

Fixture URLs below select capture scenarios; they do not add production routes. Every image is real renderer output with synthetic data.

| ID | Screen | Surface | Component | Fixture path | Image |
| --- | --- | --- | --- | --- | --- |
| A01-tournament-entry | Tournament dashboard · Broadcast | web | BroadcastPanel | /organizer/tournament/spring-invitational?tab=broadcast | [PNG](screens/A/A01-tournament-entry.png) |
| A02-organization-required | Link an owned organization | web | BroadcastPanel | /organizer/tournament/spring-invitational?tab=broadcast&scenario=unassigned | [PNG](screens/A/A02-organization-required.png) |
| A03-owner-required | Organization-owner access required | web | BroadcastPanel | /organizer/tournament/spring-invitational?tab=broadcast&scenario=blocked | [PNG](screens/A/A03-owner-required.png) |
| B01-shows | Organization show ledger | web | BroadcastShowsPage | /broadcast/shows | [PNG](screens/B/B01-shows.png) |
| B02-empty-shows | No shows yet | web | BroadcastShowsPage | /broadcast/shows?scenario=empty | [PNG](screens/B/B02-empty-shows.png) |
| B04-broadcast-home | Broadcast home on desktop | web | BroadcastHomePage | /broadcast/home | [PNG](screens/B/B04-broadcast-home.png) |
| B05-home-empty | First broadcast home | web | BroadcastHomePage | /broadcast/home?scenario=empty | [PNG](screens/B/B05-home-empty.png) |
| B06-home-error | Broadcast home load failure | web | BroadcastHomePage | /broadcast/home?scenario=error | [PNG](screens/B/B06-home-error.png) |
| C01-get-started | Create or select a show | web | BroadcastGetStartedPage | /broadcast/get-started | [PNG](screens/C/C01-get-started.png) |
| C02-create-show | Create show form | web | BroadcastShowsPage | /broadcast/shows | [PNG](screens/C/C02-create-show.png) |
| D01-show-settings | Identity, tournament and planned start | web | ShowSettingsDialog | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=0 | [PNG](screens/D/D01-show-settings.png) |
| E01-preparation | Connect desktop app | web | ShowPreparation / PreparationStepContent | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=0 | [PNG](screens/E/E01-preparation.png) |
| E02-preparation | Choose a match | web | ShowPreparation / PreparationStepContent | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=1 | [PNG](screens/E/E02-preparation.png) |
| E03-preparation | Preview the HUD | web | ShowPreparation / PreparationStepContent | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=2 | [PNG](screens/E/E03-preparation.png) |
| E04-preparation | Choose broadcast screens | web | ShowPreparation / PreparationStepContent | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=3 | [PNG](screens/E/E04-preparation.png) |
| E05-preparation | Add sponsors | web | ShowPreparation / PreparationStepContent | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=4 | [PNG](screens/E/E05-preparation.png) |
| E06-preparation | Assign talent | web | ShowPreparation / PreparationStepContent | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=5 | [PNG](screens/E/E06-preparation.png) |
| E07-preparation | Assign crew | web | ShowPreparation / PreparationStepContent | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=6 | [PNG](screens/E/E07-preparation.png) |
| E08-preparation | Review broadcast setup | web | ShowPreparation / PreparationStepContent | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=7 | [PNG](screens/E/E08-preparation.png) |
| E13-eligible-matches | Unplayed match choices with teams, time and status | web | SetupMatchPicker | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=1 | [PNG](screens/E/E13-eligible-matches.png) |
| E21-follow-stages | Optional stage following includes future eligible matches without taking Program or creating tournament data | web | FollowBracketSettings | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=1 | [PNG](screens/E/E21-follow-stages.png) |
| E14-hud-demo | Selected teams with clearly labelled sample HUD data | web | HudSetupPreview | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=2 | [PNG](screens/E/E14-hud-demo.png) |
| E15-hud-layout | HUD layout with demo data disabled | web | HudSetupPreview | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=2 | [PNG](screens/E/E15-hud-layout.png) |
| E20-hud-appearance | Saved match display names, team colors, theme, event bug and sponsor rotation preview | web | HudAppearanceSetup / HudAppearanceFields | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=2 | [PNG](screens/E/E20-hud-appearance.png) |
| E22-sponsor-rotation | Optional sponsor setup includes logo rotation and an explicit separation from manual sponsor reads | web | SponsorRotationSettings | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=4 | [PNG](screens/E/E22-sponsor-rotation.png) |
| E16-preview-screen | Preview an individual match introduction before adding it | web | SetupScreenLibrary | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=3 | [PNG](screens/E/E16-preview-screen.png) |
| I04-sponsor-upload | Optional sponsor name and validated logo upload | web | SetupSponsors | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=4 | [PNG](screens/I/I04-sponsor-upload.png) |
| J05-inline-crew | Crew responsibilities inside broadcast setup | web | SetupCrew | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=6 | [PNG](screens/J/J05-inline-crew.png) |
| E17-no-eligible-matches | No eligible unplayed matches with recovery guidance | web | SetupMatchPicker | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=1&scenario=no-eligible | [PNG](screens/E/E17-no-eligible-matches.png) |
| E11-tournament-setup | Tournament-linked guided setup and return link | web | BroadcastSetupPage | /broadcast/shows/f55b45be-c24e-40f7-ba2a-14e8a2aacabc/setup | [PNG](screens/E/E11-tournament-setup.png) |
| E12-config-sent | Configuration sent with desktop verification notice | web | ShowPreparation | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=7 | [PNG](screens/E/E12-config-sent.png) |
| F01-pair-dialog | Generate a temporary pairing code | web | PairNodeDialog | /broadcast/home | [PNG](screens/F/F01-pair-dialog.png) |
| F02-pair-code | Pairing code and countdown | web | PairNodeDialog | /broadcast/home | [PNG](screens/F/F02-pair-code.png) |
| F03-pair-expired | Expired code recovery | web | PairNodeDialog | /broadcast/home?scenario=expired | [PNG](screens/F/F03-pair-expired.png) |
| G01-node-directory | Registered nodes and heartbeat | web | BroadcastNodeMonitorPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/nodes | [PNG](screens/G/G01-node-directory.png) |
| G02-revoke-node | Confirm node access revocation | web | NodeCard | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/nodes | [PNG](screens/G/G02-revoke-node.png) |
| G03-no-nodes | No paired nodes | web | BroadcastNodeMonitorPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/nodes?scenario=empty | [PNG](screens/G/G03-no-nodes.png) |
| H01-talent | On-air talent roster and add form | web | TalentRoster | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=5 | [PNG](screens/H/H01-talent.png) |
| I01-sponsors | Show sponsor directory | web | BroadcastSponsorsPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/sponsors | [PNG](screens/I/I01-sponsors.png) |
| I02-add-sponsor | Sponsor settings form | web | BroadcastSponsorsPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/sponsors | [PNG](screens/I/I02-add-sponsor.png) |
| I03-edit-sponsor | Edit sponsor placement and identity | web | BroadcastSponsorsPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/sponsors | [PNG](screens/I/I03-edit-sponsor.png) |
| J01-crew | Crew roles and pending invites | web | BroadcastCrewPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/crew | [PNG](screens/J/J01-crew.png) |
| J02-invite-link | Single-use role invitation | web | BroadcastCrewPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/crew | [PNG](screens/J/J02-invite-link.png) |
| J05-email-invite | Email submission and account-bound crew link | web | BroadcastCrewPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/crew | [PNG](screens/J/J05-email-invite.png) |
| J06-email-fallback | Email failure preserves the targeted invitation | web | BroadcastCrewPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/crew?scenario=email-failed | [PNG](screens/J/J06-email-fallback.png) |
| J03-revoke-invite | Confirm invite revocation | web | BroadcastCrewPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/crew | [PNG](screens/J/J03-revoke-invite.png) |
| J04-remove-crew | Confirm crew removal | web | BroadcastCrewPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/crew | [PNG](screens/J/J04-remove-crew.png) |
| K01-join-missing | Missing invitation token | web | BroadcastCrewJoinPage | /broadcast/join | [PNG](screens/K/K01-join-missing.png) |
| K02-join-ready | Accept a crew invitation | web | BroadcastCrewJoinPage | /broadcast/join | [PNG](screens/K/K02-join-ready.png) |
| K03-join-accepted | Invitation accepted | web | BroadcastCrewJoinPage | /broadcast/join | [PNG](screens/K/K03-join-accepted.png) |
| K04-join-expired | Expired or used invitation | web | BroadcastCrewJoinPage | /broadcast/join?scenario=expired | [PNG](screens/K/K04-join-expired.png) |
| L04-invitation-inbox | Private account-bound crew invitation inbox | web | BroadcastInvitationsPage | /broadcast/invitations | [PNG](screens/L/L04-invitation-inbox.png) |
| L05-invitation-accepted | Accepted invitation opens assigned crew workspace | web | BroadcastCrewWorkspacePage | /broadcast/crew/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45 | [PNG](screens/L/L05-invitation-accepted.png) |
| L06-invitations-empty | No pending crew invitations | web | BroadcastInvitationsPage | /broadcast/invitations?scenario=empty | [PNG](screens/L/L06-invitations-empty.png) |
| L01-crew-shows | Assigned crew show list | web | BroadcastCrewWorkspacePage | /broadcast/crew/shows | [PNG](screens/L/L01-crew-shows.png) |
| L02-crew-brief | Observer role brief, match codes and plan | web | BroadcastCrewWorkspacePage | /broadcast/crew/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45 | [PNG](screens/L/L02-crew-brief.png) |
| M01-rundown | Show workspace and rundown | web | BroadcastShowDetailPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45 | [PNG](screens/M/M01-rundown.png) |
| M02-segment-expanded | Expanded rundown segment | web | RundownRow | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45 | [PNG](screens/M/M02-segment-expanded.png) |
| M04-cue-take-settings | Typed item cue, screen, scene, transition and Hold settings | web | RundownPlanEditor | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45 | [PNG](screens/M/M04-cue-take-settings.png) |
| N01-mark-live | Confirm platform live status | web | BroadcastShowDetailPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45 | [PNG](screens/N/N01-mark-live.png) |
| N02-end-show | Confirm platform show end | web | BroadcastShowDetailPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45?scenario=live | [PNG](screens/N/N02-end-show.png) |
| O01-report | Post-show recorded report | web | BroadcastPostShowReportPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/report?scenario=ended | [PNG](screens/O/O01-report.png) |
| O02-report-not-ended | Report waits for show end | web | BroadcastPostShowReportPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/report?scenario=live | [PNG](screens/O/O02-report-not-ended.png) |
| P01-sponsor-proof | Recorded sponsor time and proof export | web | BroadcastSponsorProofPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/sponsor-proof?scenario=ended | [PNG](screens/P/P01-sponsor-proof.png) |
| P02-proof-empty | No sponsor impressions yet | web | BroadcastSponsorProofPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/sponsor-proof?scenario=empty | [PNG](screens/P/P02-proof-empty.png) |
| Q01-vod-chapters | VOD chapters and YouTube copy | web | BroadcastVodChaptersPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/vod-chapters?scenario=ended | [PNG](screens/Q/Q01-vod-chapters.png) |
| Q02-vod-empty | No recorded chapters | web | BroadcastVodChaptersPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/vod-chapters?scenario=empty | [PNG](screens/Q/Q02-vod-empty.png) |
| R01-activity | Recorded production activity | web | BroadcastActivityPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/activity | [PNG](screens/R/R01-activity.png) |
| R04-one-hour-timeline | One-hour acknowledged timeline and cross-node incidents | web | ProductionHistory | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/activity | [PNG](screens/R/R04-one-hour-timeline.png) |
| R02-activity-older | Activity pagination | web | BroadcastActivityPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/activity | [PNG](screens/R/R02-activity-older.png) |
| R03-activity-error | Recorded activity load failure | web | BroadcastActivityPage | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/activity?scenario=error | [PNG](screens/R/R03-activity-error.png) |
| S01-machine-role | Production or observer machine role | desktop renderer | ModeScreen | /desktop?screen=mode | [PNG](screens/S/S01-machine-role.png) |
| S02-restart-role | Restart required after role selection | desktop renderer | ModeScreen | /desktop?screen=mode | [PNG](screens/S/S02-restart-role.png) |
| S03-change-role-selection | Change role selection before restarting | desktop renderer | ModeScreen | /desktop?screen=mode | [PNG](screens/S/S03-change-role-selection.png) |
| S04-capture-role-settings | Capture PC can return to role selection | desktop renderer | ModeScreen | /desktop?screen=capture | [PNG](screens/S/S04-capture-role-settings.png) |
| T01-desktop-pair | Desktop pairing form | desktop renderer | PairScreen | /desktop?screen=pair | [PNG](screens/T/T01-desktop-pair.png) |
| T04-revoked | Pairing revoked · capture stopped and automation paused | desktop renderer | PairScreen | /desktop?screen=pair-revoked | [PNG](screens/T/T04-revoked.png) |
| T02-pair-error | Invalid or expired pairing code | desktop renderer | PairScreen | /desktop?screen=pair-error | [PNG](screens/T/T02-pair-error.png) |
| T03-pair-success | Pairing accepted and loading node | desktop renderer | PairScreen | /desktop?screen=pair | [PNG](screens/T/T03-pair-success.png) |
| U01-readiness | Production desk readiness | desktop renderer | ProductionReadiness | /desktop?screen=readiness | [PNG](screens/U/U01-readiness.png) |
| U02-no-show | Awaiting a show configuration | desktop renderer | ProductionReadiness | /desktop?screen=no-show | [PNG](screens/U/U02-no-show.png) |
| U03-pending-plan | Waiting plan and explicit apply | desktop renderer | ProductionReadiness | /desktop?screen=pending | [PNG](screens/U/U03-pending-plan.png) |
| U04-stop-rundown | Stop local rundown confirmation | desktop renderer | ProductionReadiness | /desktop?screen=stop | [PNG](screens/U/U04-stop-rundown.png) |
| V01-obs-disconnected | Producer console before OBS connection | desktop renderer | ProducerScreen | /desktop?screen=producer | [PNG](screens/V/V01-obs-disconnected.png) |
| V02-armed | Producer · armed | desktop renderer | ProducerScreen | /desktop?screen=producer-armed | [PNG](screens/V/V02-armed.png) |
| V03-holding | Producer · holding | desktop renderer | ProducerScreen | /desktop?screen=producer-holding | [PNG](screens/V/V03-holding.png) |
| V04-live | Producer · live | desktop renderer | ProducerScreen | /desktop?screen=producer-live | [PNG](screens/V/V04-live.png) |
| V05-paused | Producer · paused | desktop renderer | ProducerScreen | /desktop?screen=producer-paused | [PNG](screens/V/V05-paused.png) |
| V06-scenes-prepared | Customize broadcast before sending to OBS | desktop renderer | TemplateSetup, TemplatePreview | /desktop?screen=template | [PNG](screens/V/V06-scenes-prepared.png) |
| V36-template-draft | Draft saved without changing OBS | desktop renderer | TemplateSetup | /desktop?screen=template | [PNG](screens/V/V36-template-draft.png) |
| V37-template-sent | Screens sent; next action opens live controls | desktop renderer | TemplateSetup | /desktop?screen=template | [PNG](screens/V/V37-template-sent.png) |
| V38-template-disconnected | Customize first; connect OBS to send | desktop renderer | TemplateSetup | /desktop?screen=template-disconnected | [PNG](screens/V/V38-template-disconnected.png) |
| V39-template-stale | Match changed; reload before sending | desktop renderer | TemplateSetup | /desktop?screen=template-stale | [PNG](screens/V/V39-template-stale.png) |
| V19-collection-confirm | Air-owned collection preparation confirmation | desktop renderer | SceneSlots | /desktop?screen=producer-setup | [PNG](screens/V/V19-collection-confirm.png) |
| V20-source-slots | Game and camera slots detect existing OBS inputs | desktop renderer | SceneSlots | /desktop?screen=producer-setup | [PNG](screens/V/V20-source-slots.png) |
| V10-scene-mappings | Existing OBS scenes and per-item transitions | desktop renderer | SceneMappings | /desktop?screen=producer-setup | [PNG](screens/V/V10-scene-mappings.png) |
| V11-graphic-timings | Local automatic graphics durations | desktop renderer | GraphicsDurations | /desktop?screen=producer-setup | [PNG](screens/V/V11-graphic-timings.png) |
| V27-pause-policy | Delayed pause/timeout panels and optional existing OBS scene | desktop renderer | PauseRulesSettings | /desktop?screen=producer-setup | [PNG](screens/V/V27-pause-policy.png) |
| V14-toast-form | Inline HUD update form | desktop renderer | GraphicForms | /desktop?screen=producer-setup | [PNG](screens/V/V14-toast-form.png) |
| V15-poll-form | Inline poll options and result percentages | desktop renderer | GraphicForms | /desktop?screen=producer-setup | [PNG](screens/V/V15-poll-form.png) |
| V16-sponsor-read | Assigned sponsor read and queued proof | desktop renderer | GraphicForms | /desktop?screen=producer-setup | [PNG](screens/V/V16-sponsor-read.png) |
| V17-rehearsal-empty | Load a sample rehearsal | desktop renderer | RehearsalScreen | /desktop?screen=producer-setup | [PNG](screens/V/V17-rehearsal-empty.png) |
| V18-rehearsal-loaded | Packaged rehearsal controls and OBS opt-in | desktop renderer | RehearsalScreen | /desktop?screen=producer-setup | [PNG](screens/V/V18-rehearsal-loaded.png) |
| V21-one-hour-timeline | Desktop confirmed takes, holds and incidents | desktop renderer | ProductionTimeline | /desktop?screen=producer-setup | [PNG](screens/V/V21-one-hour-timeline.png) |
| V22-operator-held | Operator Hold waits for Take or Skip | desktop renderer | ProducerScreen | /desktop?screen=producer-held | [PNG](screens/V/V22-operator-held.png) |
| V23-plan-version-waiting | Upcoming rundown version and change review | desktop renderer | ProducerScreen, RundownRevision | /desktop?screen=producer-plan-waiting | [PNG](screens/V/V23-plan-version-waiting.png) |
| V24-on-air-score-fix | On-air score override and next-round expiry | desktop renderer | DisplayFixScreen | /desktop?screen=producer-setup | [PNG](screens/V/V24-on-air-score-fix.png) |
| V25-active-override-undo | Active override, clear and Undo | desktop renderer | ActiveDisplayFixes | /desktop?screen=producer-setup | [PNG](screens/V/V25-active-override-undo.png) |
| V26-observed-player-fix | Player focus from the received roster | desktop renderer | DisplayFixScreen | /desktop?screen=producer-setup | [PNG](screens/V/V26-observed-player-fix.png) |
| V28-series-fix | Local series wins with feed locks and Undo | desktop renderer | DisplayFixScreen | /desktop?screen=producer-setup | [PNG](screens/V/V28-series-fix.png) |
| V29-player-name-fix | Received player identity to broadcast display name | desktop renderer | DisplayFixScreen | /desktop?screen=producer-setup | [PNG](screens/V/V29-player-name-fix.png) |
| V12-game-data | Reported game data and combined log | desktop renderer | ProducerScreen / LiveDataStrip | /desktop?screen=producer-feed | [PNG](screens/V/V12-game-data.png) |
| V13-stale-feed | Stale game feed and retained values | desktop renderer | ProducerScreen / LiveDataStrip | /desktop?screen=producer-feed-stale | [PNG](screens/V/V13-stale-feed.png) |
| V14-team-timeout | Team timeout distinct from technical pause | desktop renderer | ProducerScreen / LiveDataStrip | /desktop?screen=producer-timeout | [PNG](screens/V/V14-team-timeout.png) |
| V15-replay-inactive | Replay disabled until OBS buffer is active | desktop renderer | ProducerScreen / LiveDataStrip | /desktop?screen=producer-replay-off | [PNG](screens/V/V15-replay-inactive.png) |
| V07-shortcuts | Editable production shortcuts with action descriptions | desktop renderer | ShortcutSettings | /desktop?screen=producer-armed | [PNG](screens/V/V07-shortcuts.png) |
| V08-shortcut-conflict | Conflicting shortcut rejected before saving | desktop renderer | ShortcutSettings | /desktop?screen=producer-armed | [PNG](screens/V/V08-shortcut-conflict.png) |
| V09-shortcut-saved | Custom shortcut saved on the production workstation | desktop renderer | ShortcutSettings | /desktop?screen=producer-armed | [PNG](screens/V/V09-shortcut-saved.png) |
| V10-shortcuts-reset | Default production shortcuts restored | desktop renderer | ShortcutSettings | /desktop?screen=producer-armed | [PNG](screens/V/V10-shortcuts-reset.png) |
| W01-observer | Observer capture utility · waiting for production | desktop renderer | CaptureScreen | /desktop?screen=capture | [PNG](screens/W/W01-observer.png) |
| W02-capture-consent | Capture privacy consent | desktop renderer | CaptureControls | /desktop?screen=capture | [PNG](screens/W/W02-capture-consent.png) |
| W05-player-consent | Player-PC GEP capture consent and identity guidance | desktop renderer | CaptureControls | /desktop?screen=capture | [PNG](screens/W/W05-player-consent.png) |
| W03-capture-active | Capture process active · fixture packet rate | desktop renderer | CaptureScreen | /desktop?screen=capture-active | [PNG](screens/W/W03-capture-active.png) |
| W04-relay-connected | LAN consumer connected | desktop renderer | CaptureScreen | /desktop?screen=capture-connected | [PNG](screens/W/W04-relay-connected.png) |
| X01-outputs-empty | First browser source | desktop renderer | SourceOutputs | /desktop?screen=readiness | [PNG](screens/X/X01-outputs-empty.png) |
| X02-output-form | Add existing HUD overlay output | desktop renderer | SourceOutputs | /desktop?screen=readiness | [PNG](screens/X/X02-output-form.png) |
| X03-output-list | Local HTTP browser source inventory | desktop renderer | SourceOutputs | /desktop?screen=outputs-list | [PNG](screens/X/X03-output-list.png) |
| X04-output-lan | LAN browser source address | desktop renderer | SourceOutputs | /desktop?screen=outputs-list | [PNG](screens/X/X04-output-lan.png) |
| X05-remove-output | Remove browser output confirmation | desktop renderer | SourceOutputs | /desktop?screen=outputs-list | [PNG](screens/X/X05-remove-output.png) |
| Y01-score-form | Review a local map correction | desktop renderer | ScoreCorrection | /desktop?screen=readiness | [PNG](screens/Y/Y01-score-form.png) |
| Y02-score-confirm | Confirm local HUD correction | desktop renderer | ScoreCorrection | /desktop?screen=readiness | [PNG](screens/Y/Y02-score-confirm.png) |
| Y03-result-scope | Air plus official result review, with explicit authorization boundary | desktop renderer | ScoreCorrection | /desktop?screen=readiness | [PNG](screens/Y/Y03-result-scope.png) |
| Y04-official-proposal | Current official score beside the pending Air proposal | web | BroadcastResultReview | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45?scenario=result-review | [PNG](screens/Y/Y04-official-proposal.png) |
| Y05-official-confirm | Explicit confirmation before applying the tournament result | web | BroadcastResultReview | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45?scenario=result-review | [PNG](screens/Y/Y05-official-confirm.png) |
| Y06-stale-official-result | Changed official result blocks the stale approval | web | BroadcastResultReview | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45?scenario=result-stale | [PNG](screens/Y/Y06-stale-official-result.png) |
| Y07-result-viewer | Assigned crew can inspect proposals without result permission | web | BroadcastResultReview | /broadcast/crew/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45?scenario=result-viewer | [PNG](screens/Y/Y07-result-viewer.png) |
| U30-workspace-matches | Match-day match list | desktop renderer | MatchDayPages / LiveMatchPage | /desktop?screen=workspace-matches | [PNG](screens/U/U30-workspace-matches.png) |
| U31-workspace-players | Original identities and HUD nicknames | desktop renderer | MatchDayPages / LiveMatchPage | /desktop?screen=workspace-players | [PNG](screens/U/U31-workspace-players.png) |
| U32-workspace-live | Live game telemetry | desktop renderer | MatchDayPages / LiveMatchPage | /desktop?screen=workspace-live | [PNG](screens/U/U32-workspace-live.png) |
| U33-workspace-live-stale | Stale live feed recovery | desktop renderer | MatchDayPages / LiveMatchPage | /desktop?screen=workspace-live-stale | [PNG](screens/U/U33-workspace-live-stale.png) |
| U34-workspace-empty | No prepared matches | desktop renderer | MatchDayPages / LiveMatchPage | /desktop?screen=workspace-empty | [PNG](screens/U/U34-workspace-empty.png) |
| U40-packets | Local packets · display paused while capture continues | desktop renderer | LiveMatchPage | /desktop?screen=workspace-live | [PNG](screens/U/U40-packets.png) |
| U41-connections | OBS and observer connection forms | desktop renderer | ConnectionsPage | /desktop?screen=workspace-live | [PNG](screens/U/U41-connections.png) |
| U42-observer | Add observer with separate address, port and masked key | desktop renderer | ConnectionsPage | /desktop?screen=workspace-live | [PNG](screens/U/U42-observer.png) |
| U43-walkthrough | First-broadcast walkthrough and appearance settings | desktop renderer | HelpPage / Walkthrough | /desktop?screen=workspace-live | [PNG](screens/U/U43-walkthrough.png) |
| U44-matches-light | Match-day workspace in light appearance | desktop renderer | MatchesPage / WorkspaceShell | /desktop?screen=workspace-live | [PNG](screens/U/U44-matches-light.png) |
| U45-projects-signin | Independent broadcast · projects-signin | desktop renderer | ProjectsPage | /desktop?screen=projects-signin | [PNG](screens/U/U45-projects-signin.png) |
| U46-projects-list | Independent broadcast · projects-list | desktop renderer | ProjectsPage | /desktop?screen=projects-list | [PNG](screens/U/U46-projects-list.png) |
| U47-projects-offline | Independent broadcast · projects-offline | desktop renderer | ProjectsPage | /desktop?screen=projects-offline | [PNG](screens/U/U47-projects-offline.png) |
| U48-projects-conflict | Independent broadcast · projects-conflict | desktop renderer | ProjectsPage | /desktop?screen=projects-conflict | [PNG](screens/U/U48-projects-conflict.png) |
| U56-broadcast-setup | Broadcast setup: four steps with the next action | desktop renderer | BroadcastHome / WorkspaceShell | /desktop?screen=workspace-home | [PNG](screens/U/U56-broadcast-setup.png) |
| U50-screen-library | Add individual screens with preview | desktop renderer | ScreenLibrary | /desktop?screen=template | [PNG](screens/U/U50-screen-library.png) |
| U51-template-library | Preview a ready-made broadcast screen set | desktop renderer | ScreenLibrary | /desktop?screen=template | [PNG](screens/U/U51-template-library.png) |
| U52-hud-layers | HUD layers, banner appearance and read-only draft preview | desktop renderer | HudControlsPage | /desktop?screen=template | [PNG](screens/U/U52-hud-layers.png) |
| U53-hud-controls | Screen content in the HUD control panel | desktop renderer | HudControlsPage | /desktop?screen=template | [PNG](screens/U/U53-hud-controls.png) |
| U54-hud-controls | Live graphics in the HUD control panel | desktop renderer | HudControlsPage | /desktop?screen=template | [PNG](screens/U/U54-hud-controls.png) |
| U55-hud-controls | Match data in the HUD control panel | desktop renderer | HudControlsPage | /desktop?screen=template | [PNG](screens/U/U55-hud-controls.png) |
| V39-bracket-settings | Published bracket stage, section and pagination controls | desktop renderer | BracketPage | /desktop?screen=template | [PNG](screens/V/V39-bracket-settings.png) |
| B10-independent-web | Account-owned independent projects on web | web | AirWorkspacePage | /air | [PNG](screens/B/B10-independent-web.png) |
| P10-air-customers | Dedicated Air super-admin customers and licenses | web | AirAdminPage | /admin/air | [PNG](screens/P/P10-air-customers.png) |
| P11-air-workspaces | Air admin · Workspaces | web | AirAdminPage / AirAdminTable | /admin/air | [PNG](screens/P/P11-air-workspaces.png) |
| P12-air-plans | Air admin · Plans | web | AirAdminPage / AirAdminTable | /admin/air | [PNG](screens/P/P12-air-plans.png) |
| P13-air-devices | Air admin · Devices | web | AirAdminPage / AirAdminTable | /admin/air | [PNG](screens/P/P13-air-devices.png) |
| P14-air-audit-history | Air admin · Audit history | web | AirAdminPage / AirAdminTable | /admin/air | [PNG](screens/P/P14-air-audit-history.png) |
| P15-air-releases | Air admin · Releases | web | AirAdminPage / AirAdminTable | /admin/air | [PNG](screens/P/P15-air-releases.png) |
| P16-air-release-editor | Manual release information editor | web | AirAdminForm | /admin/air | [PNG](screens/P/P16-air-release-editor.png) |
| P17-air-access-grant | Manual access grant, extension and device allowances | web | AirAdminForm / AirGrantFields | /admin/air | [PNG](screens/P/P17-air-access-grant.png) |
| Z01-offline | Platform disconnected · local systems and queued records | desktop renderer | ProductionReadiness | /desktop?screen=offline | [PNG](screens/Z/Z01-offline.png) |
| A04-tournament-phone | Tournament Broadcast on a phone | phone web | Current web page at phone viewport | /organizer/tournament/spring-invitational?tab=broadcast | [PNG](screens/A/A04-tournament-phone.png) |
| B03-home-phone | Broadcast home on a phone | phone web | Current web page at phone viewport | /broadcast/home | [PNG](screens/B/B03-home-phone.png) |
| E10-preparation-phone | Preparation step selector on a phone | phone web | Current web page at phone viewport | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=3 | [PNG](screens/E/E10-preparation-phone.png) |
| M03-rundown-phone | Rundown on a phone | phone web | Current web page at phone viewport | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45 | [PNG](screens/M/M03-rundown-phone.png) |
| O03-report-phone | Post-show report on a phone | phone web | Current web page at phone viewport | /broadcast/shows/5e182c34-49f8-40d3-bf6c-88b576c20c45/report | [PNG](screens/O/O03-report-phone.png) |
| E18-sidebar-phone | Mobile preparation in a left navigation drawer | phone web | BroadcastShell / SetupSidebar | /broadcast/get-started?match=5e182c34-49f8-40d3-bf6c-88b576c20c45&showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=1 | [PNG](screens/E/E18-sidebar-phone.png) |
| E09-explicit-match-choice | No silent match selection; clear blocked action and recovery | web | ShowPreparation | /broadcast/get-started?showId=5e182c34-49f8-40d3-bf6c-88b576c20c45&step=1 | [PNG](screens/E/E09-explicit-match-choice.png) |
| V40-bracket-upper | Upper elimination bracket | desktop renderer | HUD bracket-presentation.js | /overlays/bracket.html?match=BRACKET_TEST | [PNG](screens/V/V40-bracket-upper.png) |
| V41-bracket-lower | Lower elimination bracket | desktop renderer | HUD bracket-presentation.js | /overlays/bracket.html?match=BRACKET_TEST | [PNG](screens/V/V41-bracket-lower.png) |
| V42-bracket-final | Final bracket | desktop renderer | HUD bracket-presentation.js | /overlays/bracket.html?match=BRACKET_TEST | [PNG](screens/V/V42-bracket-final.png) |
| V43-group-matches | Group match presentation | desktop renderer | HUD bracket-presentation.js | /overlays/bracket.html?match=BRACKET_TEST | [PNG](screens/V/V43-group-matches.png) |
| V44-swiss-standings | Source Swiss standings | desktop renderer | HUD bracket-presentation.js | /overlays/bracket.html?match=BRACKET_TEST | [PNG](screens/V/V44-swiss-standings.png) |
| V45-bracket-pagination | Large bracket second page | desktop renderer | HUD bracket-presentation.js | /overlays/bracket.html?match=BRACKET_TEST | [PNG](screens/V/V45-bracket-pagination.png) |
