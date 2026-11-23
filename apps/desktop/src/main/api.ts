// Dispatches interface calls to the production model. Arguments are validated in Production.
import type { ApiMethod, Snapshot } from '../shared/api.ts';
import type { Production } from './production.ts';
import type { EventPatch, SponsorInput, TalentInput } from '../shared/model.ts';
import type { GameId, Profile } from '../shared/games.ts';
import type { ObsLink } from './obs.ts';
import type { Secrets } from '../../../../packages/capture/src/secrets.ts';

export interface ApiContext {
  production: Production;
  obs: ObsLink;
  secrets: Secrets;
  copy: (text: string) => void;
  /** Saves the manual as a PDF where the producer chooses (the app), or next to the dev data (dev host). */
  saveManualPdf?: () => Promise<string | null>;
  pickVideo?: () => Promise<string | null>;
  /** A still picture of an overlay preview page, for lists (see thumbnails.ts). */
  thumbnail?: (url: string, key: string) => Promise<string | null>;
}

export async function dispatch(ctx: ApiContext, method: ApiMethod, args: unknown[]): Promise<Snapshot | string | null | void | { id: string; name: string; url: string } | unknown[] | Record<string, unknown>> {
  const p = ctx.production;
  const a = args as any[];
  switch (method) {
    case 'snapshot': break;
    case 'createQuickMatch': await p.createQuickMatch(a[0]); break;
    case 'selectMatch': await p.selectMatch(String(a[0])); break;
    case 'librarySeed': await p.librarySeed(); break;
    case 'libraryPlay': await p.libraryPlay(a[0] === true); break;
    case 'artDownload': {
      await p.art.download();
      const a = p.art.status;
      const missing = a.total - a.have - a.unavailable.length;
      // The button says how it went, not only the check: nothing happening looked like a broken button.
      if (missing > 0) throw new Error(`${missing} picture${missing === 1 ? ' is' : 's are'} still missing. ${a.lastError ?? 'Riot’s picture server could not be reached.'}`);
      break;
    }
    case 'eventLicence': await p.eventLicence(String(a[0]), String(a[1]), a[2] && typeof a[2] === 'object' ? a[2] : {}); break;
    case 'packDownload': await p.packDownload(String(a[0])); break;
    case 'packAssets': return p.packAssets(String(a[0]));
    case 'lobbyCreate': await p.lobbies.create((a[0] ?? {}) as Parameters<typeof p.lobbies.create>[0]); break;
    case 'lobbyUpdate': p.lobbies.update(String(a[0]), (a[1] ?? {}) as Record<string, unknown>); break;
    case 'lobbyTeams': p.lobbies.setTeams(String(a[0]), a[1]); break;
    case 'lobbyResult': p.lobbies.setResult(String(a[0]), Number(a[1]), a[2]); break;
    case 'lobbyClearResult': p.lobbies.clearResult(String(a[0]), Number(a[1])); break;
    case 'lobbySelect': await p.lobbies.select(a[0] === null ? null : String(a[0])); break;
    case 'lobbyDelete': p.lobbies.remove(String(a[0])); break;
    case 'lobbyLook': p.lobbyLook(String(a[0]), a[1]); break;
    case 'lobbyShow': p.lobbyShow(String(a[0]), a[1]); break;
    case 'pcobConnect': p.pcobConnect(a[0], a[1]); break;
    case 'pcobDisconnect': p.pcobDisconnect(); break;
    case 'pcobSeat': p.pcobSeat(String(a[0]), a[1], a[2]); break;
    case 'lobbyPreview': return p.lobbyPreview(String(a[0]), a[1]);
    case 'lobbyTake': await p.lobbyTake(String(a[0]), a[1] === null ? null : String(a[1])); break;
    case 'autopilotRestart': p.autopilotRestart(); break;
    case 'recoveryDismiss': p.dismissRecovery(); break;
    case 'rehearsalStart': await p.rehearsal.start(a[0] && typeof a[0] === 'object' ? a[0] : {}); break;
    case 'rehearsalStop': p.rehearsal.stop(); break;
    case 'rehearsalTake': await p.rehearsal.take(); break;
    case 'rehearsalShow': await p.rehearsal.show(a[0] === null || a[0] === undefined ? null : String(a[0])); break;
    case 'createMatch': await p.createMatch(a[0]); break;
    case 'uploadImage': return p.uploadImage(String(a[0]));
    case 'updateMatch': await p.updateMatch(String(a[0]), a[1] ?? {}); break;
    case 'setKey': await p.setKey(String(a[0]), a[1] === null ? null : String(a[1]), a[2] === true); break;
    case 'resetKeys': await p.resetKeys(); break;
    case 'setMoments': await p.setMoments(a[0] as string[]); break;
    case 'setGlobalKeys': p.setGlobalKeys(a[0] === true); break;
    case 'holdGlobalKeys': p.holdGlobalKeys(a[0] === true); break;
    case 'saveManualPdf': return ctx.saveManualPdf ? ctx.saveManualPdf() : null;
    case 'pickVideo': return ctx.pickVideo ? ctx.pickVideo() : null;
    case 'thumbnail': return ctx.thumbnail ? ctx.thumbnail(String(a[0] ?? ''), String(a[1] ?? '')) : null;
    case 'chooseGame': await p.chooseGame(String(a[0]) as GameId); break;
    case 'chooseProfile': await p.chooseProfile(String(a[0]) as Profile); break;
    case 'finishOnboarding': await p.finishOnboarding(); break;
    case 'restartOnboarding': await p.restartOnboarding(); break;
    case 'createEvent': await p.createEvent(String(a[0] ?? '')); break;
    case 'saveTeam': await p.saveTeam(a[0] ?? {}); break;
    case 'removeTeam': await p.removeTeam(String(a[0] ?? '')); break;
    case 'savePlayer': await p.savePlayer(a[0] ?? {}); break;
    case 'removePlayer': await p.removePlayer(String(a[0] ?? '')); break;
    case 'setMatchTeam': await p.setMatchTeam(String(a[0] ?? ''), Number(a[1]), String(a[2] ?? '')); break;
    case 'setStarters': await p.setStarters(String(a[0] ?? ''), Number(a[1]), Array.isArray(a[2]) ? a[2].map(String) : []); break;
    case 'deleteEvent': await p.deleteEvent(String(a[0] ?? '')); break;
    case 'markFinished': await p.markFinished(String(a[0] ?? ''), a[1] === true); break;
    case 'matchDataSave': await p.matchDataSave(a[0]); break;
    case 'vetoStep': await p.vetoStep(a[0] ?? {}); break;
    case 'vetoUndo': await p.vetoUndo(); break;
    case 'vetoReset': await p.vetoReset(); break;
    case 'esportraBracketRefresh': await p.esportraBracketRefresh(); break;
    case 'esportraLineupRefresh': await p.esportraLineupRefresh(); break;
    case 'showTemplateApply': await p.showTemplateApply(String(a[0] ?? '')); break;
    case 'showTemplateSave': p.showTemplateSave(a[0] ?? {}); break;
    case 'showTemplateRename': p.showTemplateRename(String(a[0] ?? ''), a[1]); break;
    case 'showTemplateDuplicate': p.showTemplateDuplicate(String(a[0] ?? '')); break;
    case 'showTemplateDelete': p.showTemplateDelete(String(a[0] ?? '')); break;
    case 'vetoFirst': await p.vetoFirst(a[0]); break;
    case 'vetoToss': await p.vetoToss(); break;
    case 'vetoEdit': await p.vetoEdit(Number(a[0]), a[1] ?? {}); break;
    case 'eventDataSave': await p.eventDataSave(String(a[0] ?? ''), a[1]); break;
    case 'playerPrepSave': await p.playerPrepSave(String(a[0] ?? ''), a[1]); break;
    case 'mapStoppedResolve': {
      const c = String(a[0] ?? '');
      if (c !== 'team0' && c !== 'team1' && c !== 'remade' && c !== 'ignore') throw new Error('Choose what the map was.');
      await p.mapStoppedResolve(c);
      break;
    }
    case 'deleteMatch': await p.deleteMatch(String(a[0] ?? '')); break;
    case 'updateEvent': await p.updateEvent(String(a[0]), (a[1] ?? {}) as EventPatch); break;
    case 'brandSave': await p.brandSave(String(a[0]), a[1] ?? {}); break;
    case 'templateSave': await p.templateSave(a[0]); break;
    case 'templateDelete': await p.templateDelete(String(a[0])); break;
    case 'ownSave': await p.ownSave(a[0]); break;
    case 'ownDelete': await p.ownDelete(String(a[0])); break;
    case 'ownUse': p.ownUse(String(a[0])); await p.syncEngine(); break;
    case 'uploadArtwork': return p.uploadArtwork(String(a[0]));
    case 'uploadFont': return p.uploadFont(String(a[0]), String(a[1] ?? ''));
    case 'saveTalent': await p.saveTalent(String(a[0]), (a[1] ?? {}) as TalentInput); break;
    case 'removeTalent': await p.removeTalent(String(a[0]), String(a[1])); break;
    case 'renewTalentLink': await p.renewTalentLink(String(a[0]), String(a[1])); break;
    case 'sponsorSpaceSet': await p.sponsorSpaceSet(String(a[0]), String(a[1]) as never, a[2] === null || a[2] === undefined ? null : String(a[2])); break;
    case 'matchSpaceSet': await p.matchSpaceSet(String(a[0]) as never, a[1] === 'event' || a[1] === undefined ? undefined : a[1] === null ? null : String(a[1])); break;
    case 'saveSponsor': await p.saveSponsor(String(a[0]), (a[1] ?? {}) as SponsorInput); break;
    case 'removeSponsor': await p.removeSponsor(String(a[0]), String(a[1])); break;
    case 'updateSetup': await p.updateSetup(a[0] ?? {}); break;
    case 'connectObs': {
      const { host, port, password } = a[0] ?? {};
      await ctx.obs.connect(String(host), Number(port), String(password ?? ''));
      ctx.secrets.set('obsPassword', password ? String(password) : null);
      await p.updateSetup({ obs: { ...p.setup.obs, host: String(host), port: Number(port) } });
      break;
    }
    case 'disconnectObs': await ctx.obs.disconnect(); break;
    case 'setLayer': await p.setLayer(String(a[0]), a[1]); break;
    case 'toast': await p.toast(String(a[0])); break;
    case 'poll': await p.poll(a[0] ?? null); break;
    case 'stingerPlay': await p.stingerPlay(); break;
    case 'lowerThird': await p.lowerThird(a[0] ?? null); break;
    case 'autopilotStart': p.autopilotStart(); break;
    case 'autopilotStop': p.autopilotStop(); break;
    case 'autopilotHold': p.autopilotHold(); break;
    case 'autopilotSkip': p.autopilotSkip(); break;
    case 'autopilotTake': await p.autopilotTake(); break;
    case 'autopilotResume': await p.autopilotResume(); break;
    case 'rundownSave': p.rundownSave(a[0]); break;
    case 'rundownRemove': p.rundownRemove(String(a[0])); break;
    case 'rundownEnable': p.rundownEnable(String(a[0]), a[1] === true); break;
    case 'rundownMove': p.rundownMove(String(a[0]), Number(a[1])); break;
    case 'replay': await p.saveReplay(); break;
    case 'cueMode': p.setCueMode(a[0] === true); break;
    case 'cueTake': await p.takeCue(a[0] === 'cut' || a[0] === 'stinger' ? a[0] : 'take'); break;
    case 'cueClear': p.clearCue(); break;
    case 'rundownStartFrom': p.rundownStartFrom(a[0]); break;
    case 'setControl': await p.setControl(a[0]); break;
    case 'companionRenewKey': p.companionRenewKey(); break;
    case 'useSlotSource': await p.useSlotSource(a[0], String(a[1])); break;
    case 'monitor': p.setMonitoring(a[0] === true); return;
    case 'installGraphics': await p.installGraphics(); break;
    case 'startCapture':
      if (a[0]?.consent !== true) throw new Error('Read and accept the capture notice first.');
      p.startCapture();
      break;
    case 'stopCapture': p.stopCapture(); break;
    case 'testRound': await p.testRound(a[0] === 'stop' ? 'stop' : a[0] === 'seek' ? 'seek' : 'start', a[1] ?? {}); break;
    case 'setMode': await p.setMode(a[0]); break;
    case 'joinSet': await p.joinSet(a[0] === true); break;
    case 'joinRotate': await p.joinRotate(); break;
    case 'joinUseSource': await p.joinUseSource(String(a[0] ?? '')); break;
    case 'linkConnect': await p.linkConnect(a[0] ?? {}); break;
    case 'linkDisconnect': p.linkDisconnect(); break;
    case 'linkRetry': p.linkRetry(); break;
    case 'esportraSignIn': await p.esportraSignIn(String(a[0] ?? ''), String(a[1] ?? '')); break;
    case 'esportraSignOut': await p.esportraSignOut(); break;
    case 'esportraRefresh': await p.esportraRefresh(); break;
    case 'esportraCheck': await p.esportraCheck(); break;
    case 'esportraRequestAccess': await p.esportraRequestAccess(a[0]); break;
    case 'esportraWithdrawRequest': await p.esportraWithdrawRequest(); break;
    case 'useEsportraMatch': await p.useEsportraMatch(String(a[0])); break;
    case 'vetoFollowEsportra': await p.vetoFollowEsportra(); break;
    case 'vetoOutboxResolve': await p.vetoOutboxResolve(a[0] === 'esportra' ? 'esportra' : 'air'); break;
    case 'vetoOutboxRetry': p.vetoOutboxRetry(); break;
    case 'vetoOutboxStart': p.vetoOutboxStart(); break;
    case 'recordShow': await p.recordShow(a[0] === 'series' ? 'series' : Number(a[0])); break;
    case 'recordRemove': await p.recordRemove(Number(a[0])); break;
    case 'closeMap': await p.closeMap(); break;
    case 'postOptions': await p.postOptions((a[0] ?? {}) as never); break;
    case 'esportraReview': await p.esportraReview(String(a[0]), a[1] === 'apply' ? 'apply' : 'reject'); break;
    case 'camsSet': await p.camsSet(a[0] ?? {}); break;
    case 'camCreate': await p.camCreate(Number(a[0]), Number(a[1])); break;
    case 'camRemove': await p.camRemove(Number(a[0]), Number(a[1])); break;
    case 'pause': {
      const o = (a[1] ?? {}) as { team?: unknown; seconds?: unknown };
      await p.pause(a[0] === 'technical' || a[0] === 'timeout' ? a[0] : null, { team: o.team === 0 || o.team === 1 ? o.team : null, seconds: Number.isFinite(Number(o.seconds)) ? Number(o.seconds) : null });
      break;
    }
    case 'casterStrap': await p.casterStrap(a[0] === true); break;
    case 'sponsorRead': await p.sponsorRead(typeof a[0] === 'string' ? a[0] : null); break;
    case 'correct': await p.correct(a[0]); break;
    case 'copy':
      if (typeof a[0] !== 'string' || a[0].length > 2000) throw new Error('Nothing to copy.');
      ctx.copy(a[0]);
      return;
    default: throw new Error('Unknown action.');
  }
  return p.snapshot();
}
