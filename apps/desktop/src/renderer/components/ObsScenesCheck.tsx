// "Add Air's scenes to OBS" for a battle royale lobby (28 Nov): a switch that builds Break, Gameplay and Full screen
// from the selected lobby's pages, and the check that says whether they are all still there. OBS stays optional:
// without it the browser sources (Live › Sources) go into the crew's own scenes. Air only adds and reads; it never
// switches a scene, starts a stream or removes anything.
import { useState } from 'react';
import type { Lobby, Snapshot } from '../../shared/api.ts';
import { LOBBY_SCENE_KEYS, SCENES, shortName } from '../../shared/scenes.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { Switch } from './Editors.tsx';

export function ObsScenesCheck({ s, run, lobby, connect }: { s: Snapshot; run: Run; lobby: Lobby; connect?: () => void }) {
  const connected = s.obs.state === 'connected';
  const names = LOBBY_SCENE_KEYS.map((k) => shortName(SCENES[k].name)).join(', ');
  // On when the scenes are already in OBS; turning it on adds them. Turning it off leaves them (Air never deletes).
  const [wanted, setWanted] = useState(false);
  const on = wanted || (connected && s.obs.installed);
  const drift = s.obs.missingSources.map(shortName);
  const missing = s.obs.missingScenes.map(shortName);
  const add = (v: boolean) => {
    setWanted(v);
    if (v) void run(async () => { await air.installGraphics(); });
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="between">
        <span><b>Add Air’s scenes to OBS</b> <span className="faint t-xs">optional</span></span>
        <Switch on={on} label="Add Air’s scenes to OBS" disabled={!connected} onChange={add} />
      </div>
      {!connected && <p className="muted t-sm">OBS is not connected. Use the browser sources below in your own scenes, or connect OBS in Settings.{connect && <> <button className="btn quiet small" onClick={connect}>Connect OBS</button></>}</p>}
      {connected && !s.obs.installed && !s.obs.installError && <p className="muted t-sm">Off: ESPORTRA · {names} are not all in OBS. Turn it on to add them for {lobby.title}. Your own scenes are not touched.</p>}
      {connected && s.obs.installed && <p className="muted t-sm"><span className="ok-text">✓</span> In OBS: ESPORTRA · {names}, pointing at {lobby.title}. Your own scenes are not touched, and Air never switches them.</p>}
      {connected && missing.length > 0 && <div className="notice warn t-sm" role="status">Not in OBS: {missing.join(', ')}.</div>}
      {connected && drift.length > 0 && <div className="notice warn t-sm" role="status">Removed or renamed in OBS since: {drift.join(', ')}.</div>}
      {s.obs.installError && <div className="notice bad t-sm" role="alert">{s.obs.installError}</div>}
      {connected && (s.obs.installed || missing.length > 0 || drift.length > 0) && (
        <div><button className="btn small" onClick={() => void run(async () => { await air.installGraphics(); })}>{s.obs.installed ? 'Rebuild scenes' : 'Add the missing scenes'}</button>
          <span className="faint t-xs" style={{ marginLeft: 8 }}>Rebuild after you choose another lobby: the pages follow it.</span></div>
      )}
    </div>
  );
}
