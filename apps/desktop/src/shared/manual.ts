// The manual: one source for the Help page in the app and the PDF for crews. Written by situation:
// what you see, what to press. `{key:id}` is filled with the producer's own key for that action, and
// `{game}` with the game's name, so the manual always matches this PC.
import { ACTIONS, keyLabel, keyOf, type Keymap } from './keymap.ts';

export type Block = { p: string } | { steps: string[] } | { keys: string[] };

export interface ManualSection {
  id: string;
  title: string;
  blocks: Block[];
}

export const MANUAL: ManualSection[] = [
  { id: 'before', title: 'Before the show', blocks: [
    { p: 'Everything for a show is set up from its event and its match. Live comes last.' },
    { steps: [
      'Events: open your event (or make one). Branding holds its logo and colour; Talent and sponsors holds the people on air and the sponsors.',
      'Open tonight’s match from the event, or press New match. Work down its steps: Teams/Players, Talent and sponsors, Rundown, OBS, Player PCs and cameras.',
      'Overview lists anything still missing, with its fix beside it.',
      'Rehearse the match privately. Nothing reaches OBS.',
      'Press Go live at the end of the steps.',
    ] },
  ] },
  { id: 'golive', title: 'Going live', blocks: [
    { p: 'The match’s Overview lists what is ready and what is not, with a fix beside each warning. Warnings never stop you.' },
    { steps: [
      'Press Go live at the end of the match’s steps.',
      'Tick the box to allow game data. Leave it unticked to run without it.',
      'Switch autopilot on or off, then press Go live.',
      'When all three steps are done, start your stream in OBS. Air never starts or stops it.',
      'Press Open Live.',
    ] },
  ] },
  { id: 'round', title: 'A round', blocks: [
    { p: 'Graphics follow the match by themselves: score, rounds, kills and the big moments. Live shows what is on air and what happens next.' },
    { steps: [
      'Next shows autopilot’s next step with a countdown. Press {key:hold} to hold it, {key:skip} to skip it, or {key:take} to take it now.',
      'To put something up yourself, choose it from Moments or All graphics ({key:all}). It waits in Cued.',
      'Press {key:take} to take what is cued, or {key:stinger} to take it behind the stinger.',
    ] },
  ] },
  { id: 'between', title: 'Between rounds', blocks: [
    { p: 'The economy board and the round recap come up on their own in the buy phase and at round end. Switch either off in All graphics.' },
    { keys: ['layer:economy', 'layer:roundRecap'] },
  ] },
  { id: 'halftime', title: 'Halftime and map end', blocks: [
    { p: 'With autopilot on, halftime shows after the twelfth round and the map result when the map ends, each after its hold. Without autopilot, put them up from All graphics.' },
    { steps: ['Watch Next: it says which graphic comes up and when.', 'Press {key:hold} if the desk wants more time; {key:take} when ready.'] },
  ] },
  { id: 'desk', title: 'The desk', blocks: [
    { p: 'The first two people on air with a camera appear in the desk’s two windows (ESPORTRA · Desk). Someone without a camera shows their photo. Switch to the Desk scene in OBS yourself; Air never switches scenes.' },
    { steps: ['Show a person’s name with {key:talent}.', 'Read a sponsor with {key:sponsor}; the next sponsor comes up each time.'] },
  ] },
  { id: 'pause', title: 'Technical pause', blocks: [
    { p: 'Press {key:pause} for a technical pause, or {key:timeout} for a team timeout. A panel with a running clock goes on air, and autopilot waits. Press the same key again to end it.' },
  ] },
  { id: 'breaks', title: 'When something breaks', blocks: [
    { p: 'Air keeps graphics on air through every failure below. Read the line at the top of Live and press the button it offers.' },
    { p: 'The observer PC stops sending. Graphics hold the last full data and say the data is paused. Restart Esportra Player on that PC; the match carries on without resetting.' },
    { p: 'A player PC drops. That player’s health and abilities are hidden, never shown out of date. Their seat turns amber in the match’s Player PCs and cameras. Ask the player to reopen Esportra Player; it checks back in by itself.' },
    { p: 'Air restarts. Nothing changes on air. Air opens with “Recovered after a restart”; press Resume autopilot, or carry on by hand.' },
    { p: 'A camera drops. The desk shows that person’s photo instead. Send their camera link again from the match’s Player PCs and cameras.' },
    { p: 'A score or name is wrong. Press {key:fix}, correct it, and choose how long the fix lasts.' },
  ] },
  { id: 'checkin', title: 'Player check-in', blocks: [
    { p: 'For {game}, each player’s own PC adds what only players get. Open the match’s Player PCs and cameras and switch on “Allow other PCs to join”.' },
    { steps: [
      'On each player’s PC, open Esportra Player and enter the code and address shown in Player PCs and cameras.',
      'Each PC takes its seat by itself once the game lists the players.',
      'A seat says how fresh that player’s data is. Amber means it stopped.',
    ] },
  ] },
  { id: 'cameras', title: 'Talent cameras', blocks: [
    { p: 'In the event’s Talent and sponsors, give each person a camera link (they open it in a browser; nothing to install) or one of your OBS sources. Copy the link from the match’s Player PCs and cameras › Cameras. Video goes to your OBS; it is never recorded or kept.' },
  ] },
  { id: 'companion', title: 'Stream Deck and Companion', blocks: [
    { p: 'In Settings › Graphics control, choose Stream Deck / Companion, or Both. In Bitfocus Companion, add the Esportra Air connection and enter the address and key from Settings › Companion.' },
    { steps: [
      'Buttons put up full-screen graphics, lower thirds, toasts and pauses, and Take or Clear what is cued.',
      'Triggers react to the game: make a trigger on “event_count changed” with the condition “Last event is …”.',
      'The in-game HUD runs by itself and is not controlled from Companion. Air never switches scenes; Companion can, if you add that.',
    ] },
  ] },
  { id: 'keyboard', title: 'Keyboard', blocks: [
    { p: 'Change any key in Settings › Keyboard. Keys are saved on this PC.' },
    { keys: ['take', 'stinger', 'hold', 'skip', 'all', 'fix', 'pause', 'timeout', 'replay', 'toast', 'talent', 'poll', 'sponsor', 'spotlight'] },
  ] },
];

const LABEL: Record<string, string> = Object.fromEntries(ACTIONS.map((a) => [a.id, a.label]));

/** Fills `{key:id}` and `{game}`. */
export function fill(text: string, keymap: Keymap | undefined, game: string): string {
  return text.replace(/\{key:([\w:]+)\}/g, (_, id: string) => keyLabel(keyOf(keymap, id))).replace(/\{game\}/g, game);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The whole manual as one printable document (the PDF). */
export function manualHtml(keymap: Keymap | undefined, game: string, labels: Record<string, string> = LABEL): string {
  const block = (b: Block) => {
    if ('p' in b) return `<p>${esc(fill(b.p, keymap, game))}</p>`;
    if ('steps' in b) return `<ol>${b.steps.map((x) => `<li>${esc(fill(x, keymap, game))}</li>`).join('')}</ol>`;
    return `<table>${b.keys.map((id) => `<tr><td>${esc(labels[id] ?? id)}</td><td class="k">${esc(keyLabel(keyOf(keymap, id)))}</td></tr>`).join('')}</table>`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><title>Esportra Air manual</title><style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font: 10.5pt/1.5 'Segoe UI', system-ui, sans-serif; color: #111; }
  h1 { font-size: 22pt; margin: 0 0 4pt; } .sub { color: #555; margin: 0 0 16pt; }
  section { break-inside: avoid; margin: 0 0 12pt; } h2 { font-size: 13pt; margin: 0 0 4pt; }
  p, ol { margin: 0 0 6pt; } ol { padding-left: 16pt; }
  table { border-collapse: collapse; } td { padding: 2pt 12pt 2pt 0; } td.k { font-family: Consolas, monospace; font-weight: 600; }
</style></head><body><h1>Esportra Air · running a show</h1><p class="sub">${esc(game)} · the keys are this PC’s</p>${MANUAL.map((s) => `<section id="${s.id}"><h2>${esc(s.title)}</h2>${s.blocks.map(block).join('')}</section>`).join('')}</body></html>`;
}
