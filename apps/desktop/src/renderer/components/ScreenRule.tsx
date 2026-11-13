// Add a screen (approved mock): pick a screen that fits the Rundown section, then its rule — when it comes up, on which
// map, how long it stays, cut or stinger, and the hold. Edit on a rundown row opens the same drawer.
import { useState } from 'react';
import type { Snapshot } from '../../shared/api.ts';
import { SECTION_LABEL, SECTION_SCREENS, WHEN, WHEN_LABEL, rowTitle, takesItself, type RowInput, type RowMap, type RundownRow, type Section, type When } from '../../shared/autopilot.ts';
import { Preview, overlayUrl } from './Preview.tsx';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { EditorDrawer } from './Editors.tsx';
import { BAND_SCREENS, bandOverlay, lookOf } from '../../shared/look.ts';

export const mapText = (m: RowMap) => (m === 'every' ? 'Every map' : m === 'series' ? 'After the series' : `Map ${m}`);
export const onScreenText = (sec: number) => (sec ? `${sec} s` : 'Until next');
export const holdText = (r: Pick<RundownRow, 'trigger' | 'holdMode' | 'holdSeconds'>) => (r.trigger === 'manual' || r.holdMode === 'manual' ? 'Wait for me' : r.holdSeconds ? `${r.holdSeconds} s hold` : 'No hold');

const BLANK: RowInput = { section: 'game', show: null, trigger: 'manual', map: 'every', forSeconds: 0, delaySeconds: 12, transition: 'stinger', holdMode: 'manual', holdSeconds: 0 };

function Chips<T extends string | number>({ label, value, options, onChange, disabled }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="rb-chips" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => <button type="button" key={String(v)} role="radio" aria-checked={value === v} disabled={disabled} className="rb-chip" onClick={() => onChange(v)}>{text}</button>)}
    </div>
  );
}

/** The rule as one sentence: "Standings, on map 2, when you press Take, for 20 s, via the stinger." */
function sentence(d: RowInput, title: string): string {
  const where = d.map === 'every' ? 'on every map' : d.map === 'series' ? 'after the series' : `on map ${d.map}`;
  const when = d.trigger === 'manual' ? 'when you press Take' : d.trigger === 'delay' ? `${d.delaySeconds} s after the previous screen` : `when ${WHEN_LABEL[d.trigger as When].toLowerCase()}`;
  const time = d.show === null ? '' : d.forSeconds ? `, for ${d.forSeconds} s` : ', until the next screen';
  const hold = d.trigger === 'manual' ? '' : d.holdMode === 'manual' ? ', waiting for your Take' : d.holdSeconds ? `, after a ${d.holdSeconds} s hold` : '';
  return `${title}, ${where}, ${when}${time}${hold}, ${d.transition === 'stinger' ? 'via the stinger' : 'as a cut'}.`;
}

export function ScreenRule({ s, run, row, section, close }: { s: Snapshot; run: Run; row: RundownRow | null; section?: Section; close: () => void }) {
  const sec: Section = row?.section ?? section ?? 'between';
  // Only the screens that go in this part of the show.
  const allowed = SECTION_SCREENS[sec];
  const screens = s.setup.screens.filter((x) => allowed.includes(x.id));
  const [d, setD] = useState<RowInput>(row ?? { ...BLANK, section: sec, show: allowed[0] ?? null });
  const set = (patch: Partial<RowInput>) => setD({ ...d, ...patch });
  const bestOf = s.match?.bestOf ?? 1;
  const title = rowTitle(d.show, sec, (id) => screens.find((x) => x.id === id)?.title ?? id);
  const rule = takesItself(d.show);
  const manual = d.trigger === 'manual';
  const hold = manual || d.holdMode === 'manual' ? 'wait' : String(d.holdSeconds);
  const maps: Array<[string, string]> = [['every', 'Every map'], ...Array.from({ length: bestOf }, (_, i): [string, string] => [String(i + 1), `Map ${i + 1}`]), ['series', 'After the series']];
  const save = async () => {
    if (await run(() => air.rundownSave({ ...d, ...(row ? { id: row.id } : {}) }))) close();
  };
  const tiles: Array<[string | null, string, string | null]> = allowed.map((id) => [id, rowTitle(id, sec, (x) => screens.find((y) => y.id === x)?.title ?? x), id === null ? null : screens.find((y) => y.id === id)?.overlay ?? null]);
  return (
    <EditorDrawer
      title={row ? `Edit · ${title}` : `Add to ${SECTION_LABEL[sec]}`} close={close}
      footer={<><span /><span className="row-gap"><button className="btn quiet" onClick={close}>Cancel</button><button className="btn primary" onClick={() => void save()}>{row ? 'Save' : 'Add to rundown'}</button></span></>}
    >
      <div className="stack" style={{ gap: 8 }}>
        <span className="rb-k" style={{ padding: 0 }}>Screen</span>
        <div className="sr-tiles" role="radiogroup" aria-label="Screen">
          {tiles.map(([id, name, overlay]) => (
            <button key={id ?? 'game'} type="button" role="radio" aria-checked={d.show === id} aria-label={name} className="sr-tile" onClick={() => set({ show: id })}>
              <span className="sr-thumb" aria-hidden="true">{overlay ? <Preview src={overlayUrl(s, overlay)} label={name} /> : 'GAME'}</span>
              <span>{name}</span>
            </button>
          ))}
        </div>
        <span className="faint t-xs">The screens that go in {SECTION_LABEL[sec]}. Preview any of them in Graphics.</span>
      </div>
      {rule ? (<>
<hr className="rule" />
      <div className="rb">
        <span className="rb-k">When</span>
        <div className="stack" style={{ gap: 6 }}>
          <Chips<When> label="When" value={d.trigger as When} onChange={(trigger) => set({ trigger, ...(trigger === 'manual' ? { holdMode: 'manual' as const, holdSeconds: 0 } : d.trigger === 'manual' ? { holdMode: 'window' as const, holdSeconds: 3 } : {}) })} options={WHEN.map((w): [When, string] => [w, WHEN_LABEL[w]])} />
          {d.trigger === 'delay' && <Chips<number> label="Seconds after the previous screen" value={d.delaySeconds} onChange={(delaySeconds) => set({ delaySeconds })} options={[[5, '5 s'], [10, '10 s'], [12, '12 s'], [20, '20 s'], [30, '30 s']]} />}
        </div>

        <span className="rb-k">Map</span>
        <Chips<string> label="Map" value={String(d.map)} onChange={(v) => set({ map: v === 'every' || v === 'series' ? v : Number(v) })} options={maps} />

        <span className="rb-k">On screen</span>
        <Chips<number> label="On screen" value={d.forSeconds} disabled={d.show === null} onChange={(forSeconds) => set({ forSeconds })} options={[[8, '8 s'], [15, '15 s'], [20, '20 s'], [30, '30 s'], [0, 'Until next']]} />

        <span className="rb-k">Via</span>
        <Chips label="Via" value={d.transition} onChange={(transition) => set({ transition })} options={[['cut', 'Cut'], ['stinger', 'Stinger']]} />

        {d.show && BAND_SCREENS.has(d.show) && (<>
          <span className="rb-k">Look</span>
          <div className="stack" style={{ gap: 8 }}>
            <Chips label="Look" value={d.style ?? 'full'} onChange={(style) => set({ style })} options={[['full', 'Full screen'], ['band', 'Over the game']]} />
            <span className="sr-look"><Preview src={overlayUrl(s, d.style === 'band' ? bandOverlay(d.show) : screens.find((x) => x.id === d.show)?.overlay ?? d.show)} label={`${title} · ${d.style === 'band' ? 'over the game' : 'full screen'}`} /></span>
            <span className="faint t-xs">{d.style === 'band' ? 'A band over the game feed or the desk camera; the game stays on screen.' : 'Covers the whole screen.'}</span>
          </div>
        </>)}

        <span className="rb-k">Hold</span>
        <Chips<string>
          label="Hold" value={hold} disabled={manual}
          onChange={(v) => set(v === 'wait' ? { holdMode: 'manual', holdSeconds: 0 } : { holdMode: 'window', holdSeconds: Number(v) })}
          options={[['0', 'No hold'], ['3', '3 s'], ['5', '5 s'], ['10', '10 s'], ['wait', 'Wait for me']]}
        />
      </div>
      <hr className="rule" />
      <div className="stack" style={{ gap: 6 }}>
        <span className="faint t-xs">Reads as</span>
        <p className="rb-sentence">{sentence(d, title)}</p>
      </div>
      </>) : (
        <div className="stack" style={{ gap: 10 }}>
          <p className="muted t-sm">{d.show === 'in-game' ? 'The in-game HUD is on over the game; switch its parts on or off in the row.' : `${title} is its own OBS scene. Switch OBS to it when you are ready; Air never switches scenes.`}</p>
          {d.show === 'holding' && (
            <div className="stack" style={{ gap: 8 }}>
              <span className="rb-k" style={{ padding: 0 }}>Look (every break)</span>
              <Chips label="Break look" value={lookOf(s.setup.look).break} onChange={(v) => void run(() => air.updateSetup({ look: { break: v } }))} options={[['classic', 'Classic'], ['frame', 'Frame with two windows']]} />
              <span className="sr-look"><Preview src={overlayUrl(s, lookOf(s.setup.look).break === 'frame' ? 'break-frame' : 'holding')} label="Break" /></span>
              {lookOf(s.setup.look).break === 'frame' && <span className="faint t-xs">The two windows show what you put in ESPORTRA · Break window 1 and 2 in OBS (a sponsor video, a camera).</span>}
            </div>
          )}
        </div>
      )}
    </EditorDrawer>
  );
}
