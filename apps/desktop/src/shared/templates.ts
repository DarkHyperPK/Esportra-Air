// Graphics templates (Graphics › Templates): a saved look for one graphic. Each part of the graphic can be
// moved, scaled, layered, hidden, faded, filled, re-typed, bordered, rounded, given depth, re-worded (fixed
// labels only) and given an entrance. The HUD applies them as inline styles only
// (esportra-valorant-hud/core/templates.js, which lists the same graphics and parts with their selectors).

/** A colour: #rrggbb, a brand-kit swatch (`brand.primary` …) or a team's colour (`team.a`, `team.b`). */
export type ColorRef = string;

export const BRAND_KEYS = ['primary', 'secondary', 'panel', 'text', 'atk', 'def'] as const;
export type BrandKey = (typeof BRAND_KEYS)[number];
export type BrandKit = Record<BrandKey, string>;
export const BRAND_NAME: Record<BrandKey, string> = { primary: 'Primary', secondary: 'Secondary', panel: 'Panel', text: 'Text', atk: 'Attack', def: 'Defence' };
/** Primary is the event's colour (EventInfo.accent); the rest are new with the kit. */
export const DEFAULT_BRAND: BrandKit = { primary: '#8b7cf6', secondary: '#ffc83d', panel: '#12162f', text: '#ffffff', atk: '#c83452', def: '#169684' };
export const SWATCHES: Array<{ ref: ColorRef; name: string }> = [
  ...BRAND_KEYS.map((k) => ({ ref: `brand.${k}`, name: `Brand ${BRAND_NAME[k].toLowerCase()}` })),
  { ref: 'team.a', name: 'Team A' }, { ref: 'team.b', name: 'Team B' },
];

export interface Fill { kind: 'none' | 'solid' | 'gradient'; a?: ColorRef; b?: ColorRef; alpha?: number; angle?: number }
export interface Border { sides: 'none' | 'all' | 'top' | 'bottom' | 'left' | 'right'; color?: ColorRef; width?: number }
export interface Entrance { kind: 'rise' | 'fade' | 'slide' | 'wipe'; ms: number; delay: number; stagger?: boolean }

/** The settings for one part; anything left out keeps the graphic's own look. */
export interface PartStyle {
  x?: number; y?: number; scale?: number; z?: number;
  hidden?: boolean; opacity?: number;
  fill?: Fill;
  color?: ColorRef; font?: FontId; weight?: number; size?: number; spacing?: number; caps?: 'upper' | 'none';
  border?: Border; radius?: number; depth?: 'none' | 'soft' | 'strong';
  /** New words for a fixed label (parts marked `words`). */
  label?: string;
  entrance?: Entrance;
}

/** The scorebug's window over the game's own round timer (HUD templates only). */
export interface TimerWindow { dx: number; width: number; plate: string }

export interface Template {
  id: string;
  name: string;
  /** `<screen>|full`, `<screen>|band` or `hud`. */
  graphic: string;
  parts: Record<string, PartStyle>;
  timer?: TimerWindow;
  createdAt: number;
  updatedAt: number;
}

export const FONTS = [
  { id: 'barlow', name: 'Barlow Condensed' }, { id: 'poppins', name: 'Poppins' }, { id: 'rajdhani', name: 'Rajdhani' },
  { id: 'montserrat', name: 'Montserrat' }, { id: 'mono', name: 'JetBrains Mono' },
] as const;
export type FontId = (typeof FONTS)[number]['id'];
/** The weights each font really has (core/fonts); others snap to the nearest so nothing is faked bold. */
export const WEIGHTS: Record<FontId, number[]> = { barlow: [600, 700, 800], poppins: [500, 600, 700, 800, 900], mono: [400, 500, 600, 700, 800], montserrat: [600, 700, 800], rajdhani: [500, 600, 700] };
export const snapWeight = (font: FontId | undefined, w: number) => (font ? WEIGHTS[font].reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a)) : w);

/** Moments the editor can show, so parts that only appear then can be styled (core/hud.js SAMPLES). */
export const SAMPLES: Record<string, Array<{ id: string; name: string }>> = {
  hud: [
    { id: 'live', name: 'Round live' }, { id: 'spike', name: 'Spike planted' }, { id: 'pause', name: 'Tech pause' }, { id: 'timeout', name: 'Timeout' },
    { id: 'banner', name: 'Kill banner' }, { id: 'poll', name: 'Poll' }, { id: 'scoreboard', name: 'Scoreboard' }, { id: 'economy', name: 'Economy' },
    { id: 'recap', name: 'Round recap' }, { id: 'duel', name: 'Duel' }, { id: 'compare', name: 'Team compare' }, { id: 'lowerthird', name: 'Lower third' }, { id: 'sponsor', name: 'Sponsor read' },
  ],
  'holding|full': [{ id: 'starting', name: 'Starting soon' }, { id: 'brb', name: 'Break' }, { id: 'ending', name: 'Ending' }],
};
/** The sample a HUD part shows in, for parts that are not on screen all the time. */
export const SHOWS_IN: Record<string, string> = {
  poll: 'poll', banner: 'banner', bannerband: 'banner', pause: 'pause', scoreboard: 'scoreboard', economy: 'economy', recap: 'recap',
  duel: 'duel', compare: 'compare', lowerthird: 'lowerthird', ltbox: 'lowerthird',
};

export const ENTRANCES: Array<{ id: Entrance['kind'] | 'none'; name: string }> = [
  { id: 'rise', name: 'Rise' }, { id: 'fade', name: 'Fade' }, { id: 'slide', name: 'Slide' }, { id: 'wipe', name: 'Wipe' }, { id: 'none', name: 'None' },
];

/** [id, label, words?]: words means a fixed label whose text can be replaced. Same order as core/templates.js. */
type Part = readonly [string, string, 1?];
const FULL: Part[] = [['background', 'Background'], ['glow', 'Glow'], ['grain', 'Grain'], ['lines', 'Lines'], ['vignette', 'Vignette'], ['corners', 'Corner marks'],
  ['crest', 'Crest'], ['topline', 'Top line'], ['toplabel', 'Top label'], ['clock', 'Clock'], ['title', 'Title', 1], ['subtitle', 'Subtitle']];
const BAND: Part[] = [['panel', 'Panel'], ['title', 'Title'], ['captions', 'Small text'], ['marks', 'Logos'], ['vs', 'VS'], ['maps', 'Map tiles'],
  ['mapnames', 'Map names'], ['boxes', 'Boxes'], ['scores', 'Scores']];
const withParts = (base: Part[], extra: Part[]) => { const out = base.slice(); for (const e of extra) { const i = out.findIndex((x) => x[0] === e[0]); if (i >= 0) out[i] = e; else out.push(e); } return out; };

export const GRAPHICS: Record<string, { title: string; parts: Part[] }> = {
  'map-veto|full': { title: 'Map veto', parts: [...FULL, ['cards', 'Map cards'], ['stamps', 'Ban stamps', 1], ['decider', 'Decider line']] },
  'match-intro|full': { title: 'Match intro', parts: [...FULL, ['sides', 'Team halves'], ['teamnames', 'Team names'], ['teamstats', 'Team lines'], ['logos', 'Logos'], ['vs', 'VS', 1], ['event', 'Event name'], ['stage', 'Stage'], ['maps', 'Map list']] },
  'agent-select|full': { title: 'Agent select', parts: [...FULL, ['vs', 'VS', 1], ['teamheads', 'Team names'], ['columns', 'Team columns'], ['cards', 'Player cards'], ['cards.picture', 'Agent picture'], ['cards.player', 'Player name'], ['cards.agent', 'Agent name'], ['cards.lock', 'Locked tag'], ['cards.strip', 'Name strip']] },
  'map-result|full': { title: 'Map result', parts: [...FULL, ['mapart', 'Map picture'], ['score', 'Score block'], ['bignumber', 'Big score'], ['mvp', 'MVP panel'], ['mvpname', 'MVP name'], ['performers', 'Top performers']] },
  'series|full': { title: 'Series', parts: [...FULL, ['cards', 'Map cards'], ['mapnames', 'Map names'], ['results', 'Results'], ['bars', 'Winner bars'], ['live', 'Live tag', 1]] },
  'halftime|full': { title: 'Halftime', parts: [...FULL, ['score', 'Score'], ['halves', 'Halves table'], ['rounds', 'Round by round'], ['note', 'Side switch note'], ['stats', 'Side stats']] },
  'standings|full': { title: 'Standings', parts: [...FULL, ['table', 'Table'], ['header', 'Table header'], ['rows', 'Table rows'], ['side', 'MVP race']] },
  'player-profile|full': { title: 'Player profile', parts: [...FULL, ['wash', 'Colour wash'], ['portrait', 'Portrait'], ['name', 'Name'], ['info', 'Team line'], ['stats', 'Stats'], ['quote', 'Quote']] },
  'schedule|full': { title: "Today's schedule", parts: [...FULL, ['list', 'List'], ['rows', 'Rows'], ['times', 'Times'], ['labels', 'Labels']] },
  'champion|full': { title: 'Champion', parts: [...FULL, ['kicker', 'Event line'], ['team', 'Team name'], ['line', 'Result line'], ['roster', 'Roster']] },
  'cam-grid|full': { title: 'Camera grid', parts: [['wall', 'Camera wall'], ['title', 'Title', 1], ['rows', 'Rows'], ['cams', 'Cameras'], ['observed', 'Observed camera']] },
  'holding|full': { title: 'Starting soon · Break · Ending', parts: [...FULL.filter((p) => !['title', 'subtitle', 'toplabel'].includes(p[0])), ['mark', 'Logo'], ['headline', 'Headline', 1], ['message', 'Message', 1], ['countdown', 'Countdown'], ['countlabel', 'Countdown label', 1], ['next', 'Up next panel'], ['nextteams', 'Up next teams'], ['schedule', 'Schedule'], ['schedrows', 'Schedule rows'], ['social', 'Social line']] },
  'holding|band': { title: 'Break frame', parts: [['frame', 'Frame'], ['windows', 'Windows'], ['clock', 'Clock'], ['title', 'Event line'], ['eventmark', 'Event logo'], ['bottom', 'Score row'], ['marks', 'Logos'], ['teamnames', 'Team names'], ['scores', 'Scores'], ['vs', 'VS'], ['next', 'Next line']] },
  'casters|full': { title: 'Desk', parts: [['corners', 'Corner marks'], ['crest', 'Crest'], ['topline', 'Top line'], ['toplabel', 'Top label', 1], ['clock', 'Clock'], ['heading', 'Heading'], ['subheading', 'Match line'], ['frames', 'Camera frames'], ['plates', 'Name plates'], ['names', 'Names'], ['handles', 'Handles']] },
  'map-veto|band': { title: 'Map veto', parts: withParts(BAND, [['title', 'Title', 1], ['labels', 'Action labels'], ['decider', 'Decider label'], ['pickcaps', 'Pick captions']]) },
  'agent-select|band': { title: 'Agent select', parts: [...BAND, ['teams', 'Team names'], ['sides', 'Side tags'], ['agents', 'Agent cards'], ['agents.picture', 'Agent picture'], ['agents.player', 'Player name'], ['agents.agent', 'Agent name'], ['agents.lock', 'Locked tag'], ['agents.line', 'Team underline'], ['agentnames', 'Name strip'], ['series', 'Series box']] },
  'match-intro|band': { title: 'Match intro', parts: [...BAND, ['teamnames', 'Team names'], ['lineup', 'Lineup row'], ['faces', 'Faces'], ['players', 'Player names']] },
  'map-result|band': { title: 'Map result', parts: [...BAND] },
  'series|band': { title: 'Series', parts: [...BAND] },
  'halftime|band': { title: 'Halftime', parts: [...BAND] },
  'standings|band': { title: 'Standings', parts: [...BAND, ['cells', 'Team cells']] },
  'player-profile|band': { title: 'Player profile', parts: [...BAND, ['photo', 'Photo'], ['name', 'Name'], ['stats', 'Stats']] },
  'schedule|band': { title: "Today's schedule", parts: withParts(BAND, [['title', 'Title', 1]]) },
  hud: { title: 'In-game HUD', parts: [
    ['scorebug', 'Scorebug'], ['sbteams', 'Scorebug · teams'], ['sbscores', 'Scorebug · scores'], ['sbround', 'Scorebug · round'], ['sbstatus', 'Scorebug · status'],
    ['players', 'Player cards'], ['playerrows', 'Player card rows'], ['playercams', 'Player cameras'], ['killfeed', 'Killfeed'], ['killrows', 'Killfeed rows'],
    ['minimap', 'Minimap frame'], ['eventbug', 'Event bug'], ['seriesmaps', 'Series maps'], ['winprob', 'Win probability'], ['roundhistory', 'Round history'],
    ['ticker', 'Ticker'], ['poll', 'Poll'], ['observed', 'Observed player'], ['sponsor', 'Sponsor'], ['recap', 'Round recap'], ['economy', 'Economy'],
    ['duel', 'Duel'], ['compare', 'Team compare'], ['scoreboard', 'Scoreboard'], ['banner', 'Banners'], ['bannerband', 'Banner band'], ['pause', 'Pause box'],
    ['replay', 'Replay tag'], ['lowerthird', 'Lower third'], ['ltbox', 'Lower third box'],
  ] },
};

/** The overlay page the editor previews for a graphic. */
export function graphicPage(graphic: string): string {
  if (graphic === 'hud') return 'ingame';
  const [screen, style] = graphic.split('|');
  return style === 'band' ? `${screen === 'holding' ? 'break-frame' : `${screen}-band`}` : screen!;
}
export const graphicKey = (screen: string, style: 'full' | 'band') => `${screen}|${style}`;
export const graphicScreen = (graphic: string) => (graphic === 'hud' ? null : graphic.split('|')[0]!);
export const graphicStyle = (graphic: string): 'full' | 'band' => (graphic.endsWith('|band') ? 'band' : 'full');
export const graphicTitle = (graphic: string) => {
  const g = GRAPHICS[graphic];
  if (!g) return 'Unknown graphic';
  return graphic === 'hud' || graphic.startsWith('holding|') || graphic.startsWith('casters|') ? g.title : `${g.title} · ${graphicStyle(graphic) === 'band' ? 'Overlay bar' : 'Full screen'}`;
};
export const partsOf = (graphic: string) => GRAPHICS[graphic]?.parts ?? [];
/** Layers drawn inside another (17 Nov): "agents.picture" sits under "agents" in the layers list. */
export const parentOf = (id: string) => (id.includes('.') ? id.split('.')[0]! : id === 'agentnames' ? 'agents' : null);

const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
export function validColor(v: unknown): v is ColorRef {
  return typeof v === 'string' && (HEX.test(v) || (v.startsWith('brand.') && (BRAND_KEYS as readonly string[]).includes(v.slice(6))) || v === 'team.a' || v === 'team.b');
}

function range(v: unknown, lo: number, hi: number, what: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${what} must be between ${lo} and ${hi}.`);
  return Math.round(v * 1000) / 1000;
}
function colorOf(v: unknown, what: string): ColorRef | undefined {
  if (v === undefined || v === null) return undefined;
  if (!validColor(v)) throw new Error(`${what}: choose a swatch or a colour like #12ab34.`);
  return v;
}
const drop = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** One part's settings, checked and trimmed to what the HUD understands. */
export function validPart(input: unknown, label: string, words: boolean): PartStyle {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${label}: settings are missing.`);
  const p = input as Record<string, unknown>;
  const known = new Set(['x', 'y', 'scale', 'z', 'hidden', 'opacity', 'fill', 'color', 'font', 'weight', 'size', 'spacing', 'caps', 'border', 'radius', 'depth', 'label', 'entrance']);
  for (const k of Object.keys(p)) if (!known.has(k)) throw new Error(`${label}: unknown setting “${k}”.`);
  const out: PartStyle = {
    x: range(p.x, -1920, 1920, `${label} · X`), y: range(p.y, -1080, 1080, `${label} · Y`), scale: range(p.scale, 0.25, 3, `${label} · scale`),
    z: p.z === undefined ? undefined : Math.round(range(p.z, -9, 9, `${label} · layer`)!), opacity: range(p.opacity, 0, 1, `${label} · opacity`),
    color: colorOf(p.color, `${label} · text colour`), weight: range(p.weight, 400, 900, `${label} · weight`), size: range(p.size, 6, 240, `${label} · size`),
    spacing: range(p.spacing, -0.1, 0.6, `${label} · spacing`), radius: range(p.radius, 0, 80, `${label} · corners`),
  };
  if (p.hidden !== undefined) { if (typeof p.hidden !== 'boolean') throw new Error(`${label}: shown or hidden.`); if (p.hidden) out.hidden = true; }
  if (p.font !== undefined) { if (!FONTS.some((f) => f.id === p.font)) throw new Error(`${label}: choose one of the fonts Air has.`); out.font = p.font as FontId; }
  if (out.weight !== undefined) out.weight = snapWeight(out.font, Math.round(out.weight / 100) * 100);
  if (p.caps !== undefined) { if (p.caps !== 'upper' && p.caps !== 'none') throw new Error(`${label}: capitals or as typed.`); out.caps = p.caps; }
  if (p.depth !== undefined) { if (!['none', 'soft', 'strong'].includes(p.depth as string)) throw new Error(`${label}: depth is none, soft or strong.`); out.depth = p.depth as PartStyle['depth']; }
  if (p.fill !== undefined) {
    const f = p.fill as Record<string, unknown>;
    if (!f || typeof f !== 'object' || !['none', 'solid', 'gradient'].includes(f.kind as string)) throw new Error(`${label}: fill is none, solid or a gradient.`);
    const fill: Fill = drop({ kind: f.kind as Fill['kind'], a: colorOf(f.a, `${label} · fill`), b: colorOf(f.b, `${label} · second fill colour`), alpha: range(f.alpha, 0, 1, `${label} · fill opacity`), angle: range(f.angle, 0, 360, `${label} · gradient angle`) });
    if (fill.kind !== 'none' && !fill.a) throw new Error(`${label}: choose a fill colour.`);
    if (fill.kind === 'gradient' && !fill.b) throw new Error(`${label}: a gradient needs a second colour.`);
    out.fill = fill;
  }
  if (p.border !== undefined) {
    const b = p.border as Record<string, unknown>;
    if (!b || typeof b !== 'object' || !['none', 'all', 'top', 'bottom', 'left', 'right'].includes(b.sides as string)) throw new Error(`${label}: choose which sides have a border.`);
    const border: Border = drop({ sides: b.sides as Border['sides'], color: colorOf(b.color, `${label} · border colour`), width: range(b.width, 0, 16, `${label} · border width`) });
    if (border.sides !== 'none' && (!border.color || border.width === undefined)) throw new Error(`${label}: a border needs a colour and a width.`);
    out.border = border;
  }
  if (p.label !== undefined) {
    if (!words) throw new Error(`${label}: these words come from the match and can't be replaced.`);
    if (typeof p.label !== 'string' || p.label.length > 40 || /[<>]/.test(p.label)) throw new Error(`${label}: up to 40 characters, without < or >.`);
    out.label = p.label;
  }
  if (p.entrance !== undefined) {
    const e = p.entrance as Record<string, unknown>;
    if (!e || typeof e !== 'object' || !['rise', 'fade', 'slide', 'wipe'].includes(e.kind as string)) throw new Error(`${label}: choose rise, fade, slide or wipe.`);
    out.entrance = drop({ kind: e.kind as Entrance['kind'], ms: range(e.ms ?? 600, 0, 3000, `${label} · entrance time`)!, delay: range(e.delay ?? 0, 0, 3000, `${label} · entrance delay`)!, stagger: e.stagger === true ? true : undefined });
  }
  return drop(out);
}

/** A template from the editor or an imported file, checked against the graphic's parts. */
export function validTemplate(input: unknown, now = Date.now()): Template {
  if (!input || typeof input !== 'object') throw new Error('That is not a template.');
  const t = input as Record<string, unknown>;
  if (typeof t.id !== 'string' || !ID.test(t.id)) throw new Error('A template needs an id (letters, numbers, - and _).');
  const name = typeof t.name === 'string' ? t.name.trim() : '';
  if (!name || name.length > 60) throw new Error('Name the template (up to 60 characters).');
  if (typeof t.graphic !== 'string' || !GRAPHICS[t.graphic]) throw new Error('Choose which graphic the template is for.');
  const parts: Record<string, PartStyle> = {};
  const raw = t.parts && typeof t.parts === 'object' && !Array.isArray(t.parts) ? (t.parts as Record<string, unknown>) : {};
  for (const [id, v] of Object.entries(raw)) {
    const part = partsOf(t.graphic).find((p) => p[0] === id);
    if (!part) throw new Error(`“${id}” is not a part of ${graphicTitle(t.graphic)}.`);
    const style = validPart(v, part[1], !!part[2]);
    if (Object.keys(style).length) parts[id] = style;
  }
  const out: Template = { id: t.id, name, graphic: t.graphic, parts, createdAt: typeof t.createdAt === 'number' ? t.createdAt : now, updatedAt: now };
  if (t.timer !== undefined && t.timer !== null) {
    if (t.graphic !== 'hud') throw new Error('Only the in-game HUD has a timer window.');
    const w = t.timer as Record<string, unknown>;
    out.timer = { dx: Math.round(range(w.dx ?? 0, -200, 200, 'Timer window position')!), width: Math.round(range(w.width ?? 160, 100, 240, 'Timer window width')!), plate: typeof w.plate === 'string' && HEX.test(w.plate) ? w.plate.toLowerCase() : '#17181e' };
  }
  return out;
}

/** An event's brand kit; Primary is the event colour. Missing colours take the defaults. */
export function validBrand(input: unknown, accent?: string): BrandKit {
  const k = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_BRAND };
  for (const key of BRAND_KEYS) {
    const v = key === 'primary' && accent !== undefined && k.primary === undefined ? accent : k[key];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' || !HEX.test(v)) throw new Error(`${BRAND_NAME[key]}: use a colour like #12ab34.`);
    out[key] = v.toLowerCase();
  }
  return out;
}

export const newTemplateId = () => `tpl-${Math.random().toString(36).slice(2, 10)}`;

/** The templates that fit a screen in a Rundown row (both styles where the screen has an over-the-game version). */
export function templatesFor(templates: Template[], screen: string): Template[] {
  return templates.filter((t) => graphicScreen(t.graphic) === screen);
}
