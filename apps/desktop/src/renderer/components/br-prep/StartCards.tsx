// The start screen of a lobby game's event with no lobbies yet (28 Nov, approved mock "Get this event ready"): how the
// teams, players and lobbies get into Air. "Use a stage from Esportra" reads a stage (EsportraStage.tsx, read only:
// nothing here sends anything to Esportra).
import type { Snapshot } from '../../../shared/api.ts';
import { gameOf } from '../../../shared/games.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';

/** The Esportra stage read is built (the card's button calls `onEsportra`). */
export const ESPORTRA_STAGES = true;

export function StartCards({ s, run, eventId, open, importList, onEsportra }: { s: Snapshot; run: Run; eventId: string; open: (lobbyId: string) => void; importList: () => void; onEsportra?: () => void }) {
  const game = gameOf(s.setup.game);
  const teams = s.library.teams.length;
  const make = (title: string) => run(async () => {
    const snap = await air.lobbyCreate({ eventId, game: s.setup.game!, title, games: 6 });
    const mine = snap.lobbies.filter((l) => l.eventId === eventId);
    const made = mine[mine.length - 1];
    if (made) open(made.id);
    return snap;
  });
  return (
    <section className="stack" style={{ gap: 18 }} aria-label="Get this event ready">
      <div><h2 className="title-lg">Get this event ready</h2><p className="muted">Pick how the teams, players and lobbies get into Air. You do this once, before the show.</p></div>
      <div className="pp-two">
        <section className={`card body-pad stack g-3 pp-start ${ESPORTRA_STAGES ? '' : 'off'}`} aria-label="Use a stage from Esportra" aria-disabled={!ESPORTRA_STAGES}>
          <span className="pill">{ESPORTRA_STAGES ? 'Fastest if the tournament is on Esportra' : 'Coming soon'}</span>
          <h3 className="title-md">Use a stage from Esportra</h3>
          <p className="muted">The tournament is already on Esportra. Pick its stage and Air takes what is there. Nothing to type.</p>
          <ul className="pp-list"><li>Teams and players (you add the game UIDs)</li><li>Groups, lobbies and the schedule</li><li>The points table</li></ul>
          <div><button className="btn primary" disabled={!ESPORTRA_STAGES} onClick={onEsportra}>Pick a stage from Esportra</button></div>
          <span className="faint t-xs">Read only. Results stay in Air.</span>
        </section>
        <section className="card body-pad stack g-3 pp-start" aria-label="Prepare it here">
          <span className="pill">For events that run outside Esportra</span>
          <h3 className="title-md">Prepare it here</h3>
          <p className="muted">Bring in what you already have, or build it in Air. Air checks it as it goes, so mistakes show up now and not on air.</p>
          <div className="pp-opt"><span><b>Paste or drop a list</b><br /><span className="muted t-sm">A sheet, a CSV or a registration export. Air finds the columns for you.</span></span><button className="btn primary" onClick={importList}>Choose</button></div>
          <div className="pp-opt"><span><b>Pick teams from Teams/Players</b><br /><span className="muted t-sm">{teams ? `Teams you already saved. ${teams} team${teams === 1 ? '' : 's'} saved.` : 'Nothing saved yet. Import a list first, or add teams in Teams/Players.'}</span></span><button className="btn" disabled={!teams} onClick={() => void make('Group A')}>Choose</button></div>
          <div className="pp-opt"><span><b>Start empty</b><br /><span className="muted t-sm">Add teams, players and lobbies one by one.</span></span><button className="btn" onClick={() => void make('Lobby')}>Choose</button></div>
        </section>
      </div>
      <div className="card body-pad stack g-2">
        <div className="row g-2" style={{ flexWrap: 'wrap' }}><b className="t-sm">Ready before the show:</b>
          {['Teams and players, each with their in-game UID', 'Groups and lobbies', 'Maps and start times', 'Points table'].map((x) => <span key={x} className="pp-chip partial">○ {x}</span>)}</div>
        <span className="faint t-xs">The observer client (PCOB) only checks this in a test game. It never builds the roster while you are on air. {game?.name}</span>
      </div>
    </section>
  );
}
