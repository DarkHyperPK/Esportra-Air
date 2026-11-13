// The Rundown (approved mock, 12 Nov): this match's screens in show order, in Pre-show, Game, Between
// maps and Post-show. Only what is here goes to OBS. Full-screen rows come up when you press Take or by
// themselves; scene rows (Starting soon, Break, Desk, Ending) are switched in OBS; the in-game HUD is
// one row with its parts as switches.
import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { HUD_ROW, PRESETS, SECTIONS, SECTION_LABEL, WHEN_LABEL, rowTitle, takesItself, type Preset, type RundownRow, type Section } from '../../shared/autopilot.ts';
import { SCENES } from '../../shared/scenes.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { Preview, overlayUrl } from './Preview.tsx';
import { lookOf, type Look } from '../../shared/look.ts';
import { ScreenRule, holdText, mapText, onScreenText } from './ScreenRule.tsx';

/** The parts of the in-game HUD the producer can switch (the HUD's own `show` flags). */
const HUD_PARTS: Array<[string, string]> = [
  ['scorebug', 'Scorebug'], ['players', 'Player cards'], ['moments', 'Round banners'], ['spikeTimer', 'Spike timer'],
  ['sponsor', 'Sponsor bug'], ['eventBug', 'Event bug'], ['winProb', 'Win probability'], ['roundHistory', 'Round history'], ['ticker', 'Ticker'],
];

const TEMPLATE_TEXT: Record<Exclude<Preset, 'empty'>, string> = {
  standard: 'Standard show: intro, back to the game, halftime, map result, series and champion, the results by themselves.',
  minimal: 'Results only: the same screens; only the map result and back to the game come up by themselves.',
  manual: 'Manual: the same screens, each waiting for your Take.',
};

const WHEN_TEXT: Partial<Record<RundownRow['trigger'], string>> = {
  match_start: 'the map starts', round_live: 'a round goes live', round_end: 'a round ends', halftime: 'it is halftime', map_end: 'the map ends',
};

function comesUp(r: RundownRow): string {
  if (r.show === HUD_ROW) return 'Over the game, all match long';
  if (!takesItself(r.show)) return `In OBS: switch to ${SCENES[r.show === 'casters' ? 'casters' : 'holding'].name} when you are ready`;
  const when = r.trigger === 'manual' ? 'When I press Take' : r.trigger === 'delay' ? `By itself ${r.delaySeconds} s after the previous one` : `By itself when ${WHEN_TEXT[r.trigger] ?? WHEN_LABEL[r.trigger].toLowerCase()}`;
  const parts = [when, r.map === 'every' ? '' : mapText(r.map).toLowerCase(), r.show ? onScreenText(r.forSeconds).toLowerCase() : '', r.transition === 'stinger' ? 'stinger' : 'cut', r.trigger === 'manual' ? '' : holdText(r).toLowerCase()];
  return parts.filter(Boolean).join(' · ');
}

/** Line the scorebug up with the game's own timer, match its plate, and pick the pause style. */
function HudAdjust({ s, run }: { s: Snapshot; run: Run }) {
  const look = lookOf(s.setup.look);
  const set = (patch: Partial<Look>) => void run(() => air.updateSetup({ look: patch }));
  const timer = (t: Partial<Look['timer']>) => set({ timer: { ...look.timer, ...t } });
  return (
    <details className="hud-adjust">
      <summary className="muted t-sm">Adjust the scorebug and pause</summary>
      <div className="hud-adjust-body">
        <span className="t-sm">Timer window</span>
        <span className="row-gap">
          <button type="button" className="btn small" aria-label="Move the timer window left" onClick={() => timer({ dx: look.timer.dx - 2 })}>←</button>
          <button type="button" className="btn small" aria-label="Move the timer window right" onClick={() => timer({ dx: look.timer.dx + 2 })}>→</button>
          <button type="button" className="btn small" aria-label="Make the timer window narrower" onClick={() => timer({ width: look.timer.width - 4 })}>−</button>
          <button type="button" className="btn small" aria-label="Make the timer window wider" onClick={() => timer({ width: look.timer.width + 4 })}>+</button>
          <span className="faint t-xs mono">{look.timer.dx > 0 ? '+' : ''}{look.timer.dx} px · {look.timer.width} px wide</span>
          <button type="button" className="btn quiet small" onClick={() => timer({ dx: 0, width: 160 })}>Reset</button>
        </span>
        <span className="t-sm">Plate colour</span>
        <span className="row-gap"><input type="color" aria-label="Scorebug plate colour" value={look.timer.plate} onChange={(e) => timer({ plate: e.target.value })} /><span className="faint t-xs">Match the game's timer box.</span></span>
        <span className="t-sm">Pause and timeout</span>
        <span className="rb-chips" role="radiogroup" aria-label="Pause style">
          {([['box', 'Box at the bottom left'], ['panel', 'Centred panel']] as const).map(([v, label]) => <button key={v} type="button" role="radio" aria-checked={look.pause === v} className="rb-chip" onClick={() => set({ pause: v })}>{label}</button>)}
        </span>
      </div>
      <p className="faint t-xs">Line the window up once with the game on screen; it is saved for this production.</p>
    </details>
  );
}

export function Rundown({ s, run }: { s: Snapshot; run: Run }) {
  const [adding, setAdding] = useState<Section | null>(null);
  const [editing, setEditing] = useState<RundownRow | null>(null);
  const [template, setTemplate] = useState(false);
  const rows = s.rundown;
  const locked = s.autopilot.enabled;
  const title = (id: string) => s.setup.screens.find((x) => x.id === id)?.title ?? id;
  const overlay = (id: string | null) => (id ? s.setup.screens.find((x) => x.id === id)?.overlay ?? null : null);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="between">
        <div><h2 className="title-md">Rundown</h2><p className="muted t-sm">The screens of your show, in your order. Only what is here goes to OBS.</p></div>
        <span className="row-gap" style={{ position: 'relative' }}>
          <button className="btn quiet small" disabled={locked} aria-expanded={template} onClick={() => setTemplate(!template)}>Use a starting template</button>
          {template && (
            <div className="menu-pop" role="menu" aria-label="Starting templates">
              {PRESETS.filter((p): p is Exclude<Preset, 'empty'> => p !== 'empty').map((p) => (
                <button key={p} role="menuitem" onClick={() => { setTemplate(false); void run(() => air.rundownStartFrom(p)); }}><b>{TEMPLATE_TEXT[p].split(':')[0]}</b><span className="faint t-xs">{TEMPLATE_TEXT[p].split(': ')[1]}</span></button>
              ))}
              <p className="faint t-xs">Replaces the rows below.</p>
            </div>
          )}
        </span>
      </div>
      {locked && <p className="notice">Autopilot is running. Choose Run manually on Live to change the Rundown.</p>}
      {SECTIONS.map((sec) => {
        const list = rows.filter((r) => r.section === sec);
        return (
          <section key={sec} className="rd-sec" aria-label={SECTION_LABEL[sec]}>
            <div className="between rd-sec-head"><h3>{SECTION_LABEL[sec]}</h3><button className="btn small" disabled={locked} onClick={() => setAdding(sec)}>Add screen</button></div>
            {list.length === 0 && <p className="faint t-sm rd-empty">Nothing yet.</p>}
            {list.map((r, i) => {
              const name = rowTitle(r.show, r.section, title);
              const ov = overlay(r.show);
              return (
                <div key={r.id} className={`rd-row ${r.enabled ? '' : 'off'}`}>
                  <span className="rd-move">
                    <button className="btn quiet small" disabled={locked || i === 0} aria-label={`Move ${name} up`} onClick={() => void run(() => air.rundownMove(r.id, -1))}>↑</button>
                    <button className="btn quiet small" disabled={locked || i === list.length - 1} aria-label={`Move ${name} down`} onClick={() => void run(() => air.rundownMove(r.id, 1))}>↓</button>
                  </span>
                  <span className="rd-thumb">{ov ? <Preview src={overlayUrl(s, ov)} label={name} /> : <span className="sr-thumb">GAME</span>}</span>
                  <span className="rd-name"><b>{name}</b><span className="muted t-sm">{comesUp(r)}</span></span>
                  <span className="row-gap">
                    {takesItself(r.show) && <button className="btn quiet small" disabled={locked} onClick={() => setEditing(r)} aria-label={`Edit ${name}`}>Edit</button>}
                    <button className="btn quiet small" disabled={locked} onClick={() => void run(() => air.rundownRemove(r.id))} aria-label={`Remove ${name}`}>Remove</button>
                  </span>
                  {r.show === HUD_ROW && (
                    <div className="hud-parts" role="group" aria-label="Parts of the in-game HUD">
                      {HUD_PARTS.map(([key, label]) => {
                        const on = s.setup.hud[key] !== false;
                        return <button key={key} type="button" aria-pressed={on} className="rb-chip" onClick={() => void run(() => air.updateSetup({ hud: { ...s.setup.hud, [key]: !on } }))}>{on ? '✓ ' : ''}{label}</button>;
                      })}
                    </div>
                  )}
                  {r.show === HUD_ROW && <HudAdjust s={s} run={run} />}
                </div>
              );
            })}
          </section>
        );
      })}
      <p className="faint t-xs">“When I press Take” waits in Next on Live. “By itself” comes up on its own after a short hold you can stop. Economy, round recap and kill callouts are part of the in-game HUD and come up by themselves.</p>
      {(adding || editing) && <ScreenRule s={s} run={run} row={editing} section={adding ?? undefined} close={() => { setAdding(null); setEditing(null); }} />}
    </div>
  );
}
