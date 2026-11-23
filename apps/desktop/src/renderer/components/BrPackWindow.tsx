// HUD library's pack window for a battle royale game (23 Nov): the same window as the Valorant pack (list on the
// left, a large preview, what it is on the right), choosing only. The HUD's layout is chosen here for the lobby on
// the graphics; full screens are put on air from Live.
import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { BR_THEME_NAME, BR_SCREENS, BR_SCREEN_NAME, BR_SCREEN_PHASE, BR_SCREEN_WHAT, HUD_LAYOUTS, HUD_LAYOUT_NAME, type BrScreen, type HudLayout } from '../../shared/br-screens.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { useEscape } from './Dialogs.tsx';
import { Preview, StillPreview } from './Preview.tsx';
import { templatePreviewUrl } from './TemplateEditor.tsx';

const LIST: Array<[string, string]> = [['brhud', 'In-game HUD'], ...BR_SCREENS.map((id): [string, string] => [id, BR_SCREEN_NAME[id]])];

export function BrPackWindow({ s, run, close }: { s: Snapshot; run: Run; close: () => void }) {
  const ref = useEscape(close);
  const lobby = s.lobbies.find((l) => l.id === s.selectedLobbyId) ?? null;
  const layout: HudLayout = lobby?.look?.hud ?? 'rail';
  const [selected, setSelected] = useState('brhud');
  const [view, setView] = useState<HudLayout>(layout);
  const hud = selected === 'brhud';
  const src = hud ? templatePreviewUrl(s, 'brhud', { mode: view }) : templatePreviewUrl(s, `${selected}|full`);
  return (
    <div className="scrim center" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="pack" role="dialog" aria-modal="true" aria-label={`${s.game?.pack ?? 'Battle royale'} pack`} ref={ref}>
        <header>
          <b>ESPORTRA HUD · {s.game?.name}</b><span className="muted t-sm">{LIST.length} graphics</span>
          <span className="spacer" />
          <button className="btn quiet small" onClick={close}>Esc · Close</button>
        </header>
        <div className="pack-body">
          <div className="pack-list">
            <div role="listbox" aria-label="Graphics">
              {LIST.map(([id, title]) => (
                <button key={id} role="option" aria-selected={selected === id} onClick={() => setSelected(id)}>
                  <span>{title}</span><span className="faint t-xs">{id === 'brhud' ? 'Over the game' : BR_SCREEN_PHASE[id as BrScreen] === 'pre' ? 'Before a match' : 'After a match'}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="pack-stage">
            {hud && (
              <div className="seg" role="tablist" aria-label="Layout">
                {HUD_LAYOUTS.map((id) => <button key={id} role="tab" aria-selected={view === id} aria-pressed={view === id} onClick={() => setView(id)}>{HUD_LAYOUT_NAME[id][0]}</button>)}
              </div>
            )}
            <Preview key={src} src={src} label={hud ? 'In-game HUD' : BR_SCREEN_NAME[selected as BrScreen]} />
            <span className="faint t-xs">Sample lobby with made-up teams. Kit pictures appear once the event&rsquo;s game licence is confirmed in Graphics studio › Game assets.</span>
          </div>
          <aside className="pack-details">
            <b className="title-sm">{hud ? 'In-game HUD' : BR_SCREEN_NAME[selected as BrScreen]}</b>
            <span className="muted t-sm">{hud ? 'Points for every team, alive and knocked marks, the match and map, and Team eliminated. It sits only where the observer client leaves the screen free.' : BR_SCREEN_WHAT[selected as BrScreen]}</span>
            {hud ? (
              <>
                <div className="stack g-2">
                  {HUD_LAYOUTS.map((id) => (
                    <button key={id} className={`card br-layout ${layout === id ? 'sel' : ''}`} aria-pressed={layout === id} disabled={!lobby} onClick={() => { setView(id); void run(() => air.lobbyLook(lobby!.id, { hud: id })); }}>
                      <StillPreview src={templatePreviewUrl(s, 'brhud', { mode: id })} label={HUD_LAYOUT_NAME[id][0]} stamp={`br-${id}`} />
                      <b>{HUD_LAYOUT_NAME[id][0]}{layout === id ? ' ✓' : ''}</b><span className="faint t-xs">{HUD_LAYOUT_NAME[id][1]}</span>
                    </button>
                  ))}
                </div>
                <span className="faint t-xs">{lobby ? `Used by ${lobby.title}.` : 'Choose a lobby in Events to set its layout.'}</span>
              </>
            ) : (
              <>
                <dl className="pack-facts">
                  <dt>When</dt><dd>{BR_SCREEN_PHASE[selected as BrScreen] === 'pre' ? 'Before a match' : 'After a match'}</dd>
                  <dt>In OBS</dt><dd>The full-screen source</dd>
                  <dt>With</dt><dd>{lobby ? lobby.title : 'Sample teams'}</dd>
                  <dt>Theme</dt><dd>{BR_THEME_NAME[lobby?.look?.theme?.preset ?? 'sky']}{lobby?.look?.theme?.colors && Object.keys(lobby.look.theme.colors).length ? ' · own colours' : ''}</dd>
                </dl>
                <span className="spacer" />
                <span className="faint t-xs">Put it on air from Live. Colours, background, emblem and props: Graphics studio › Event theme.</span>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
