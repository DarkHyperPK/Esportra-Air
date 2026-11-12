// Go live (approved mock): one press that prepares everything, with consent and warnings in view.
// It sends My show to OBS, starts game data (only with the consent tick), and arms autopilot if
// chosen. It never starts the stream: the producer does that in OBS.
import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { SCENE_KEYS, SCENES, shortName } from '../../shared/scenes.ts';
import { air } from '../bridge.ts';
import { useEscape } from './Dialogs.tsx';
import { Switch } from './Editors.tsx';

type StepState = 'waiting' | 'working' | 'done' | 'skipped' | 'failed';
type Steps = { obs: StepState; data: StepState; autopilot: StepState };
const STREAMING = /Stop streaming and recording/;

export function GoLiveDialog({ s, close, done, connectObs }: { s: Snapshot; close: () => void; done: () => void; connectObs: () => void }) {
  const ref = useEscape(close);
  const [consent, setConsent] = useState(false);
  const usesAutopilot = s.control !== 'companion';
  const [autopilot, setAutopilot] = useState(!s.autopilotBlock);
  const [steps, setSteps] = useState<Steps>({ obs: 'waiting', data: 'waiting', autopilot: 'waiting' });
  const [notes, setNotes] = useState<Partial<Record<keyof Steps, string>>>({});
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const set = (k: keyof Steps, v: StepState, note?: string) => {
    setSteps((x) => ({ ...x, [k]: v }));
    if (note !== undefined) setNotes((n) => ({ ...n, [k]: note }));
  };
  const graphics = s.setup.screens.filter((x) => x.enabled && !x.hosted).length;
  const scenes = SCENE_KEYS.map((k) => shortName(SCENES[k].name)).join(', ');
  const warnings = s.checks.filter((c) => (c.health === 'warn' || c.health === 'bad') && !['obs', 'scenes', 'feed', 'esportra', 'sources'].includes(c.id));
  const obsReady = s.obs.state === 'connected';

  const go = async () => {
    setBusy(true);
    // 1. My show to OBS. While OBS streams, Air cannot rebuild (a reload would show on air); if the
    //    scenes are already there, the show goes on with them.
    set('obs', 'working');
    try {
      await air.installGraphics();
      set('obs', 'done', `In OBS as ESPORTRA · ${scenes}.`);
    } catch (e) {
      const message = (e as Error).message;
      if (STREAMING.test(message) && s.obs.installed) set('obs', 'done', 'Already in OBS. Changes to My show go in once you stop streaming.');
      else { set('obs', 'failed', message); setBusy(false); return; }
    }
    // 2. Game data, only with the producer's consent.
    if (!consent) set('data', 'skipped', 'Off. Start it from Capture when you are ready.');
    else if (s.feed.state === 'live' || s.feed.state === 'waiting') set('data', 'done', 'Already running.');
    else {
      set('data', 'working');
      try {
        await air.startCapture({ consent: true });
        set('data', 'done', 'Waiting for the game. Graphics update as soon as it sends data.');
      } catch (e) { set('data', 'failed', (e as Error).message); setBusy(false); return; }
    }
    // 3. Autopilot (not with Stream Deck / Companion only).
    if (!usesAutopilot) { setBusy(false); setFinished(true); return; }
    set('autopilot', 'working');
    try {
      if (autopilot) { await air.autopilotStart(); set('autopilot', 'done', 'Armed. It holds each step so you can stop it.'); }
      else { await air.autopilotStop(); set('autopilot', 'skipped', 'Off: you take every graphic yourself.'); }
    } catch (e) { set('autopilot', 'failed', (e as Error).message); }
    setBusy(false);
    setFinished(true);
  };

  const tick = (st: StepState, n: number) => <span className={`tick ${st}`} aria-label={st}>{st === 'done' ? '✓' : st === 'failed' ? '!' : st === 'skipped' ? '–' : n}</span>;
  return (
    <div className="scrim center" onClick={(e) => e.target === e.currentTarget && !busy && close()}>
      <div className="dialog golive" role="dialog" aria-modal="true" aria-label="Go live" ref={ref}>
        <div className="between"><h2 className="title-lg" style={{ margin: 0 }}>Go live</h2><span className="muted t-sm">{s.match?.title}</span></div>
        <ol className="steplist">
          <li>{tick(steps.obs, 1)}<span><b>Send {graphics} graphics to OBS</b><br /><span className="muted t-sm">{notes.obs ?? `ESPORTRA · ${scenes}. Your own scenes are not touched.`}</span>
            {!obsReady && <><br /><button className="btn small" style={{ marginTop: 6 }} onClick={connectObs}>Connect OBS first</button></>}</span></li>
          <li>{tick(steps.data, 2)}<span><b>Start game data</b><br />
            {steps.data === 'waiting'
              ? <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I allow Air to read the match on this PC{s.setup.profile === 'player-pcs' ? ' and the player PCs' : ''}. It stays on our network.</label>
              : <span className="muted t-sm">{notes.data}</span>}</span></li>
          {usesAutopilot && <li>{tick(steps.autopilot, 3)}<span><b>Arm autopilot</b><br />
            {steps.autopilot === 'waiting'
              ? <span className="row-gap t-sm muted"><Switch on={autopilot} label="Autopilot" disabled={!!s.autopilotBlock} onChange={setAutopilot} />{s.autopilotBlock ?? (autopilot ? 'On: graphics go up by themselves, each after a hold.' : 'Off: you take every graphic yourself.')}</span>
              : <span className="muted t-sm">{notes.autopilot}</span>}</span></li>}
        </ol>
        {warnings.length > 0 && !finished && (
          <div className="stack" style={{ gap: 6 }}>
            {warnings.map((w) => <div key={w.id} className="alert"><i className="dot warn" /><span><b>{w.title}.</b> {w.detail}</span></div>)}
            <span className="faint t-xs">Warnings never stop you.</span>
          </div>
        )}
        <div className="between">
          <span className="muted t-sm">{finished ? 'Now start your stream in OBS.' : 'When this is done, start your stream in OBS.'}</span>
          <span className="row-gap">
            {finished
              ? <button className="btn primary big" onClick={done}>Open Live</button>
              : <><button className="btn quiet" disabled={busy} onClick={close}>Cancel</button><button className="btn live big" disabled={busy || !obsReady} onClick={() => void go()}>{busy ? 'Going live…' : 'Go live'}</button></>}
          </span>
        </div>
      </div>
    </div>
  );
}
