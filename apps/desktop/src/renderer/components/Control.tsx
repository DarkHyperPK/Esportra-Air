// How this PC runs graphics (approved mock): Air, Stream Deck / Companion, or both. The picker is used
// in Settings and first run; the Companion panel shows the connection and what Companion can do.
import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { ACTION_LABEL, COMPANION_ACTIONS, COMPANION_EVENTS, EVENT_LABEL, type ControlMode } from '../../shared/companion.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { Cap, Tally } from './ui.tsx';

const CHOICES: Array<[ControlMode, string, string, string]> = [
  ['air', 'Air', 'Live in Air: Cued and Take, the rundown and autopilot. Best for a producer on their own.', 'Shows Live with Next and autopilot, and the match’s Autopilot tab.'],
  ['companion', 'Stream Deck / Companion', 'Your Companion buttons and triggers run Air’s graphics. Air sends game events and takes button presses. Air never switches scenes; Companion can, if you set it to.', 'Shows Live without Next, and Settings › Companion. Hides the Autopilot tab.'],
  ['both', 'Both', 'Air’s rundown and Live, and Companion buttons at the same time.', 'Shows everything.'],
];

export function ControlPicker({ value, onPick }: { value: ControlMode; onPick: (m: ControlMode) => void }) {
  return (
    <div className="ctl-cards" role="radiogroup" aria-label="How do you run graphics?">
      {CHOICES.map(([id, title, text, shows]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} className="ctl-card" onClick={() => onPick(id)}>
          <span className="ctl-dot" aria-hidden="true" />
          <span><b>{title}</b><span className="muted t-sm">{text}</span><span className="faint t-xs">{shows}</span></span>
        </button>
      ))}
    </div>
  );
}

export function ControlSettings({ s, run }: { s: Snapshot; run: Run }) {
  return (
    <section className="panel" aria-label="Graphics control">
      <div className="head"><Cap>How do you run graphics?</Cap></div>
      <div className="body-pad stack" style={{ gap: 10 }}>
        <p className="muted t-sm">Air shows only what you choose. Change it any time; nothing on air changes.</p>
        <ControlPicker value={s.control} onPick={(m) => void run(() => air.setControl(m))} />
      </div>
    </section>
  );
}

export function CompanionPanel({ s, run }: { s: Snapshot; run: Run }) {
  const c = s.companion;
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (what: string, text: string) => { void air.copy(text); setCopied(what); };
  const actions = COMPANION_ACTIONS.filter((a) => s.control === 'both' || !a.startsWith('autopilot_'));
  return (
    <section className="panel" aria-label="Companion">
      <div className="head"><Cap>Companion</Cap>{c.connected ? <Tally kind="ok">Companion connected</Tally> : c.running ? <Tally kind="off">Waiting for Companion</Tally> : <Tally kind="bad">Not running</Tally>}</div>
      <div className="body-pad stack" style={{ gap: 14 }}>
        <p className="muted t-sm">Bitfocus Companion runs your Stream Deck. Add the Esportra Air connection in Companion and enter these.</p>
        {c.error && <div className="notice" role="alert">{c.error}</div>}
        <dl className="cmp-rows">
          <dt>Address</dt>
          <dd><span className="mono">{c.addresses[0] ?? `127.0.0.1:${c.port}`}</span><button className="btn small" onClick={() => copy('address', c.addresses[0] ?? `127.0.0.1:${c.port}`)}>{copied === 'address' ? 'Copied' : 'Copy'}</button></dd>
          <dt>Key</dt>
          <dd><span className="mono">{c.key ? `•••• ${c.key.slice(-4)}` : '—'}</span><span className="row-gap"><button className="btn small" disabled={!c.key} onClick={() => copy('key', c.key!)}>{copied === 'key' ? 'Copied' : 'Copy'}</button><button className="btn quiet small" onClick={() => void run(() => air.companionRenewKey())}>New key</button></span></dd>
        </dl>
        <div className="cols2">
          <div className="stack" style={{ gap: 4 }}>
            <h3 className="title-sm">Air sends (triggers)</h3><span className="faint t-xs">Only what Air already reads.</span>
            <ul className="cmp-list">{COMPANION_EVENTS.map((e) => <li key={e}>{EVENT_LABEL[e]}</li>)}</ul>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <h3 className="title-sm">Buttons can (actions)</h3><span className="faint t-xs">The in-game HUD runs itself and is left alone.</span>
            <ul className="cmp-list">{actions.map((a) => <li key={a}>{ACTION_LABEL[a]}</li>)}</ul>
          </div>
        </div>
        <p className="faint t-xs">Button labels can show the score, round, map, each player and what is on air. Only this network can connect, and only with the key. Graphics follow Cued on Live, the same as Air’s keys.</p>
      </div>
    </section>
  );
}
