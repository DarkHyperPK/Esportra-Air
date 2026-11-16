// Esportra on this PC: signing in and out, the schedule, and making an Esportra match the match here.
// Production gives it a small context; the account (HTTP, tokens, access) is src/main/esportra.ts.
import { randomUUID } from 'node:crypto';
import { readLineup, readPackage, type EsportraPackage, type EsportraPlayer } from '../shared/esportra-package.ts';
import { gameName } from '../shared/games.ts';
import type { Library, Match, Team } from '../shared/api.ts';
import type { EsportraAccount } from './esportra.ts';
import type { Store } from './store.ts';
import { linkMatch } from './team-library.ts';
import { COLORS, tagFor } from './team-tags.ts';

export interface EsportraContext {
  /** The account; absent in builds and tests without it. */
  account(): EsportraAccount | undefined;
  store: Store;
  /** The game Air is set to, or null. */
  game(): string | null;
  /** The Esportra id of the selected match, if it came from Esportra. */
  selectedSource(): string | null;
  /** Throws while switching match would change graphics on air. */
  assertCanSwitch(): void;
  /** The event, stage and switch lists a new match of this tournament starts with. */
  carryOver(tournamentId: string | null, tournamentName: string): Pick<Match, 'eventId' | 'stage' | 'talentOff' | 'sponsorsOff' | 'theme'>;
  library(): Library;
  save(): void;
  syncEngine(): Promise<void>;
  log(text: string): void;
  now(): number;
  /** Puts a prepared package into the selected match (veto, bracket, sponsors and casters where empty). */
  applyPackage(pkg: EsportraPackage): Promise<void>;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export class EsportraMatches {
  private readonly ctx: EsportraContext;

  constructor(ctx: EsportraContext) {
    this.ctx = ctx;
  }

  private get account() {
    const account = this.ctx.account();
    if (!account) throw new Error('Esportra sign-in is not available in this build.');
    return account;
  }

  async signIn(email: string, password: string) {
    await this.account.login(email, password);
    this.ctx.log('Signed in to Esportra');
  }

  signOut() {
    this.account.logout();
    this.ctx.log('Signed out of Esportra');
  }

  async requestAccess(note: unknown) {
    await this.account.requestAccess(note);
    this.ctx.log('Asked Esportra for Air access');
  }

  async withdrawRequest() {
    await this.account.withdrawRequest();
    this.ctx.log('Air access request withdrawn');
  }

  /** Check again: asks whether access is on, and loads the matches when it is. Still refused is not an error here. */
  async check() {
    const account = this.account;
    await account.checkAccess().catch(() => {});
    if (account.view().state !== 'denied') await this.refresh();
  }

  async refresh() {
    const account = this.account;
    await account.checkAccess().catch(() => {});
    // Without Air access the match list is refused anyway: say why once, instead of asking again.
    if (account.view().state === 'denied') throw new Error(account.view().warning ?? 'Esportra has not turned on Air for this account yet, so its matches cannot load. Your own events and matches work as normal.');
    await account.refreshMatches();
    // Matches Esportra reports as completed are finished here too.
    const done = new Set(account.view().matches.filter((e) => e.status === 'completed').map((e) => e.id));
    let changed = false;
    for (const m of this.ctx.store.data.matches) if (!m.finishedAt && m.source && done.has(m.source.matchId)) { m.finishedAt = Date.now(); changed = true; }
    if (changed) this.ctx.save();
    // The match on this PC from Esportra: its package again (lineup Riot ids, veto, bracket).
    const selected = this.ctx.selectedSource();
    if (selected && account.view().matches.some((m) => m.id === selected)) await this.prepare(selected).then((pkg) => this.ctx.applyPackage(pkg)).catch((e) => this.ctx.log(`Esportra package not refreshed · ${(e as Error).message}`));
  }

  /** The match package from Esportra. */
  private async prepare(matchId: string) {
    return readPackage(await this.account.prepare(matchId, randomUUID()));
  }

  /** Fills Riot ids into a lineup typed earlier (by name), or the whole lineup when it is empty. */
  private static fillLineup(players: Match['players'][0], from: EsportraPlayer[]) {
    if (!players.length) return from.map((p) => ({ id: randomUUID(), name: p.name, realName: '', gameId: p.gameId, photo: '' }));
    for (const p of players) {
      const found = from.find((e) => same(e.name, p.name));
      if (found && !p.gameId && found.gameId) p.gameId = found.gameId;
    }
    return players;
  }

  /** Makes an Esportra match the match on this PC: teams, tags, logos, best-of and tournament name. */
  async use(matchId: string) {
    const account = this.account;
    const found = account.view().matches.find((m) => m.id === matchId);
    if (!found) throw new Error('That match is no longer in your Esportra schedule. Refresh the list.');
    if (this.ctx.selectedSource() !== matchId) this.ctx.assertCanSwitch();
    if (!found.supported) throw new Error('Air cannot produce this match’s game yet.');
    const game = this.ctx.game();
    if (game !== 'valorant') throw new Error(`This is a Valorant match and Air is set to ${game ? gameName(game as never) : 'no game'}. Switch game from the top bar first.`);
    if (account.view().state === 'denied') throw new Error(account.view().warning ?? 'Esportra has not confirmed Air access for this PC.');
    // The package has the registered lineup with verified Riot ids; the roster is the fallback.
    let pkg: EsportraPackage | null = null;
    let players: [EsportraPlayer[], EsportraPlayer[]] = [[], []];
    try {
      pkg = await this.prepare(matchId);
      players = pkg.lineups;
    } catch (error) {
      this.ctx.log(`Esportra package not loaded · ${(error as Error).message}`);
    }
    if (!players[0].length && !players[1].length) {
      try {
        const roster = await account.roster(matchId);
        const names = (t: { players: Array<{ displayName: string }>; lineup?: unknown }) => (readLineup(t.lineup).length ? readLineup(t.lineup) : t.players.slice(0, 5).map((p) => ({ name: String(p.displayName).slice(0, 40), gameId: '' })));
        players = [names(roster.team1), names(roster.team2)];
      } catch {
        // The lineup is a convenience; the match works without it.
      }
    }
    const lineups: [string[], string[]] | null = players[0].length || players[1].length ? [players[0].map((p) => p.name), players[1].map((p) => p.name)] : null;
    const data = this.ctx.store.data;
    const code = `E${matchId.replace(/-/g, '').slice(0, 7).toUpperCase()}`;
    const teams = [
      { name: found.teamA, tag: found.tagA || tagFor(found.teamA), color: COLORS[0]!, logo: found.logoA ?? '' },
      { name: found.teamB, tag: found.tagB || tagFor(found.teamB), color: COLORS[1]!, logo: found.logoB ?? '' },
    ] as [Team, Team];
    const source: NonNullable<Match['source']> = { matchId, tournamentId: found.tournamentId, tournament: found.tournament, scheduledAt: found.scheduledAt, lineups, teams: [found.teamA, found.teamB] };
    const existing = data.matches.find((m) => m.source?.matchId === matchId);
    if (existing) {
      // The tournament may have changed names, logos or best-of; the producer's talent and sponsors are kept.
      Object.assign(existing, { title: `${found.teamA} vs ${found.teamB}`, teams, bestOf: found.bestOf as 1 | 3 | 5, source: { ...existing.source, ...source } });
      if (!existing.finishedAt) {
        existing.players = [EsportraMatches.fillLineup(existing.players[0], players[0]), EsportraMatches.fillLineup(existing.players[1], players[1])];
        linkMatch(existing, this.ctx.library());
      }
      data.selectedMatchId = existing.id;
    } else {
      const id = randomUUID();
      const lineup = [EsportraMatches.fillLineup([], players[0]), EsportraMatches.fillLineup([], players[1])] as Match['players'];
      const carried = this.ctx.carryOver(found.tournamentId, found.tournament);
      const match: Match = { id, code, kind: 'esportra', title: `${found.teamA} vs ${found.teamB}`, bestOf: found.bestOf as 1 | 3 | 5, teams, createdAt: this.ctx.now(), source, game: 'valorant', players: lineup, ...carried };
      linkMatch(match, this.ctx.library());
      data.matches = [match, ...data.matches].slice(0, 50);
      data.selectedMatchId = id;
    }
    this.ctx.save();
    await this.ctx.syncEngine();
    if (pkg) await this.ctx.applyPackage(pkg).catch((e) => this.ctx.log(`Esportra package not applied · ${(e as Error).message}`));
    this.ctx.log(`Match from Esportra · ${found.teamA} vs ${found.teamB}`);
  }
}
