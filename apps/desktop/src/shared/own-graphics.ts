// Your own graphics (approved mock, 14 Nov): a finished design exported from Photoshop as one PNG, with
// data boxes placed on it. Each box shows one field from a verified source: the game (Air's capture),
// Esportra (teams, rosters, schedule) or what the producer keeps in Air (event, talent, sponsors).
// The overlay side is `core/own.js`; its FIELDS list must match OWN_FIELDS here (test/own-graphics.test.ts).
import type { Screen } from './api.ts';

export type OwnKind = 'text' | 'image' | 'color';
export type OwnSource = 'game' | 'esportra' | 'air';
export interface OwnField { id: string; label: string; group: string; kind: OwnKind; source: OwnSource }

const team = (t: 0 | 1) => {
  const n = t ? 'B' : 'A';
  return [
    { id: `team.${t}.name`, label: `Team ${n} name`, group: 'Teams', kind: 'text', source: 'esportra' },
    { id: `team.${t}.tag`, label: `Team ${n} tag`, group: 'Teams', kind: 'text', source: 'esportra' },
    { id: `team.${t}.logo`, label: `Team ${n} logo`, group: 'Teams', kind: 'image', source: 'esportra' },
    { id: `team.${t}.color`, label: `Team ${n} colour`, group: 'Teams', kind: 'color', source: 'esportra' },
    { id: `team.${t}.score`, label: `Team ${n} map score`, group: 'Teams', kind: 'text', source: 'game' },
    { id: `team.${t}.series`, label: `Team ${n} maps won`, group: 'Teams', kind: 'text', source: 'game' },
  ] as OwnField[];
};
const player = (t: 0 | 1, i: number) => {
  const who = `${t ? 'B' : 'A'}${i + 1}`;
  return [
    { id: `player.${t}.${i}.name`, label: `Player ${who} name`, group: 'Players', kind: 'text', source: 'esportra' },
    { id: `player.${t}.${i}.agent`, label: `Player ${who} agent`, group: 'Players', kind: 'text', source: 'game' },
    { id: `player.${t}.${i}.kda`, label: `Player ${who} K/D/A`, group: 'Players', kind: 'text', source: 'game' },
    { id: `player.${t}.${i}.acs`, label: `Player ${who} ACS`, group: 'Players', kind: 'text', source: 'game' },
    { id: `player.${t}.${i}.portrait`, label: `Player ${who} agent picture`, group: 'Players', kind: 'image', source: 'game' },
  ] as OwnField[];
};

/** Every field a box can show, by where it comes from. Only these: no sheets, addresses or outside apps. */
export const OWN_FIELDS: OwnField[] = [
  { id: 'map.label', label: 'Map number and name', group: 'Match', kind: 'text', source: 'game' },
  { id: 'map.name', label: 'Map name', group: 'Match', kind: 'text', source: 'game' },
  { id: 'map.number', label: 'Map number', group: 'Match', kind: 'text', source: 'game' },
  { id: 'series.score', label: 'Series score', group: 'Match', kind: 'text', source: 'game' },
  { id: 'round.number', label: 'Round', group: 'Match', kind: 'text', source: 'game' },
  ...team(0), ...team(1),
  { id: 'mvp.name', label: 'Map MVP name', group: 'Map MVP', kind: 'text', source: 'game' },
  { id: 'mvp.team', label: 'Map MVP team tag', group: 'Map MVP', kind: 'text', source: 'game' },
  { id: 'mvp.agent', label: 'Map MVP agent', group: 'Map MVP', kind: 'text', source: 'game' },
  { id: 'mvp.kda', label: 'Map MVP K/D/A', group: 'Map MVP', kind: 'text', source: 'game' },
  { id: 'mvp.acs', label: 'Map MVP ACS', group: 'Map MVP', kind: 'text', source: 'game' },
  { id: 'mvp.portrait', label: 'Map MVP agent picture', group: 'Map MVP', kind: 'image', source: 'game' },
  ...[0, 1].flatMap((t) => [0, 1, 2, 3, 4].flatMap((i) => player(t as 0 | 1, i))),
  { id: 'event.name', label: 'Event name', group: 'Event and people', kind: 'text', source: 'air' },
  { id: 'event.stage', label: 'Stage', group: 'Event and people', kind: 'text', source: 'air' },
  { id: 'caster.0.name', label: 'Caster 1', group: 'Event and people', kind: 'text', source: 'air' },
  { id: 'caster.1.name', label: 'Caster 2', group: 'Event and people', kind: 'text', source: 'air' },
  { id: 'sponsor.name', label: 'Sponsor name', group: 'Event and people', kind: 'text', source: 'air' },
  { id: 'sponsor.logo', label: 'Sponsor logo', group: 'Event and people', kind: 'image', source: 'air' },
  { id: 'next.match', label: 'Next match', group: 'Event and people', kind: 'text', source: 'esportra' },
];
export const fieldOf = (id: string) => OWN_FIELDS.find((f) => f.id === id);

export interface OwnFont { id: string; name: string; url: string }
export interface OwnBox {
  id: string;
  field: string;
  /** Position and size on the 1920×1080 design. */
  x: number; y: number; w: number; h: number;
  font: string;
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  caps: 'data' | 'upper';
  fit: 'shrink' | 'cut';
  /** Shown when the field has no data yet (empty: nothing). */
  empty: string;
  /** Rounded corners for pictures and colour fills (px; 540 makes a circle). */
  radius: number;
}
export type OwnMotion = 'cut' | 'fade' | 'slide';
export interface OwnGraphic {
  id: string;
  name: string;
  /** The built-in screen it stands for (its moment and Rundown place), or 'any' (Take only). */
  purpose: string;
  style: 'full' | 'band';
  /** The design: `/air-assets/<uuid>`, a 1920×1080 PNG kept exactly as exported. */
  image: string;
  fonts: OwnFont[];
  boxes: OwnBox[];
  enter: OwnMotion;
  exit: OwnMotion;
  createdAt: number;
  updatedAt: number;
}

/** What a design can stand for: the full-screen moments, or a graphic only taken by hand. */
export const OWN_PURPOSES: Array<[string, string]> = [
  ['match-intro', 'Match intro (before map 1)'], ['map-veto', 'Map veto'], ['agent-select', 'Agent select'], ['halftime', 'Halftime (after round 12)'],
  ['map-result', 'Map result (when a map ends)'], ['series', 'Series (between maps)'], ['standings', 'Standings'], ['schedule', 'Today’s schedule'],
  ['player-profile', 'Player profile'], ['champion', 'Winner (after the series)'], ['any', 'Anything (only taken by hand)'],
];
export const BUILT_IN_FONTS = ['Barlow Condensed', 'Poppins', 'Montserrat', 'Rajdhani', 'JetBrains Mono'];

/** The screen id of an own graphic, as the Rundown, Live and the engine know it. */
export const ownScreenId = (id: string) => `own:${id}`;
export const isOwnScreen = (id: string | null | undefined): id is string => typeof id === 'string' && id.startsWith('own:');

/** The hosted screen an own graphic is in the setup (it shows in the full-screen host, never its own OBS source). */
export function ownScreen(g: Pick<OwnGraphic, 'id' | 'name'>, enabled = false): Screen {
  return { id: ownScreenId(g.id), outputId: '', scene: 'fullscreen', hosted: true, overlay: 'own', title: g.name, enabled, frame: { x: 0, y: 0, width: 1920, height: 1080 } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSET = /^\/air-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;
const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const words = (v: unknown, max: number, what: string) => {
  if (typeof v !== 'string' || v.length > max || /[<>{}]/.test(v)) throw new Error(`${what}: up to ${max} characters, no < > { }.`);
  return v.trim();
};

/** Checks a whole graphic from the interface; throws a plain message when something cannot be used. */
export function validOwn(input: unknown): OwnGraphic {
  const g = input as OwnGraphic;
  if (!g || typeof g !== 'object') throw new Error('Choose a design first.');
  if (typeof g.id !== 'string' || !UUID.test(g.id)) throw new Error('This graphic has no id. Start it again.');
  const name = words(g.name, 60, 'Name');
  if (!name) throw new Error('Give the graphic a name.');
  if (!OWN_PURPOSES.some(([id]) => id === g.purpose)) throw new Error('Choose what the graphic is for.');
  if (g.style !== 'full' && g.style !== 'band') throw new Error('Choose full screen or overlay bar.');
  if (typeof g.image !== 'string' || !ASSET.test(g.image)) throw new Error('Import the design as a PNG first.');
  if (!Array.isArray(g.fonts) || g.fonts.length > 8) throw new Error('Up to 8 fonts.');
  const fonts = g.fonts.map((f) => {
    if (!f || !UUID.test(f.id) || !ASSET.test(f.url)) throw new Error('A font could not be read. Add it again.');
    return { id: f.id, name: words(f.name, 40, 'Font name') || 'Font', url: f.url };
  });
  const fontNames = new Set([...BUILT_IN_FONTS, ...fonts.map((f) => f.name)]);
  if (!Array.isArray(g.boxes) || g.boxes.length > 60) throw new Error('Up to 60 boxes.');
  const boxes = g.boxes.map((b) => {
    if (!b || typeof b.id !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(b.id)) throw new Error('A box has no id.');
    if (!fieldOf(b.field)) throw new Error('Choose a field for every box.');
    if (!int(b.x, -1920, 1920) || !int(b.y, -1080, 1080) || !int(b.w, 8, 1920) || !int(b.h, 8, 1080)) throw new Error('A box is outside the design. Drag it back.');
    if (!fontNames.has(b.font)) throw new Error('Choose one of the fonts for every box.');
    if (!int(b.size, 8, 400)) throw new Error('Text size is 8–400 px.');
    if (typeof b.color !== 'string' || !COLOR.test(b.color)) throw new Error('Colours are #rrggbb.');
    if (!['left', 'center', 'right'].includes(b.align)) throw new Error('Choose left, centre or right.');
    if (b.caps !== 'data' && b.caps !== 'upper') throw new Error('Choose capitals as data or all caps.');
    if (b.fit !== 'shrink' && b.fit !== 'cut') throw new Error('Choose shrink to fit or cut.');
    if (!int(b.radius, 0, 540)) throw new Error('Corners are 0–540 px.');
    return { id: b.id, field: b.field, x: b.x, y: b.y, w: b.w, h: b.h, font: b.font, size: b.size, color: b.color.toLowerCase(), align: b.align, caps: b.caps, fit: b.fit, empty: words(b.empty ?? '', 40, 'Text when empty'), radius: b.radius };
  });
  const motion = (m: unknown): OwnMotion => (m === 'cut' || m === 'fade' || m === 'slide' ? m : (() => { throw new Error('Choose cut, fade or slide.'); })());
  return { id: g.id, name, purpose: g.purpose, style: g.style, image: g.image, fonts, boxes, enter: motion(g.enter), exit: motion(g.exit), createdAt: int(g.createdAt, 0, 9e15) ? g.createdAt : Date.now(), updatedAt: Date.now() };
}

/** A new box for a field, sized for its kind, at a point on the design. */
export function newBox(field: string, x: number, y: number, id: string): OwnBox {
  const f = fieldOf(field);
  const w = f?.kind === 'text' ? 360 : 200;
  const h = f?.kind === 'text' ? 64 : 200;
  return { id, field, x: Math.round(x - w / 2), y: Math.round(y - h / 2), w, h, font: 'Barlow Condensed', size: f?.kind === 'text' ? 48 : 48, color: '#ffffff', align: 'left', caps: 'data', fit: 'shrink', empty: '', radius: 0 };
}

/** Reads a PNG's size from its header (IHDR), or null when it is not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null;
  const at = (i: number) => (bytes[i]! << 24 | bytes[i + 1]! << 16 | bytes[i + 2]! << 8 | bytes[i + 3]!) >>> 0;
  return { width: at(16), height: at(20) };
}
