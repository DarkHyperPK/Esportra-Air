// Editors for Teams/Players: one team (logo, name, tag, colour) and one player (photo, names, Riot ID,
// role, team). Saving updates every match that follows them.
import { useState } from 'react';
import type { LibPlayer, LibTeam, Snapshot } from '../../shared/api.ts';
import { gameOf, playerRoles } from '../../shared/games.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { EditorDrawer } from './Editors.tsx';
import { ImagePick } from './MatchEditors.tsx';

export function LibTeamEditor({ s, run, team, close, onSaved }: { s: Snapshot; run: Run; team: LibTeam | null; close: () => void; onSaved?: (name: string) => void }) {
  const [d, setD] = useState<Partial<LibTeam>>(team ?? { name: '', tag: '', color: '#22d3ee', logo: '' });
  const save = async () => {
    if (await run(() => air.saveTeam(d))) {
      onSaved?.(d.name ?? '');
      close();
    }
  };
  return (
    <EditorDrawer
      title={team ? team.name : 'Add a team'} close={close}
      footer={<><span /><span className="row-gap"><button className="btn quiet" onClick={close}>Cancel</button><button className="btn primary" disabled={!d.name?.trim()} onClick={() => void save()}>Save</button></span></>}
    >
      <div className="row-gap" style={{ gap: 18, alignItems: 'flex-end' }}>
        <ImagePick s={s} value={d.logo ?? ''} size={88} label={`logo of ${d.name || 'this team'}`} onChange={(logo) => setD({ ...d, logo })} fallback="Logo" />
        <span className="faint t-xs">Square PNG or SVG. It shows on the scorebug, player cards and full-screen graphics.</span>
      </div>
      <div className="grid2">
        <label className="field" style={{ gridColumn: '1 / -1' }}><span>Name</span><input value={d.name ?? ''} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={40} autoFocus={!team} /></label>
        <label className="field"><span>Tag</span><input value={d.tag ?? ''} onChange={(e) => setD({ ...d, tag: e.target.value.toUpperCase() })} maxLength={5} placeholder="Made from the name" /></label>
        <label className="field"><span>Colour</span><span className="row-gap"><input type="color" className="swatch" aria-label="Team colour" value={d.color ?? '#22d3ee'} onChange={(e) => setD({ ...d, color: e.target.value })} /><span className="mono t-xs">{(d.color ?? '').toUpperCase()}</span></span></label>
      </div>
      {team && <span className="faint t-xs">Matches that play this team update too.</span>}
    </EditorDrawer>
  );
}

export function LibPlayerEditor({ s, run, player, teamId, close }: { s: Snapshot; run: Run; player: LibPlayer | null; teamId?: string | null; close: () => void }) {
  const [d, setD] = useState<Partial<LibPlayer>>(player ?? { name: '', realName: '', gameId: '', photo: '', role: '', teamId: teamId ?? null });
  const id = gameOf(s.game?.id ?? 'valorant')?.identity;
  const lobby = s.game?.shape === 'lobby';
  const save = async () => { if (await run(() => air.savePlayer(d))) close(); };
  return (
    <EditorDrawer
      title={player ? player.name : 'Add a player'} close={close}
      footer={<>
        {player ? <button className="btn quiet danger" onClick={async () => { if (await run(() => air.removePlayer(player.id))) close(); }}>Delete player</button> : <span />}
        <span className="row-gap"><button className="btn quiet" onClick={close}>Cancel</button><button className="btn primary" disabled={!d.name?.trim()} onClick={() => void save()}>Save</button></span>
      </>}
    >
      <div className="row-gap" style={{ gap: 16 }}>
        <ImagePick s={s} value={d.photo ?? ''} size={88} round label={`photo of ${d.name || 'this player'}`} onChange={(photo) => setD({ ...d, photo })} fallback="Photo" />
        <span className="faint t-xs">Shows on player cards and lower thirds.</span>
      </div>
      <div className="grid2">
        <label className="field"><span>Name on air</span><input value={d.name ?? ''} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={32} autoFocus={!player} /></label>
        <label className="field"><span>Full name</span><input value={d.realName ?? ''} onChange={(e) => setD({ ...d, realName: e.target.value })} maxLength={60} /></label>
        {id && <label className="field"><span>{id.label}</span><input className="mono" value={d.gameId ?? ''} onChange={(e) => setD({ ...d, gameId: e.target.value })} placeholder={id.placeholder} spellCheck={false} /></label>}
        {lobby && <label className="field"><span>Character ID (UID)</span><input className="mono" inputMode="numeric" value={d.uid ?? ''} onChange={(e) => setD({ ...d, uid: e.target.value.replace(/[^\d]/g, '').slice(0, 20) })} placeholder="Digits, as the game shows them" spellCheck={false} aria-label="UID" /></label>}
        <label className="field"><span>Role</span>
          <select value={d.role ?? ''} onChange={(e) => setD({ ...d, role: e.target.value })}>{playerRoles(s.game?.id).map((r) => <option key={r} value={r}>{r || 'No role'}</option>)}</select>
        </label>
        <label className="field" style={{ gridColumn: '1 / -1' }}><span>Team</span>
          <select value={d.teamId ?? ''} onChange={(e) => setD({ ...d, teamId: e.target.value || null })}>
            <option value="">No team</option>
            {s.library.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </div>
      {lobby && <span className="faint t-xs">The UID is what places this player in the observer’s data: it is the game’s Character ID. A typo here is the one that matters most.</span>}
      {id && <span className="faint t-xs">{id.help}</span>}
    </EditorDrawer>
  );
}
