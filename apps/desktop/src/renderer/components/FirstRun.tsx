// First run (docs/SPEC.md 4A): welcome, account or guest, game (no default), setup, Connect OBS.
// Shown until finished; Settings can start it again. Every game-specific line comes from the module.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { GAMES, PROFILES, type GameId, type Profile } from '../../shared/games.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { LOGO } from './ui.tsx';

type Step = 'welcome' | 'account' | 'game' | 'setup' | 'obs';
const NUMBERED: Step[] = ['account', 'game', 'setup', 'obs'];

/** Soft stage beams and haze, drawn in code (no image files). Used only on first run and empty states. */
export function StageLight() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const { width: w, height: h } = c.getBoundingClientRect();
      if (!w || !h) return;
      const d = window.devicePixelRatio || 1;
      c.width = w * d;
      c.height = h * d;
      const g = c.getContext('2d');
      if (!g) return;
      g.scale(d, d);
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      g.fillStyle = '#0d0d11';
      g.fillRect(0, 0, w, h);
      for (const [x, a, hue] of [[0.28, 0.16, 235], [0.6, 0.12, 260], [0.86, 0.08, 200]] as const) {
        const beam = g.createLinearGradient(w * x, 0, w * x, h);
        beam.addColorStop(0, `hsla(${hue},60%,75%,${a})`);
        beam.addColorStop(1, 'hsla(0,0%,0%,0)');
        g.fillStyle = beam;
        g.beginPath();
        g.moveTo(w * x - 8, 0);
        g.lineTo(w * x + 8, 0);
        g.lineTo(w * x + w * 0.18, h);
        g.lineTo(w * x - w * 0.18, h);
        g.closePath();
        g.fill();
      }
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(220,225,255,${rnd() * 0.08})`;
        g.beginPath();
        g.arc(rnd() * w, rnd() * h, rnd() * 1.6 + 0.3, 0, 7);
        g.fill();
      }
      const v = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.9);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,.6)');
      g.fillStyle = v;
      g.fillRect(0, 0, w, h);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  return <canvas ref={ref} className="stagelight" aria-hidden="true" />;
}

/** What goes on air, drawn as the graphics look (placeholder teams and talent). */
function OnAirPreview() {
  return (
    <div className="fr-preview" aria-label="Example graphics: a scorebug and a talent lower third">
      <div className="fr-bug">
        <span className="t"><i style={{ background: '#22d3ee' }} />NIGHT OWLS</span>
        <span className="mid"><b>7 – 5</b>ROUND 13 · MAP 2</span>
        <span className="t r">CRIMSON FIVE<i style={{ background: '#f43f5e' }} /></span>
      </div>
      <div className="fr-l3"><span className="ph" /><span><b>Sara Malik</b><small>PLAY-BY-PLAY</small></span></div>
      <span className="muted" style={{ fontSize: 12.5 }}>What goes on air: your teams, your talent, the live match.</span>
    </div>
  );
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return <div className="fr-fact"><span className="fr-tick" aria-hidden="true" /><div><b>{title}</b><span>{children}</span></div></div>;
}

function Choice({ name, detail, checked, disabled, note, onPick }: { name: string; detail: string; checked: boolean; disabled?: boolean; note?: string; onPick: () => void }) {
  return (
    <button type="button" className="choice" role="radio" aria-checked={checked} disabled={disabled} onClick={onPick}>
      <b>{name}</b>
      {note ? <span className="faint" style={{ fontSize: 12 }}>{note}</span> : <span className="radio" aria-hidden="true" />}
      <span className="muted">{detail}</span>
    </button>
  );
}

/** The three setups; "With player PCs" only for games whose player PCs add data. */
export function ProfilePicker({ s, value, onPick }: { s: Snapshot; value: Profile | null; onPick: (p: Profile) => void }) {
  return (
    <div role="radiogroup" aria-label="Setup" className="choices">
      {PROFILES.filter((p) => p.id !== 'player-pcs' || s.game?.playerPcData).map((p) => (
        <Choice key={p.id} name={p.name} detail={p.id === 'player-pcs' && s.game ? `${p.detail} ${s.game.name}: ${s.game.playerPcData?.toLowerCase()}.` : p.detail} checked={value === p.id} onPick={() => onPick(p.id)} />
      ))}
    </div>
  );
}

export function FirstRun({ s, run }: { s: Snapshot; run: Run }) {
  const [step, setStep] = useState<Step>('welcome');
  const [game, setGame] = useState<GameId | null>(s.setup.game);
  const [profile, setProfile] = useState<Profile | null>(s.setup.profile);
  const n = NUMBERED.indexOf(step);
  return (
    <div className="win">
      <header className="topbar">
        <span className="brand">{LOGO}Esportra Air</span>
        <span className="spacer" />
        {n >= 0 && (
          <span className="fr-steps" aria-label={`Step ${n + 1} of 4`}>
            {NUMBERED.map((x, i) => <i key={x} className={i <= n ? 'on' : ''} />)}
            <span>Step {n + 1} of 4</span>
          </span>
        )}
      </header>
      <div className="fr">
        <section className="fr-left">
          {step === 'welcome' && <Welcome next={() => setStep('account')} />}
          {step === 'account' && <Account s={s} run={run} next={() => setStep('game')} />}
          {step === 'game' && (
            <>
              <h1 className="fr-title">Which game do you produce?</h1>
              <p className="lead">Air sets up that game’s graphics and checks. Switch later from the top bar.</p>
              <div role="radiogroup" aria-label="Game" className="choices">
                {GAMES.map((g) => (
                  <Choice key={g.id} name={g.name} detail={g.available ? `Graphics pack: ${g.pack}` : 'Not available yet'} note={g.available ? undefined : 'Coming later'} disabled={!g.available} checked={game === g.id} onPick={() => setGame(g.id)} />
                ))}
              </div>
              <div className="fr-actions">
                <button className="btn primary big" disabled={!game} onClick={async () => { if (game && (await run(() => air.chooseGame(game)))) setStep('setup'); }}>Continue</button>
                <button className="btn quiet" onClick={() => setStep('account')}>Back</button>
              </div>
            </>
          )}
          {step === 'setup' && (
            <>
              <h1 className="fr-title">How is your production set up?</h1>
              <p className="lead">Air checks the right things for your setup. Change it any time in Settings.</p>
              <ProfilePicker s={s} value={profile} onPick={setProfile} />
              <div className="fr-actions">
                <button className="btn primary big" disabled={!profile} onClick={async () => { if (profile && (await run(() => air.chooseProfile(profile)))) setStep('obs'); }}>Continue</button>
                <button className="btn quiet" onClick={() => setStep('game')}>Back</button>
              </div>
            </>
          )}
          {step === 'obs' && <ConnectObs s={s} run={run} back={() => setStep('setup')} />}
        </section>
        <aside className="fr-right">
          <StageLight />
          <div className="fr-right-body">
            {step === 'welcome' && <OnAirPreview />}
            {step === 'account' && <AccountCompare />}
            {step === 'game' && <GameDetails id={game} />}
            {step === 'setup' && <SetupDiagram s={s} profile={profile} />}
            {step === 'obs' && <ObsPromise />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Welcome({ next }: { next: () => void }) {
  return (
    <>
      <h1 className="fr-title">Run a professional broadcast from one place.</h1>
      <p className="lead">Your tournament, your teams and the live game, turned into graphics on your stream.</p>
      <div className="fr-facts">
        <Fact title="Works with your OBS">Air adds its own scenes. Your scenes, transitions and stream stay yours.</Fact>
        <Fact title="Follows the match by itself">Scores, rounds and big moments go on air as they happen.</Fact>
        <Fact title="Your data stays with you">Game data stays on your network.</Fact>
      </div>
      <div className="fr-actions"><button className="btn primary big" onClick={next}>Get started</button><span className="muted">About two minutes.</span></div>
    </>
  );
}

function Account({ s, run, next }: { s: Snapshot; run: Run; next: () => void }) {
  const [email, setEmail] = useState(s.esportra.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const signedIn = s.esportra.state !== 'signed-out';
  return (
    <>
      <h1 className="fr-title">Sign in to bring your tournament with you.</h1>
      <p className="lead">Your schedule, teams, logos and lineups load from Esportra. You can also work without an account.</p>
      {signedIn ? (
        <div className="fr-actions"><span className="muted">Signed in as <b style={{ color: 'var(--text)' }}>{s.esportra.email}</b>.</span><button className="btn primary big" onClick={next}>Continue</button></div>
      ) : (
        <form
          className="stack" style={{ gap: 12, maxWidth: 380 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const ok = await run(() => air.esportraSignIn(email, password));
            setBusy(false);
            setPassword('');
            if (ok) next();
          }}
        >
          <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required maxLength={254} /></label>
          <label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required maxLength={4096} /></label>
          <div className="fr-actions">
            <button type="submit" className="btn primary big" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <a className="btn quiet" href="https://esportra.gg/forgot-password" target="_blank" rel="noreferrer">Forgot password</a>
          </div>
        </form>
      )}
      {!signedIn && (
        <>
          <hr className="fr-rule" />
          <div className="stack" style={{ gap: 6, maxWidth: 420 }}>
            <button className="btn big" style={{ alignSelf: 'flex-start' }} onClick={next}>Continue as guest</button>
            <span className="muted" style={{ fontSize: 12.5 }}>Create matches by hand on this PC. Sign in any time from Settings.</span>
          </div>
        </>
      )}
    </>
  );
}

function ConnectObs({ s, run, back }: { s: Snapshot; run: Run; back: () => void }) {
  const local = ['127.0.0.1', 'localhost'].includes(s.setup.obs.host);
  const [computer, setComputer] = useState(local ? 'This PC' : s.setup.obs.host);
  const [port, setPort] = useState(String(s.setup.obs.port));
  const [password, setPassword] = useState('');
  const connected = s.obs.state === 'connected';
  const host = /^this pc$/i.test(computer.trim()) ? '127.0.0.1' : computer.trim();
  return (
    <>
      <h1 className="fr-title">Connect OBS.</h1>
      <p className="lead">In OBS: Tools › WebSocket Server Settings › Enable, then copy the password here.</p>
      <form className="fr-obs" onSubmit={(e) => { e.preventDefault(); void run(() => air.connectObs({ host, port: Number(port), password })); }}>
        <label className="field"><span>Computer</span><input value={computer} onChange={(e) => setComputer(e.target.value)} maxLength={253} /></label>
        <label className="field"><span>Port</span><input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={5} /></label>
        <label className="field" style={{ gridColumn: '1 / -1' }}><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={256} /></label>
        <button className="btn" disabled={s.obs.state === 'connecting'} style={{ justifySelf: 'start' }}>{connected ? 'Connect again' : s.obs.state === 'connecting' ? 'Connecting…' : 'Connect'}</button>
      </form>
      <p className="muted" role="status" style={{ fontSize: 13 }}>
        <span className={`dot ${connected ? 'ok' : s.obs.state === 'error' ? 'bad' : ''}`} style={{ marginRight: 8 }} />
        {connected ? `Connected to OBS${s.obs.collection ? ` · scene collection “${s.obs.collection}”` : ''}` : s.obs.state === 'error' ? s.obs.error : 'Not connected yet.'}
      </p>
      <div className="fr-actions">
        <button className="btn primary big" disabled={!connected} onClick={() => void run(() => air.finishOnboarding())}>Finish</button>
        <button className="btn quiet" onClick={() => void run(() => air.finishOnboarding())}>Connect later</button>
        <button className="btn quiet" onClick={back}>Back</button>
      </div>
    </>
  );
}

function AccountCompare() {
  const rows: Array<[string, boolean]> = [['Tonight’s matches, ready to open', true], ['Teams, logos and lineups filled in', true], ['Event branding and sponsors', true], ['Quick matches by hand', false], ['Graphics, autopilot and rehearsal', false]];
  return (
    <div className="stack" style={{ width: 380, gap: 10 }}>
      <b>With an Esportra account</b>
      <div className="fr-list">{rows.map(([t, only]) => <div key={t}><span>{t}</span><span className="faint">{only ? 'Signed in' : 'Everyone'}</span></div>)}</div>
    </div>
  );
}

function GameDetails({ id }: { id: GameId | null }) {
  const g = GAMES.find((x) => x.id === id);
  if (!g) return <p className="muted" style={{ maxWidth: '30ch', textAlign: 'center' }}>Pick a game to see what Air shows for it.</p>;
  return (
    <div className="stack" style={{ width: 400, gap: 10 }}>
      <b>What Air shows for {g.name}</b>
      <div className="fr-list wide">
        <div><span className="faint">From the match</span><span>{g.matchData}</span></div>
        {g.playerPcData && <div><span className="faint">From player PCs</span><span>{g.playerPcData}</span></div>}
        <div><span className="faint">Graphics pack</span><span>{g.pack}</span></div>
      </div>
    </div>
  );
}

function SetupDiagram({ s, profile }: { s: Snapshot; profile: Profile | null }) {
  const box = (x: number, y: number, title: string, sub: string, strong = false) => (
    <g>
      <rect x={x} y={y} width="150" height="52" rx="6" fill="#0b0b0d" stroke={strong ? 'var(--text-2)' : 'var(--hair-strong)'} />
      <text x={x + 14} y={y + 22} fill="var(--text)" fontWeight="600" fontSize="13">{title}</text>
      <text x={x + 14} y={y + 40} fill="var(--text-3)" fontSize="11.5">{sub}</text>
    </g>
  );
  const sources = profile === 'one-pc' ? [] : profile === 'player-pcs' ? [['Observer PC', 'the match'], ['10 player PCs', 'each player’s own data']] : [['Observer PC', 'the match']];
  return (
    <svg width="440" height="230" viewBox="0 0 440 230" role="img" aria-label="Which PCs send what to your PC">
      {sources.map(([t, sub], i) => {
        const y = sources.length === 1 ? 89 : i ? 144 : 34;
        return <g key={t}><path d={`M160 ${y + 26} C 220 ${y + 26}, 220 115, 280 115`} fill="none" stroke="var(--hair-strong)" strokeWidth="1.5" />{box(10, y, t!, sub!)}</g>;
      })}
      {box(280, 89, 'Your PC', profile === 'one-pc' ? `${s.game?.name ?? 'The game'}, Air and OBS` : 'Air and OBS', true)}
    </svg>
  );
}

function ObsPromise() {
  return (
    <div className="stack" style={{ width: 360, gap: 8 }}>
      <b>Air will</b>
      <span className="muted">Add its own scenes, named ESPORTRA · …, for the graphics you choose. Read which scene is on air. Save the replay buffer when you ask.</span>
      <b style={{ marginTop: 8 }}>Air never</b>
      <span className="muted">Switches your scenes, starts the stream or records, or touches your own scenes.</span>
    </div>
  );
}
