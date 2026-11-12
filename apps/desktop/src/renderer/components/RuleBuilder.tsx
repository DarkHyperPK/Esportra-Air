// The rule builder (approved mock): "When [moment] and [conditions], show [graphic] for [time] via
// [cut / stinger]. [Hold]." Each row is a chip choice; the sentence it reads as updates as you choose,
// with how often it would have fired in the last rehearsal of this match.
import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { MOMENTS, PLAYER_MOMENTS, countMatches, ruleScreens, ruleSentence, type Moment, type Rule, type RuleInput } from '../../shared/rules.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { EditorDrawer } from './Editors.tsx';

/** The moment as a chip. */
export const MOMENT_CHIP: Record<Moment, string> = {
  ace: 'A player gets an ace', team_ace: 'Team ace', clutch: 'A clutch', flawless: 'Flawless round', thrifty: 'Eco win',
  match_point: 'Match point', overtime: 'Overtime', spike_planted: 'Spike planted', round_won: 'Any round won',
};

const TOAST_TEXT: Record<Moment, string> = {
  ace: '{player} with the ace', team_ace: 'Team ace for {team}', clutch: '{player} clutches it for {team}', flawless: 'Flawless round for {team}',
  thrifty: 'Thrifty from {team}', match_point: '{team} at match point', overtime: 'We are going to overtime', spike_planted: 'Spike down', round_won: 'Round to {team}',
};

const BLANK: RuleInput = { when: 'ace', map: null, team: null, rounds: 'any', show: { kind: 'spotlight' }, forSeconds: 8, via: 'stinger', hold: 'window', holdSeconds: 3 };

function Chips<T extends string | number | null>({ label, value, options, onChange, disabled }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void; disabled?: (v: T) => boolean }) {
  return (
    <div className="rb-chips" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button type="button" key={String(v)} role="radio" aria-checked={value === v} disabled={disabled?.(v)} className="rb-chip" onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

export function RuleBuilder({ s, run, rule, close, rehearse }: { s: Snapshot; run: Run; rule: Rule | null; close: () => void; rehearse: () => void }) {
  const [d, setD] = useState<RuleInput>(rule ?? BLANK);
  const match = s.match;
  const teams = match ? match.teams.map((t) => t.name) : ['Team A', 'Team B'];
  const screens = ruleScreens(s.setup.screens);
  const graphic = (id: string) => s.setup.screens.find((x) => x.id === id)?.title ?? id;
  const playerMoment = PLAYER_MOMENTS.includes(d.when);
  const set = (patch: Partial<RuleInput>) => setD({ ...d, ...patch });
  const setWhen = (when: Moment) => {
    const show = d.show.kind === 'spotlight' && !PLAYER_MOMENTS.includes(when) ? { kind: 'toast' as const, text: TOAST_TEXT[when] } : d.show.kind === 'toast' && d.show.text === TOAST_TEXT[d.when] ? { kind: 'toast' as const, text: TOAST_TEXT[when] } : d.show;
    setD({ ...d, when, show });
  };
  const sentence = ruleSentence(d, { teams, graphic });
  const recorded = s.rules.recorded;
  const count = recorded.length ? countMatches({ ...d, id: 'draft', enabled: true }, recorded, { players: match ? match.players.map((l) => l.map((p) => p.name)) : [] }) : null;
  const showKind = d.show.kind;
  const ready = showKind !== 'toast' || (d.show.kind === 'toast' && d.show.text.trim().length > 0);
  const save = async (then?: () => void) => {
    if (await run(() => air.saveRule({ ...d, ...(rule ? { id: rule.id, enabled: rule.enabled } : {}) }))) {
      close();
      then?.();
    }
  };
  const maps: Array<[number | null, string]> = [[null, 'Any map'], ...Array.from({ length: match?.bestOf ?? 1 }, (_, i): [number, string] => [i + 1, `Map ${i + 1}`])];
  return (
    <EditorDrawer
      title={rule ? 'Edit rule' : 'New rule'} close={close}
      footer={<>
        <span />
        <span className="row-gap"><button className="btn quiet" onClick={close}>Cancel</button><button className="btn primary" disabled={!ready} onClick={() => void save()}>{rule ? 'Save rule' : 'Add rule'}</button></span>
      </>}
    >
      <div className="rb">
        <span className="rb-k">When</span>
        <Chips label="When" value={d.when} onChange={setWhen} options={MOMENTS.map((m): [Moment, string] => [m, MOMENT_CHIP[m]])} />

        <span className="rb-k">And</span>
        <div className="stack" style={{ gap: 6 }}>
          <Chips label="Which map" value={d.map} onChange={(map) => set({ map })} options={maps} />
          <Chips label="Which team" value={d.team} onChange={(team) => set({ team })} options={[[null, 'Either team'], [0, teams[0]!], [1, teams[1]!]]} />
          <Chips label="Which rounds" value={d.rounds} onChange={(rounds) => set({ rounds })} options={[['any', 'Any round'], ['first', 'First half'], ['second', 'Second half'], ['overtime', 'Overtime']]} />
        </div>

        <span className="rb-k">Show</span>
        <div className="stack" style={{ gap: 8 }}>
          <Chips<'spotlight' | 'fullscreen' | 'toast'>
            label="Show" value={showKind}
            disabled={(k) => (k === 'spotlight' && !playerMoment) || (k === 'fullscreen' && !screens.length)}
            onChange={(k) => set({ show: k === 'spotlight' ? { kind: 'spotlight' } : k === 'fullscreen' ? { kind: 'fullscreen', screen: screens[0]!.id } : { kind: 'toast', text: TOAST_TEXT[d.when] } })}
            options={[['spotlight', 'Player spotlight'], ['fullscreen', 'Full-screen graphic'], ['toast', 'Toast']]}
          />
          {d.show.kind === 'spotlight' && <span className="muted t-xs">The lower third for the player who made the moment.</span>}
          {d.show.kind === 'fullscreen' && (
            <select className="cell" aria-label="Full-screen graphic" value={d.show.screen} onChange={(e) => set({ show: { kind: 'fullscreen', screen: e.target.value } })}>
              {screens.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          )}
          {d.show.kind === 'toast' && (
            <label className="field"><span>Words · <span className="mono">{'{team}'}</span> and <span className="mono">{'{player}'}</span> are filled in</span>
              <input value={d.show.text} maxLength={120} onChange={(e) => set({ show: { kind: 'toast', text: e.target.value.replace(/[<>]/g, '') } })} />
            </label>
          )}
          {!playerMoment && <span className="faint t-xs">Player spotlight follows moments with one player: an ace or a clutch.</span>}
        </div>

        <span className="rb-k">For</span>
        <Chips label="For" value={d.forSeconds} onChange={(forSeconds) => set({ forSeconds })} options={[[5, '5 s'], [8, '8 s'], [12, '12 s'], [20, '20 s'], [0, 'Until I clear']]} />

        <span className="rb-k">Via</span>
        <Chips label="Via" value={d.via} onChange={(via) => set({ via })} options={[['cut', 'Cut'], ['stinger', 'Stinger']]} />

        <span className="rb-k">Hold</span>
        <Chips<string>
          label="Hold" value={d.hold === 'window' ? String(d.holdSeconds) : d.hold}
          onChange={(v) => set(v === 'none' || v === 'wait' ? { hold: v, holdSeconds: 0 } : { hold: 'window', holdSeconds: Number(v) })}
          options={[['none', 'No hold'], ['3', '3 s'], ['5', '5 s'], ['10', '10 s'], ['wait', 'Wait for me']]}
        />
      </div>

      <hr className="rule" />
      <div className="stack" style={{ gap: 6 }}>
        <span className="faint t-xs">Reads as</span>
        <p className="rb-sentence"><b>{sentence.when}</b>{sentence.rest}</p>
      </div>
      <div className="rb-count" role="status">
        {count === null
          ? <p>Rehearse this match to see how often this rule would fire.</p>
          : count.n === 0
            ? <p><b>Would not have fired</b> in your last rehearsal.</p>
            : <p><b>Would have fired {count.n === 1 ? 'once' : `${count.n} times`}</b> in your last rehearsal: {count.examples.join(', ')}{count.n > count.examples.length ? ', …' : ''}.</p>}
        <span className="faint t-xs">Not during a full-screen graphic: rules wait until the game is back on screen.</span>
      </div>
      <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={!ready} onClick={() => void save(rehearse)}>{rule ? 'Save and try it in Rehearse' : 'Add and try it in Rehearse'}</button>
    </EditorDrawer>
  );
}
