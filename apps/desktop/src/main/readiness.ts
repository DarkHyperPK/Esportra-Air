// The readiness checklist (PRD picture 7): a pure function of the snapshot. Warns, never blocks;
// every problem names its one fix. Kept apart from Production so it can be read and tested alone.
import type { CheckItem, Snapshot } from '../shared/api.ts';
import type { ArtStatus } from './art-cache.ts';
import { onAir } from './event-model.ts';

/** The readiness checklist (PRD picture 7). Warns, never blocks; every problem names its one fix. */
/** Readiness: are the agent, weapon and map pictures on this PC? */
function artCheck(a: ArtStatus): CheckItem {
  const title = 'Agent and map art';
  if (!a.total) return { id: 'art', title, detail: 'Looking for the agent and map pictures on this PC…', health: 'off' };
  const gone = a.unavailable.length;
  const names = gone ? ` Riot’s art server does not have ${gone === 1 ? 'this picture' : `these ${gone} pictures`}: ${a.unavailable.slice(0, 6).join(', ')}${gone > 6 ? ', …' : ''}. Graphics show the name instead.` : '';
  const missing = a.total - a.have - gone;
  if (missing <= 0) return { id: 'art', title, detail: `${a.have} of ${a.total} agent, weapon and map pictures are on this PC. Graphics show them without internet.${names}`, health: gone ? 'warn' : 'ok' };
  if (a.downloading) return { id: 'art', title, detail: `Downloading pictures to this PC: ${a.have} of ${a.total}…`, health: 'off' };
  return { id: 'art', title, detail: `${missing} of ${a.total} pictures are not on this PC yet. ${a.lastError ? `Last try: ${a.lastError}` : 'The picture download could not reach Riot’s picture server.'} Air tries again every minute.${names}`, health: 'warn', action: { id: 'download-art', label: 'Download now' } };
}

export function checks(s: Snapshot): CheckItem[] {
  const out: CheckItem[] = [];
  const e = s.esportra;
  out.push(
    e.state === 'signed-out'
      ? { id: 'esportra', title: 'Esportra', detail: e.error ?? 'Not signed in. Quick matches work without an account.', health: 'off', action: { id: 'sign-in', label: 'Sign in' } }
      : e.state === 'online'
        ? { id: 'esportra', title: 'Esportra', detail: `Signed in as ${e.email} · ${e.matches.length} match${e.matches.length === 1 ? '' : 'es'} on your schedule${e.warning ? ` · ${e.warning}` : ''}`, health: e.warning ? 'warn' : 'ok' }
        : e.state === 'offline'
          ? { id: 'esportra', title: 'Esportra', detail: e.warning ?? 'Working offline.', health: 'warn' }
          : { id: 'esportra', title: 'Esportra', detail: e.warning ?? 'No Air access.', health: 'warn', action: { id: 'sign-in', label: 'Sign in again' } },
  );
  out.push(
    s.match
      ? { id: 'match', title: 'Show and match', detail: `${s.match.title}${s.event?.name ? ` · ${s.event.name}` : ''} · Bo${s.match.bestOf}`, health: 'ok' }
      : { id: 'match', title: 'Show and match', detail: 'No match selected yet.', health: 'warn', action: { id: 'choose-match', label: 'Create a match' } },
  );
  const found = s.readout ? s.readout.playersFound[0] + s.readout.playersFound[1] : 0;
  out.push(
    s.feed.state === 'live'
      ? { id: 'feed', title: 'Game data', detail: `Valorant is feeding GEP${found ? ` · ${found} of 10 players found` : ''}.`, health: 'ok' }
      : s.feed.state === 'waiting'
        ? { id: 'feed', title: 'Game data', detail: s.feed.reason ?? 'Waiting for Valorant.', health: 'warn' }
        : s.feed.state === 'unavailable'
          ? { id: 'feed', title: 'Game data', detail: s.feed.reason ?? 'Game capture is unavailable on this PC.', health: 'bad' }
          : { id: 'feed', title: 'Game data', detail: 'Game capture is off on this PC. Nothing is read until you start it.', health: 'off', action: { id: 'start-capture', label: 'Start capture' } },
  );
  out.push(
    s.obs.state === 'connected'
      ? { id: 'obs', title: 'OBS', detail: `OBS ${s.obs.version ?? ''} on this PC · Connected`, health: 'ok' }
      : { id: 'obs', title: 'OBS', detail: s.obs.error ?? 'OBS is not connected.', health: 'warn', action: { id: 'connect-obs', label: 'Connect OBS' } },
  );
  out.push(
    s.obs.installed
      ? { id: 'scenes', title: 'Scenes', detail: `${s.outputs.length} Esportra scenes are in your OBS collection.`, health: 'ok' }
      : s.obs.state === 'connected'
        ? { id: 'scenes', title: 'Scenes', detail: s.obs.installError ? `Adding them stopped: ${s.obs.installError}` : s.obs.missingScenes.length ? `Not in OBS yet: ${s.obs.missingScenes.join(', ')}.` : `OBS changed since Air added its scenes: ${s.obs.missingSources.slice(0, 4).join(', ')}${s.obs.missingSources.length > 4 ? ' and more' : ''} missing. Rebuild puts them back without touching your own sources.`, health: s.obs.installError ? 'bad' : 'warn', action: { id: 'install-graphics', label: s.obs.installError ? 'Try again' : s.obs.missingScenes.length ? 'Add for me' : 'Rebuild' } }
        : { id: 'scenes', title: 'Scenes', detail: 'Shown once OBS is connected.', health: 'off' },
  );
  const loading = s.outputs.filter((o) => o.connections > 0).length;
  const idle = s.outputs.filter((o) => o.connections === 0);
  out.push(
    s.obs.installed && idle.length === 0
      ? { id: 'sources', title: 'Browser sources', detail: `${loading} of ${s.outputs.length} connected.`, health: 'ok' }
      : s.obs.installed
        ? { id: 'sources', title: 'Browser sources', detail: `${loading} of ${s.outputs.length} connected · not loading: ${idle.map((o) => o.title).join(', ')}. OBS loads a source when its scene is opened once.`, health: 'warn' }
        : { id: 'sources', title: 'Browser sources', detail: 'Shown once scenes are in OBS.', health: 'off' },
  );
  // Player PCs: only for setups that use them, and only once a match exists.
  if (s.setup.profile === 'player-pcs' && s.match) {
    const d = s.devices;
    const missing = d.seats.filter((x) => x.state !== 'live').map((x) => x.name).filter(Boolean);
    // Before the match: PCs are counted as detected, never named after a player (pairing happens in the game).
    if (!d.fromGame) out.push(d.pcs.length
      ? { id: 'player-pcs', title: `Player PCs · ${d.pcs.length} detected`, detail: `${d.pcs.filter((p) => p.state === 'ready').length} ready. They pair with their players by themselves when the match starts; until then health and abilities stay hidden on air.`, health: 'ok', action: { id: 'open-devices' as const, label: 'Open Devices' } }
      : { id: 'player-pcs', title: 'Player PCs · none detected', detail: 'Open Esportra Player on each player PC and join with this match’s code.', health: 'warn', action: { id: 'open-devices' as const, label: 'Open Devices' } });
    else out.push(d.checkedIn === d.seats.length && d.seats.length > 0
      ? { id: 'player-pcs', title: `Player PCs · ${d.checkedIn} of ${d.seats.length} checked in`, detail: 'Every player’s own data is arriving.', health: 'ok' }
      : { id: 'player-pcs', title: `Player PCs · ${d.checkedIn} of ${d.seats.length} checked in`, detail: `${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}: health and abilities stay hidden on air until their PC sends them.`, health: 'warn', action: { id: 'open-devices' as const, label: 'Open Devices' } });
  }
  const air = s.match ? onAir(s.match, s.event) : { talent: [], sponsors: [] };
  const people = air.talent.length;
  out.push(
    people
      ? { id: 'talent', title: 'Talent and sponsors', detail: `${air.talent.map((t) => t.name).join(', ')}${air.sponsors.length ? ` · ${air.sponsors.length} sponsor${air.sponsors.length > 1 ? 's' : ''}` : ''}`, health: 'ok' }
      : { id: 'talent', title: 'Talent and sponsors', detail: 'Nobody on air for this match. Talent graphics need their names.', health: s.match ? 'warn' : 'off', ...(s.match ? { action: { id: 'add-casters' as const, label: 'Add people' } } : {}) },
  );
  const data = matchDataCheck(s);
  if (data) out.push(data);
  out.push(
    artCheck(s.art),
  );
  return out;
}

/** Match data the selected match's show needs: the veto for Map veto, standings and bracket for theirs. */
function matchDataCheck(s: Snapshot): CheckItem | null {
  if (!s.match || !s.matchData) return null;
  const on = new Set(s.setup.screens.filter((x) => x.enabled).map((x) => x.id));
  const title = 'Match data';
  const action = { id: 'open-match-data' as const, label: 'Open Match data' };
  const needs: string[] = [];
  const following = s.esportraVeto?.source === 'esportra' && !s.esportraVeto.gone;
  if (on.has('map-veto') && !s.matchData.veto.length && !following) needs.push('the veto for Map veto');
  if (on.has('standings') && !s.eventData?.standings.length) needs.push('standings');
  if (on.has('bracket') && !(s.eventData && (s.eventData.bracket.qf.length || s.eventData.bracket.sf.length || s.eventData.bracket.gf.length))) needs.push('the bracket');
  if (needs.length) return { id: 'match-data', title, detail: `Your show has graphics without their data yet: ${needs.join(', ')}. They show an empty state until you add it.`, health: 'warn', action };
  if (on.has('map-veto') && following && !s.matchData.veto.length) return { id: 'match-data', title, detail: 'The veto comes from Esportra as the teams make it.', health: 'ok' };
  return { id: 'match-data', title, detail: s.matchData.veto.length ? `Veto: ${s.matchData.veto.length} step${s.matchData.veto.length === 1 ? '' : 's'} · show text ${s.matchData.show.mode === 'auto' ? 'follows the series' : 'set by you'}.` : 'Nothing in your show needs it yet.', health: 'ok', action };
}
