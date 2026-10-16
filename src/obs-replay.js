'use strict';
const CLIP = 'ESA_Replay_clip';

class OBSReplay {
  constructor(controller) {
    this.controller = controller;
    this.session = null;
    this.saving = false;
    this.generation = 0;
  }

  cancel() { this.generation += 1; this.session = null; }

  async play() {
    const controller = this.controller, obs = controller._obs;
    if (this.saving || this.session) return { ok: false, error: 'Replay is already being saved or played.' };
    this.saving = true;
    const generation = this.generation;
    try {
      const { outputActive } = await obs.call('GetReplayBufferStatus');
      if (!outputActive) return { ok: false, error: 'Start the replay buffer in OBS before saving a replay.' };
      const previousScene = controller.getTally().program;
      if (!previousScene || previousScene === 'ESA_Replay') return { ok: false, error: 'Choose a program scene before starting a replay.' };
      const { transitions } = await obs.call('GetSceneTransitionList');
      const stinger = transitions.find(item => item.transitionKind === 'obs_stinger_transition');
      if (!stinger) return { ok: false, error: 'Add a Stinger transition in OBS before starting a replay.' };
      const savedPath = await this.save();
      if (!savedPath) return { ok: false, error: 'OBS did not save a replay within five seconds.' };
      if (generation !== this.generation || controller.getTally().program !== previousScene) return { ok: false, error: 'Replay cancelled because production changed during the save.' };
      await this.prepareClip(savedPath);
      if (generation !== this.generation || controller.getTally().program !== previousScene) return { ok: false, error: 'Replay cancelled because production changed while preparing the clip.' };
      const result = await controller.take('ESA_Replay', { mode: 'stinger', name: stinger.transitionName });
      if (!result.ok) return result;
      this.session = { previousScene, generation, transition: { mode: 'stinger', name: stinger.transitionName } };
      await obs.call('TriggerMediaInputAction', { inputName: CLIP, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
      return { ok: true };
    } catch (_) {
      this.session = null;
      return { ok: false, error: 'Could not prepare replay. Check the Replay scene and media source in OBS.' };
    } finally { this.saving = false; }
  }

  async prepareClip(savedPath) {
    const obs = this.controller._obs;
    const { inputs } = await obs.call('GetInputList');
    const input = inputs.find(item => item.inputName === CLIP);
    const settings = { is_local_file: true, local_file: savedPath, looping: false, restart_on_activate: false, close_when_inactive: false };
    if (!input) {
      await obs.call('CreateInput', { sceneName: 'ESA_Replay', inputName: CLIP, inputKind: 'ffmpeg_source', inputSettings: settings, sceneItemEnabled: true });
      return;
    }
    const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: 'ESA_Replay' });
    const item = sceneItems.find(item => item.sourceName === CLIP);
    if (input.inputKind !== 'ffmpeg_source' || !item) throw new Error('Replay source name belongs to another input.');
    await obs.call('SetInputSettings', { inputName: CLIP, inputSettings: settings, overlay: true });
    await obs.call('SetSceneItemEnabled', { sceneName: 'ESA_Replay', sceneItemId: item.sceneItemId, sceneItemEnabled: true });
  }

  save() {
    const obs = this.controller._obs;
    return new Promise(resolve => {
      const finish = path => { clearTimeout(timer); obs.removeListener('ReplayBufferSaved', saved); resolve(path); };
      const saved = ({ savedReplayPath }) => finish(typeof savedReplayPath === 'string' && savedReplayPath.length > 0 ? savedReplayPath : null);
      const timer = setTimeout(() => finish(null), 5000);
      obs.once('ReplayBufferSaved', saved);
      obs.call('SaveReplayBuffer').catch(() => finish(null));
    });
  }

  async ended(inputName) {
    const session = this.session;
    if (inputName !== CLIP || !session) return;
    this.session = null;
    if (session.generation !== this.generation || this.controller.getTally().program !== 'ESA_Replay') return;
    if (this.controller.canReplayReturn && !this.controller.canReplayReturn()) { this.controller.emit('replay-error', { error: 'Replay finished during a pause. Return was skipped; choose Program manually after resuming.' }); return; }
    const result = await this.controller.take(session.previousScene, session.transition, { stillAllowed: () => !this.controller.canReplayReturn || this.controller.canReplayReturn() });
    if (!result.ok) this.controller.emit('replay-error', { error: 'Replay ended. Could not return to the previous scene; take it manually.' });
  }
}

module.exports = OBSReplay;
