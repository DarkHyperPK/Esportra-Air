// Live › Game data for a PUBG MOBILE lobby (24 Nov): connect Air to the observer PC's PCOB API (its address on
// this PC or the local network, and the consent tick every time), see whether a game is being read, and pair any
// PCOB team slot Air couldn't match by name or players. Results and every player's numbers are then saved by
// themselves when a match ends (src/main/br-live.ts); typing in Results stays as the fallback.
import { useEffect, useState } from 'react';
import type { Lobby, Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { RosterCheck } from './br-prep/RosterCheck.tsx';

const STATE: Record<Snapshot['pcob']['state'], [string, string]> = {
  off: ['Off', 'Results are typed in Results.'],
  connecting: ['Connecting', 'Waiting for the observer PC to answer.'],
  waiting: ['Connected', 'PCOB answers. Waiting for a game to start.'],
  live: ['Live', 'Reading the game: points, alive and knocked, eliminations.'],
  error: ['No answer', 'Check the address, that PCOB is running with API Enable on, and that launch.bat is open.'],
};

export function pcobLabel(s: Snapshot) { return STATE[s.pcob.state][0]; }

export function PcobPanel({ s, run, l, close }: { s: Snapshot; run: Run; l: Lobby; close: () => void }) {
  const p = s.pcob;
  const [host, setHost] = useState(p.host);
  const [consent, setConsent] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const on = p.state !== 'off';
  const ago = p.lastAt ? Math.max(0, Math.round((Date.now() - p.lastAt) / 1000)) : null;
  const unpaired = p.slots.filter((x) => !x.seat);
  const team = (id: string | null) => l.teams.find((t) => t.id === id)?.name ?? '';
  return (
    <div className="scrim right" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="editor match-drawer" role="dialog" aria-modal="true" aria-label="Game data">
        <header><h2 className="title-md">Game data · PUBG MOBILE observer</h2><button className="btn quiet small" onClick={close}>Esc</button></header>
        <div className="editor-body stack g-3">
          <section className={`card body-pad stack g-2 pcob-state ${p.state}`}>
            <div className="between"><b>{STATE[p.state][0]}{p.game ? ` · match ${p.game}` : ''}</b>{ago !== null && on && <span className="faint t-xs">last data {ago} s ago</span>}</div>
            <span className="muted t-sm">{p.error && p.state === 'error' ? `${p.error}. ` : ''}{STATE[p.state][1]}</span>
            {p.saved && <span className="t-sm">Match {p.saved.game} saved from the game at {new Date(p.saved.at).toLocaleTimeString('en-GB')}: places, kills and every player&rsquo;s numbers.</span>}
          </section>
          <RosterCheck s={s} run={run} l={l} />
          {!on ? (
            <section className="stack g-2">
              <label className="stack g-1"><span className="cap">Observer PC running PCOB</span>
                <input className="cell mono" aria-label="Observer PC address" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.20 or 127.0.0.1" spellCheck={false} /></label>
              <span className="faint t-xs">On that PC, turn on API Enable in PCOB and keep <span className="mono">launch.bat</span> running. Air reads port 10086 unless you add another (host:port). Only addresses on your network.</span>
              <label className="row g-2 t-sm"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Let Air read game data from this observer PC for {l.title}</label>
              <div><button className="btn primary" disabled={!consent || !host.trim()} onClick={() => void run(() => air.pcobConnect(host, consent))}>Connect</button></div>
            </section>
          ) : (
            <div><button className="btn" onClick={() => void run(() => air.pcobDisconnect())}>Disconnect</button></div>
          )}
          <RecordPcob s={s} run={run} />
          {p.slots.length > 0 && (
            <section className="stack g-2">
              <div className="between"><b className="t-sm">Team slots</b><span className={`t-xs ${unpaired.length ? 'warn-text' : 'faint'}`}>{unpaired.length ? `${unpaired.length} not paired: their points don't count until you pair them` : 'Every PCOB team is paired'}</span></div>
              <div className="pcob-slots" role="table" aria-label="Team slots">
                {p.slots.map((x) => (
                  <div key={x.teamId} className={`pcob-slot ${x.seat ? '' : 'open'}`} role="row">
                    <span className="mono faint" role="cell">#{x.teamId}</span>
                    <span role="cell"><b>{x.name}</b><small className="faint"> {x.players.slice(0, 4).join(' · ')}</small></span>
                    <select className="cell" role="cell" aria-label={`Lobby team for PCOB team ${x.teamId}`} value={x.manual ? x.seat ?? '' : ''} onChange={(e) => void run(() => air.pcobSeat(l.id, x.teamId, e.target.value || null))}>
                      <option value="">{x.seat && !x.manual ? `Auto · ${team(x.seat)}` : 'Choose a team'}</option>
                      {l.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function size(bytes: number) { return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`; }

/** Record PCOB (27 Nov): the raw answers go to a file on this PC, to check the observer API against real games. */
function RecordPcob({ s, run }: { s: Snapshot; run: Run }) {
  const r = s.pcobRecording;
  const connected = s.pcob.state !== 'off';
  const name = r.file ? r.file.split(/[\\/]/).pop() : null;
  return (
    <section className="card body-pad stack g-2" aria-label="Record game data">
      <label className="row g-2 t-sm"><input type="checkbox" checked={r.on} disabled={!r.on && !connected} onChange={(e) => void run(() => air.pcobRecord(e.target.checked))} /> <b>Record game data</b></label>
      <span className="faint t-xs">Saves everything PCOB sends to a file on this PC (Documents/Esportra Air recordings). Use it in a scrim: play one game to the winner, one remake, and leave it running a few minutes after the game ends. Nothing leaves this PC.</span>
      {!connected && !r.on && <span className="faint t-xs">Connect to the observer PC first.</span>}
      {r.stopped && !r.on && <span className="warn-text t-xs">Recording stopped: {r.stopped}</span>}
      {name && (
        <div className="between">
          <span className="t-sm"><span className="mono">{name}</span> · {size(r.bytes)}{r.on ? ' · recording' : ''}</span>
          <button className="btn small" onClick={() => void run(() => air.pcobShowRecording())}>Show in folder</button>
        </div>
      )}
    </section>
  );
}
