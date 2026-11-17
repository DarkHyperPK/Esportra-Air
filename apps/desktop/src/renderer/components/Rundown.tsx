// The Rundown (approved mock, 12 Nov): this match's screens in show order, in Pre-show, Game, Between
// maps and Post-show. Only what is here goes to OBS. Full-screen rows come up when you press Take or by
// themselves; scene rows (Starting soon, Break, Desk, Ending) are switched in OBS; the in-game HUD is
// one row with its parts as switches.
import { useState } from 'react';
import { BANNER_THEMES, type Snapshot } from '../../shared/api.ts';
import { HUD_ROW, PRESETS, SECTIONS, SECTION_LABEL, WHEN_LABEL, rowTitle, takesItself, type Preset, type RundownRow, type Section } from '../../shared/autopilot.ts';
import { SCENES } from '../../shared/scenes.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { Preview, overlayUrl, screenUrl, StillPreview, stillKey } from './Preview.tsx';
import { lookOf, lookOverlay } from '../../shared/look.ts';
import { LookPicker } from './LookPicker.tsx';
import { TemplateThumb } from '../screens/LibraryScreen.tsx';
import { ScreenRule, holdText, mapText, onScreenText } from './ScreenRule.tsx';
import { CopySourceButton, CopySourcePanel } from './CopySource.tsx';
import { browserSource } from '../../shared/browser-source.ts';

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
  if (r.show === HUD_ROW) return 'In-game, all match long';
  if (!takesItself(r.show)) return `In OBS: switch to ${SCENES[r.show === 'casters' ? 'casters' : 'holding'].name} when you are ready`;
  const when = r.trigger === 'manual' ? 'When I press Take' : r.trigger === 'delay' ? `By itself ${r.delaySeconds} s after the previous one` : `By itself when ${WHEN_TEXT[r.trigger] ?? WHEN_LABEL[r.trigger].toLowerCase()}`;
  const parts = [when, r.map === 'every' ? '' : mapText(r.map).toLowerCase(), r.show ? onScreenText(r.forSeconds).toLowerCase() : '', r.transition === 'stinger' ? 'stinger' : 'cut', r.trigger === 'manual' ? '' : holdText(r).toLowerCase()];
  return parts.filter(Boolean).join(' · ');
}

/** Line the scorebug up with the game's own timer, match its plate, and pick the pause style. */
/** The in-game HUD's look (a HUD template) and the pause style. The timer window is part of a HUD template. */
function HudLook({ s, run, row }: { s: Snapshot; run: Run; row: RundownRow }) {
  const look = lookOf(s.setup.look);
  return (
    <details className="hud-adjust">
      <summary className="muted t-sm">Look of the HUD, banners and the pause</summary>
      <div className="stack" style={{ gap: 10, marginTop: 10 }}>
        <LookPicker s={s} screen={HUD_ROW} label="Look of the in-game HUD" value={{ style: 'full', ...(row.template ? { template: row.template } : {}) }} onPick={(l) => void run(() => air.rundownSave({ ...row, template: l.template }))} />
        <span className="faint t-xs">A HUD template restyles the scorebug, player cards, killfeed and the rest together, and lines the scorebug's window up with the game's timer.</span>
        {s.match && (
          <div className="hud-adjust-body">
            <span className="t-sm">Banner style</span>
            <span className="rb-chips" role="radiogroup" aria-label="Banner style">
              {BANNER_THEMES.map((t) => <button key={t} type="button" role="radio" aria-checked={(s.match!.theme ?? s.setup.package) === t} className="rb-chip" onClick={() => void run(() => air.updateMatch(s.match!.id, { theme: t }))}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}
            </span>
          </div>
        )}
        <div className="hud-adjust-body">
          <span className="t-sm">Pause and timeout</span>
          <span className="rb-chips" role="radiogroup" aria-label="Pause style">
            {([['box', 'Box at the top left'], ['panel', 'Centred panel'], ['bar', 'Bar with countdown']] as const).map(([v, label]) => <button key={v} type="button" role="radio" aria-checked={look.pause === v} className="rb-chip" onClick={() => void run(() => air.updateSetup({ look: { pause: v } }))}>{label}</button>)}
          </span>
        </div>
      </div>
    </details>
  );
}

export function Rundown({ s, run }: { s: Snapshot; run: Run }) {
  const [adding, setAdding] = useState<Section | null>(null);
  const [editing, setEditing] = useState<RundownRow | null>(null);
  const [template, setTemplate] = useState(false);
  const [source, setSource] = useState<string | null>(null);
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
                  <span className="rd-thumb">{r.template && s.templates.some((t) => t.id === r.template) ? <TemplateThumb s={s} graphic={s.templates.find((t) => t.id === r.template)!.graphic} template={s.templates.find((t) => t.id === r.template)!} label={name} /> : ov && r.show ? <StillPreview key={`${r.show}:${r.style ?? 'full'}`} src={screenUrl(s, r.show, lookOverlay(r.show, ov, r.style))} label={name} stamp={stillKey(s)} /> : <span className="sr-thumb">GAME</span>}</span>
                  <span className="rd-name"><b>{name}</b><span className="muted t-sm">{comesUp(r)}</span></span>
                  <span className="row-gap">
                    {takesItself(r.show) && <button className="btn quiet small" disabled={locked} onClick={() => setEditing(r)} aria-label={`Edit ${name}`}>Edit</button>}
                    {browserSource(s.engine.port ?? 0, s.setup.screens, r) && <CopySourceButton open={source === r.id} toggle={() => setSource(source === r.id ? null : r.id)} name={name} />}
                    <button className="btn quiet small" disabled={locked} onClick={() => void run(() => air.rundownRemove(r.id))} aria-label={`Remove ${name}`}>Remove</button>
                  </span>
                  {source === r.id && <CopySourcePanel s={s} row={r} />}
                  {r.show === HUD_ROW && (
                    <div className="hud-parts" role="group" aria-label="Parts of the in-game HUD">
                      {HUD_PARTS.map(([key, label]) => {
                        const on = s.setup.hud[key] !== false;
                        return <button key={key} type="button" aria-pressed={on} className="rb-chip" onClick={() => void run(() => air.updateSetup({ hud: { ...s.setup.hud, [key]: !on } }))}>{on ? '✓ ' : ''}{label}</button>;
                      })}
                    </div>
                  )}
                  {r.show === HUD_ROW && <HudLook s={s} run={run} row={r} />}
                  {(r.show === 'holding' || r.show === 'casters') && (
                    <details className="hud-adjust">
                      <summary className="muted t-sm">Look of {r.show === 'holding' ? 'Starting soon, Break and Ending' : 'the Desk'}</summary>
                      <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                        <LookPicker s={s} screen={r.show} label={`Look of ${name}`} value={{ style: r.style ?? 'full', ...(r.template ? { template: r.template } : {}) }} onPick={(l) => void run(() => air.rundownSave({ ...r, style: l.style, template: l.template }))} />
                        {r.show === 'holding' && r.style === 'band' && <span className="faint t-xs">The two windows show what you put in ESPORTRA · Break window 1 and 2 in OBS (a sponsor video, a camera).</span>}
                      </div>
                    </details>
                  )}
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
