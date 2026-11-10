import { useState } from 'react';
import type { ActionId } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import { Box, Cap } from '../components/ui.tsx';
import { NextFive } from '../components/Autopilot.tsx';
import type { PageProps } from '../App.tsx';

export function QuickMatchForm({ run, onDone }: Pick<PageProps, 'run'> & { onDone?: () => void }) {
  const [teamA, setA] = useState('');
  const [teamB, setB] = useState('');
  const [bestOf, setBo] = useState<1 | 3 | 5>(3);
  return (
    <form
      className="stack"
      style={{ gap: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => air.createQuickMatch({ teamA, teamB, bestOf }))) onDone?.();
      }}
    >
      <label className="field"><span>Team A</span><input value={teamA} onChange={(e) => setA(e.target.value)} maxLength={40} required placeholder="Team name" /></label>
      <label className="field"><span>Team B</span><input value={teamB} onChange={(e) => setB(e.target.value)} maxLength={40} required placeholder="Team name" /></label>
      <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="seg" role="group" aria-label="Format">
          {([1, 3, 5] as const).map((n) => <button type="button" key={n} aria-pressed={bestOf === n} onClick={() => setBo(n)}>Bo{n}</button>)}
        </div>
        <button className="btn primary" type="submit">Create match</button>
      </div>
    </form>
  );
}

const when = (iso: string | null) => {
  if (!iso) return 'Time not set';
  const d = new Date(iso);
  const day = d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

/** The producer's scheduled Esportra matches, chosen with one click. */
function EsportraMatches({ s, run, openSignIn }: Pick<PageProps, 's' | 'run' | 'openSignIn'>) {
  const e = s.esportra;
  if (e.state === 'signed-out') {
    return (
      <section className="stack" style={{ gap: 8 }}>
        <Cap>Esportra tournaments</Cap>
        <button className="btn" onClick={openSignIn}>Sign in to Esportra</button>
        <p className="muted" style={{ fontSize: 12.5 }}>Your scheduled matches load with their teams, logos and best-of.</p>
      </section>
    );
  }
  const list = e.matches.filter((m) => m.status !== 'completed' && m.status !== 'cancelled').slice(0, 8);
  return (
    <section className="stack" style={{ gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Cap>Esportra tournaments</Cap>
        <button className="btn quiet small" onClick={() => void run(() => air.esportraRefresh())}>Refresh</button>
      </div>
      {list.length === 0 ? <p className="muted" style={{ fontSize: 12.5 }}>No scheduled matches right now{e.state === 'online' ? '' : ' (the list below is the last one saved)'}.</p> : (
        <div className="picker" role="group" aria-label="Esportra matches">
          {list.map((m) => {
            const active = s.match?.source?.matchId === m.id;
            return (
              <button key={m.id} aria-pressed={active} disabled={!m.supported || e.state === 'denied'} onClick={() => void run(() => air.useEsportraMatch(m.id))} title={m.supported ? undefined : 'Air only produces Valorant matches for now'}>
                <span className="vs" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span>{m.teamA} <span className="muted">vs</span> {m.teamB}</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>{m.tournament} · {when(m.scheduledAt)}</span>
                </span>
                <span className="muted mono" style={{ fontSize: 11 }}>Bo{m.bestOf}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function ReadyScreen({ s, run, go, askCapture, openCasters, openSignIn, start }: PageProps & { start: () => void }) {
  const [creating, setCreating] = useState(!s.match && s.matches.length === 0);
  const informational = (id: string, health: string) => (id === 'esportra' || id === 'internet') && health === 'off';
  const counted = s.checks.filter((c) => !informational(c.id, c.health));
  const ready = counted.filter((c) => c.health === 'ok').length;
  const all = ready === counted.length;
  const act = (id: ActionId) => {
    if (id === 'start-capture') return askCapture();
    if (id === 'connect-obs') return go('scenes');
    if (id === 'choose-match') return setCreating(true);
    if (id === 'add-casters') return openCasters();
    if (id === 'open-sources') return go('outputs');
    if (id === 'sign-in') return openSignIn();
    if (id === 'install-graphics') void run(() => air.installGraphics());
  };
  return (
    <div className="ready-grid">
      <aside className="ready-side" aria-label="This PC and show">
        <section>
          <Cap>This PC · production</Cap>
          <h1 className="title-lg" style={{ marginTop: 8 }}>Studio desk</h1>
          <p className="lead" style={{ marginTop: 8 }}>Runs the graphics for <b style={{ color: 'var(--text)' }}>{s.setup.name}</b>. Graphics stay on air if Air closes.</p>
        </section>

        <section className="stack" style={{ gap: 8 }}>
          <Cap>Show</Cap>
          <button className="picker" style={{ width: '100%', height: 40, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--stage)', border: '1px solid var(--hair-strong)', fontSize: 13.5 }} onClick={() => go('setup')}>
            <span>{s.setup.name}</span><span className="muted">Setup ›</span>
          </button>
        </section>

        <EsportraMatches s={s} run={run} openSignIn={openSignIn} />

        <section className="stack" style={{ gap: 8 }}>
          <Cap>Match on this PC</Cap>
          {s.matches.length > 0 && (
            <div className="picker" role="group" aria-label="Matches">
              {s.matches.slice(0, 6).map((m) => (
                <button key={m.id} aria-pressed={m.id === s.match?.id} onClick={() => void run(() => air.selectMatch(m.id))}>
                  <span className="vs"><span className="crest" style={{ background: m.teams[0].color }} /> {m.teams[0].name} <span className="muted">vs</span> <span className="crest" style={{ background: m.teams[1].color }} /> {m.teams[1].name}</span>
                  <span className="muted mono" style={{ fontSize: 11 }}>Bo{m.bestOf}</span>
                </button>
              ))}
            </div>
          )}
          {creating ? (
            <div className="panel body-pad"><Cap>Quick match</Cap><div style={{ height: 10 }} /><QuickMatchForm run={run} onDone={() => setCreating(false)} /></div>
          ) : (
            <button className="btn" onClick={() => setCreating(true)}>+ Quick match</button>
          )}
          <p className="muted" style={{ fontSize: 12.5 }}>For scrims and showmatches. Esportra tournament matches appear here once you sign in.</p>
        </section>
      </aside>

      <div className="ready-main">
        <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <Cap>Readiness</Cap>
            <h2 className="title-lg" style={{ marginTop: 8 }}>{all ? 'Ready when you are' : 'Almost ready'}</h2>
          </div>
          <span className={`tag-count ${all ? 'ok' : ''}`}>{ready} of {counted.length} ready</span>
        </div>

        <section className="checklist" aria-label="Readiness checks">
          {s.checks.map((c) => (
            <div className="checkrow" key={c.id}>
              <Box health={c.health} />
              <span><strong>{c.title}</strong><span className="d">{c.detail}</span></span>
              {c.action ? <button className="btn fix" onClick={() => act(c.action!.id)}>{c.action.label}</button> : <span />}
            </div>
          ))}
        </section>

        <NextFive s={s} />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn primary big" disabled={!!s.autopilotBlock} onClick={() => void run(() => air.autopilotStart()).then((ok) => ok && start())}>Start autopilot</button>
          <button className="btn big" onClick={() => void run(() => air.autopilotStop()).then(start)}>Run manually</button>
          <span className="muted" style={{ fontSize: 12.5, maxWidth: 420 }}>{s.autopilotBlock ?? 'Autopilot takes scenes for you after a hold window you can stop with H. Off unless you start it.'}</span>
        </div>
      </div>
    </div>
  );
}
