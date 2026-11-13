// Devices (approved mock): every PC and camera the show depends on. Player PCs sit in their seats by
// the player id they send; each seat says how fresh that player's own data is. Game data on this PC
// is a tab of its own.
import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import type { SeatView } from '../../shared/devices.ts';
import { ROLE_NAME, cameraLinkUrl, onAir } from '../../shared/model.ts';
import { air } from '../bridge.ts';
import type { PageProps } from '../App.tsx';
import { CamerasPanel } from '../components/Cameras.tsx';
import { PageHeader } from '../components/Chrome.tsx';
import { cameraText } from '../components/Editors.tsx';
import { JoinPanel } from '../components/Join.tsx';
import { CaptureScreen } from './CaptureScreen.tsx';
import { Face } from './MatchWorkspace.tsx';

type Tab = 'checkin' | 'cameras' | 'data';
const age = (ms: number | null) => (ms === null ? '' : ms < 1000 ? 'now' : ms < 60_000 ? `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s` : `${Math.round(ms / 60_000)} min`);
const SEAT_TEXT: Record<SeatView['state'], string> = { live: '', quiet: 'Quiet', joined: 'Joined · no data yet', none: 'No player PC' };

function Seat({ s, seat }: { s: Snapshot; seat: SeatView }) {
  const health = seat.state === 'live' ? 'ok' : seat.state === 'none' ? 'off' : 'warn';
  return (
    <div className={`seat ${seat.state}`} title={seat.pc ? `${seat.pc}` : undefined}>
      <Face s={s} photo={seat.photo} name={seat.name || '?'} size={40} />
      <b>{seat.name || `Seat ${seat.index + 1}`}</b>
      <span className={`state ${health}`}><i className={`dot ${health}`} />{seat.state === 'live' ? age(seat.ageMs) : SEAT_TEXT[seat.state]}</span>
      {seat.pc && <span className="faint t-xs mono">{seat.pc}</span>}
    </div>
  );
}

function CheckIn({ s, run }: Pick<PageProps, 's' | 'run'>) {
  const d = s.devices;
  const usesPcs = s.setup.profile === 'player-pcs' || d.unseated.length > 0 || d.seats.some((x) => x.pc);
  const thisPc = s.feed.state === 'live' ? 'ok' : s.feed.state === 'waiting' ? 'warn' : 'off';
  return (
    <div className="side-grid">
      <div className="stack" style={{ gap: 24 }}>
        {usesPcs && (
          <section className="stack" style={{ gap: 10 }}>
            <div className="between"><h2 className="title-sm">Player PCs · {d.checkedIn} of {d.seats.length} checked in</h2><span className="faint t-xs">Each sends only that player’s own data</span></div>
            {d.seats.length === 0 ? <p className="muted t-sm">Choose a match to see its seats.</p> : (
              <>
                {[0, 1].map((t) => <div key={t} className="seats">{d.seats.filter((x) => x.team === t).map((x) => <Seat key={`${x.team}-${x.index}`} s={s} seat={x} />)}</div>)}
                {!d.fromGame && <p className="muted t-sm">Seats show the lineup until the game starts; each PC takes its seat as soon as the observer’s game lists the players.</p>}
              </>
            )}
            {d.unseated.map((u) => <div key={u.id} className="alert info"><span><b>{u.name}</b> · {u.detail}</span></div>)}
            <p className="faint t-xs">A player without a PC still plays on air: their health and abilities stay hidden, never shown out of date.</p>
          </section>
        )}
        <section className="stack" style={{ gap: 8 }}>
          <h2 className="title-sm">The match</h2>
          <div className="lst">
            <div className="li device-row"><i className={`dot ${thisPc}`} /><span><b>This PC</b><br /><span className="muted t-sm">{s.feed.state === 'off' ? 'Game data is off on this PC.' : s.feed.state === 'waiting' ? 'Waiting for the game.' : s.feed.state === 'live' ? `Game data · last update ${age(s.feed.ageMs)} ago` : 'Not available here.'}</span></span><span /></div>
            {d.observers.map((o) => (
              <div key={o.id} className="li device-row"><i className={`dot ${o.ageMs !== null && o.ageMs < 10_000 ? 'ok' : 'warn'}`} /><span><b>{o.name}</b><br /><span className="muted t-sm">Observer PC · {o.ageMs === null ? 'no data yet' : `last update ${age(o.ageMs)} ago`}</span></span><span /></div>
            ))}
          </div>
        </section>
      </div>
      <JoinPanel s={s} run={run} />
    </div>
  );
}

function Cameras({ s, run, go }: Pick<PageProps, 's' | 'run' | 'go'>) {
  const talent = s.match ? onAir(s.match, s.event).talent : [];
  const desk = talent.filter((t) => t.camera.kind !== 'none').slice(0, 2).map((t) => t.id);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="stack" style={{ gap: 22 }}>
      <section className="stack" style={{ gap: 8 }}>
        <div className="between"><h2 className="title-sm">People on air</h2><button className="btn quiet small" onClick={() => go('event')}>Edit in Event</button></div>
        <div className="lst">
          {talent.length === 0 && <p className="li muted t-sm">Nobody on air for this match.</p>}
          {talent.map((t) => {
            const cam = cameraText(t);
            const slot = desk.indexOf(t.id);
            const link = t.camera.kind === 'link' && t.camera.linkId ? cameraLinkUrl(t.camera.linkId, t.name) : null;
            return (
              <div key={t.id} className="li cam-row">
                <Face s={s} photo={t.photo} name={t.name} size={32} />
                <span><b>{t.name}</b> <span className="muted t-sm">· {ROLE_NAME[t.role]}</span><br /><span className="faint t-xs">{cam.text}{slot >= 0 ? ` · ESPORTRA · Desk camera ${slot + 1}` : t.camera.kind !== 'none' ? ' · not on the desk (two cameras fit)' : ''}</span></span>
                {link ? <button className="btn small" onClick={() => { void air.copy(link); setCopied(t.id); }}>{copied === t.id ? 'Copied' : 'Copy camera link'}</button> : <span />}
              </div>
            );
          })}
        </div>
        <p className="faint t-xs">The first two people with a camera fill the desk’s two windows when you go live. Someone without a camera shows their photo.</p>
      </section>
      <CamerasPanel s={s} run={run} />
    </div>
  );
}

export function DevicesScreen(props: PageProps & { embedded?: boolean }) {
  const [tab, setTab] = useState<Tab>('checkin');
  return (
    <div className="stack" style={{ gap: 18 }}>
      {!props.embedded && <PageHeader eyebrow="Devices" title="Devices">Every PC and camera this show depends on.</PageHeader>}
      <div className="tabs" role="tablist" aria-label="Devices">
        {([['checkin', 'Check-in'], ['cameras', 'Cameras'], ['data', 'Game data']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'checkin' && <CheckIn s={props.s} run={props.run} />}
      {tab === 'cameras' && <Cameras s={props.s} run={props.run} go={props.go} />}
      {tab === 'data' && <CaptureScreen {...props} />}
    </div>
  );
}
