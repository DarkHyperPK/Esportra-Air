// A lobby's Graphics tab (22 Nov): the battle royale HUD's layout (stills of the three, pick one), the strip's
// standings pop-up, and every full screen with Take / Clear on the lobby's room, its look and its OBS address.
// The pages read the lobby's own room, so the browser sources carry its code.
import { useState } from 'react';
import type { Lobby, LobbyLook, Snapshot } from '../../shared/api.ts';
import { GRAPHICS } from '../../shared/templates.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { StillPreview } from './Preview.tsx';
import { templatePreviewUrl } from './TemplateEditor.tsx';

const LAYOUTS: Array<[LobbyLook['hud'], string, string]> = [
  ['rail', 'Points rail', 'Every team down the right edge, under the minimap.'],
  ['grid', 'Points grid', 'Four columns of tiles, bottom right.'],
  ['strip', 'Top strip', 'The top three under the compass; the full table pops up on demand.'],
];
const SCREENS: Array<[string, string]> = [
  ['br-lobby', 'Waiting lobby'], ['br-today', "Today's matches"], ['br-rankings', 'Match rankings'], ['br-overall', 'Overall standings'],
  ['br-wwcd', 'Match winner'], ['br-mvp', 'MVP rankings'], ['br-champion', 'Champions'],
];

function Copy({ url, label }: { url: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button className="btn quiet small" title={url} aria-label={`Copy browser source for ${label}`} onClick={() => void air.copy(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => setDone(false))}>{done ? 'Copied' : 'Copy browser source'}</button>;
}

export function LobbyGraphics({ s, run, lobby }: { s: Snapshot; run: Run; lobby: Lobby }) {
  const look: LobbyLook = { hud: 'rail', popup: false, templates: {}, ...(lobby.look ?? {}) };
  const port = s.engine.port ?? 0;
  const page = (name: string, extra = '') => `http://127.0.0.1:${port}/overlays/${name}.html?match=${encodeURIComponent(lobby.code)}${extra}`;
  const onAir = s.selectedLobbyId === lobby.id ? s.lobbyOnAir : null;
  const pack = s.packs.find((p) => p.game === lobby.game);
  const licensed = !!s.events.find((e) => e.id === lobby.eventId)?.gameLicence?.[lobby.game];
  const looks = (graphic: string) => s.templates.filter((t) => t.graphic === graphic);
  const pickLook = (graphic: string, id: string) => void run(() => air.lobbyLook(lobby.id, { templates: { [graphic]: id } }));
  const LookSelect = ({ graphic }: { graphic: string }) => looks(graphic).length ? (
    <select className="cell" aria-label={`Look for ${GRAPHICS[graphic]?.title ?? graphic}`} value={look.templates[graphic] ?? ''} onChange={(e) => pickLook(graphic, e.target.value)}>
      <option value="">Standard look</option>
      {looks(graphic).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  ) : null;
  const take = (screen: string | null) => void run(() => air.lobbyTake(lobby.id, screen));

  return (
    <div className="stack" style={{ gap: 22 }}>
      {!licensed ? <p className="lbg-note warn t-sm">No game pictures yet: confirm the tournament licence for this event in Graphics studio › Game assets. Until then the graphics show text and colours only.</p>
        : pack && pack.have < pack.total ? <p className="lbg-note t-sm">Game pictures downloading · {pack.have} of {pack.total}{pack.waiting ? ` · ${pack.waiting}` : ''}</p> : null}
      {!lobby.teams.length && <p className="lbg-note warn t-sm">Add the lobby&rsquo;s teams first; the graphics show its teams and standings.</p>}

      <section className="stack g-2" aria-label="In-game HUD">
        <div className="between"><h2 className="title-sm">In-game HUD</h2><span className="row g-2"><LookSelect graphic="brhud" /><Copy url={page('br-hud')} label="the HUD" /></span></div>
        <p className="faint t-sm">Sits only where the observer client leaves the screen free: its killfeed, compass, minimap and player panels stay the game&rsquo;s own.</p>
        <div className="lbg-hud" role="radiogroup" aria-label="HUD layout">
          {LAYOUTS.map(([id, name, note]) => (
            <button key={id} role="radio" aria-checked={look.hud === id} className={`card lbg-card ${look.hud === id ? 'sel' : ''}`} onClick={() => void run(() => air.lobbyLook(lobby.id, { hud: id }))}>
              <StillPreview src={templatePreviewUrl(s, 'brhud', { mode: id })} label={name} stamp={`br-${id}`} />
              <b>{name}</b><span className="faint t-xs">{note}</span>
            </button>
          ))}
        </div>
        {look.hud === 'strip' && (
          <label className="row g-2 t-sm"><input type="checkbox" checked={look.popup} onChange={(e) => void run(() => air.lobbyLook(lobby.id, { popup: e.target.checked }))} /> Show the standings pop-up</label>
        )}
      </section>

      <section className="stack g-2" aria-label="Full screens">
        <div className="between"><h2 className="title-sm">Full screens</h2><span className="row g-2">{onAir && <button className="btn small" onClick={() => take(null)}>Clear</button>}<Copy url={page('fullscreen')} label="whichever full screen is on air" /></span></div>
        <p className="faint t-sm">Take puts one on the lobby&rsquo;s full-screen source; the browser source above shows whichever is on air, or copy one screen&rsquo;s own source below.</p>
        <div className="lbg-grid">
          {SCREENS.map(([id, name]) => {
            const live = onAir === id;
            return (
              <div key={id} className={`card lbg-card ${live ? 'live' : ''}`}>
                <StillPreview src={templatePreviewUrl(s, `${id}|full`)} label={name} stamp="br" />
                <div className="between"><b>{name}</b>{live && <span className="chip-mode on">On air</span>}</div>
                <div className="row g-2 lbg-acts">
                  <button className={`btn small ${live ? '' : 'primary'}`} disabled={!lobby.teams.length} onClick={() => take(live ? null : id)}>{live ? 'Clear' : 'Take'}</button>
                  <LookSelect graphic={`${id}|full`} />
                  <Copy url={page('fullscreen', `&only=${id}&style=full`)} label={name} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
