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
  x?: number; y?: number; scale?: number;
  /** Layer order among its siblings (higher is in front), set by dragging in the Layers panel. */
  z?: number;
  hidden?: boolean; opacity?: number;
  /** Editor only: a locked layer can't be picked on the picture (20 Nov). */
  locked?: boolean;
  fill?: Fill;
  color?: ColorRef; font?: FontId; weight?: number; size?: number; spacing?: number; caps?: 'upper' | 'none';
  border?: Border; radius?: number; depth?: 'none' | 'soft' | 'strong';
  /** New words for a fixed label (parts marked `words`). */
  label?: string;
  /** A picture from a game pack or the producer's uploads, on a part listed in SLOTS (20 Nov). */
  picture?: PartPicture;
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
  brhud: [{ id: 'rail', name: 'Points rail' }, { id: 'grid', name: 'Points grid' }, { id: 'strip', name: 'Top strip' }, { id: 'moments', name: 'Moments' }],
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
  if (graphic === 'brhud') return 'br-hud';
  const [screen, style] = graphic.split('|');
  return style === 'band' ? `${screen === 'holding' ? 'break-frame' : `${screen}-band`}` : screen!;
}
export const graphicKey = (screen: string, style: 'full' | 'band') => `${screen}|${style}`;
export const graphicScreen = (graphic: string) => (graphic === 'hud' || graphic === 'brhud' ? null : graphic.split('|')[0]!);
export const graphicStyle = (graphic: string): 'full' | 'band' => (graphic.endsWith('|band') ? 'band' : 'full');
export const graphicTitle = (graphic: string) => {
  const g = GRAPHICS[graphic];
  if (!g) return 'Unknown graphic';
  return graphic === 'hud' || graphic === 'brhud' || graphic.startsWith('holding|') || graphic.startsWith('casters|') ? g.title : `${g.title} · ${graphicStyle(graphic) === 'band' ? 'Overlay bar' : 'Full screen'}`;
};
// FINE LAYERS (generated by dev/parts-extra.py) ›
/** Every visible text, picture and shape of each graphic has its own part (17 Nov parts audit). */
const EXTRA: Record<string, Part[]> = {
    'map-veto|full': [['teams', 'Team blocks'], ['teams.logo', 'Team logos'], ['teams.name', 'Team names'], ['teams.tag', 'Team tags'], ['cards.head', 'Step header'], ['cards.number', 'Step number'], ['cards.picture', 'Map picture box'], ['cards.image', 'Map picture'], ['cards.strike', 'Ban strike'], ['cards.map', 'Map name'], ['cards.team', 'Team line'], ['cards.logo', 'Team logo'], ['cards.note', 'Action note']],
    'match-intro|full': [['sides.wash', 'Team colour wash'], ['maps.card', 'Map cards'], ['maps.picture', 'Map pictures'], ['maps.name', 'Map names'], ['maps.result', 'Map results']],
    'agent-select|full': [['teamheads.logo', 'Team logos'], ['teamheads.name', 'Team names'], ['teamheads.side', 'Side tags'], ['vs.title', 'Title', 1], ['vs.map', 'Map line'], ['mapcard', 'Map card'], ['mapcard.picture', 'Map picture'], ['mapcard.name', 'Map name'], ['mapcard.series', 'Series score'], ['mapcard.serieslabel', 'Series label'], ['mapcard.wins', 'Map wins'], ['mapcard.played', 'Maps played'], ['count', 'Locked count']],
    'map-result|full': [['score.map', 'Map line'], ['score.winner', 'Winner line'], ['mvp.picture', 'MVP picture'], ['mvp.label', 'MVP label', 1], ['mvp.team', 'MVP team and agent'], ['mvp.stats', 'MVP numbers'], ['mvp.statlabels', 'MVP number labels'], ['performers.title', 'Top performers title', 1], ['performers.rows', 'Performer rows'], ['performers.picture', 'Performer pictures'], ['performers.name', 'Performer names'], ['performers.line', 'Performer lines']],
    'series|full': [['cards.picture', 'Map pictures'], ['cards.shade', 'Picture shade'], ['cards.number', 'Map numbers'], ['cards.pick', 'Pick line'], ['results.team', 'Result teams'], ['results.score', 'Result scores']],
    'halftime|full': [['score.tags', 'Team tags'], ['score.value', 'Half score'], ['halves.head', 'Table header'], ['halves.team', 'Team names'], ['halves.value', 'Table numbers'], ['halves.side', 'Side labels'], ['rounds.title', 'Round by round title', 1], ['rounds.cells', 'Round cells'], ['rounds.number', 'Round numbers'], ['rounds.icon', 'Round icons'], ['stats.value', 'Stat numbers'], ['stats.label', 'Stat labels']],
    'standings|full': [['header.rank', 'Rank header'], ['header.team', 'Team header'], ['header.cols', 'Column headers'], ['rows.rank', 'Ranks'], ['rows.team', 'Team names'], ['rows.cols', 'Columns'], ['side.title', 'MVP race title', 1], ['side.name', 'MVP name'], ['side.line', 'MVP line']],
    'player-profile|full': [['info.agent', 'Agent and stage'], ['stats.value', 'Stat numbers'], ['stats.label', 'Stat labels']],
    'schedule|full': [['rows.match', 'Matches'], ['rows.vs', 'vs'], ['rows.next', 'Next up tag'], ['rows.note', 'Notes']],
    'champion|full': [['roster.names', 'Roster names'], ['roster.pictures', 'Roster pictures']],
    'holding|full': [['next.label', 'Up next label'], ['next.tags', 'Up next tags'], ['next.vs', 'Up next vs'], ['next.names', 'Up next names'], ['schedrows.time', 'Schedule times'], ['schedrows.match', 'Schedule matches'], ['schedrows.label', 'Schedule labels']],
    'holding|band': [['teamnames.name', 'Team names'], ['teamnames.tag', 'Team tags']],
    'map-veto|band': [['maps.number', 'Step numbers'], ['labels.team', 'Label teams'], ['labels.action', 'Label actions'], ['labels.decider', 'Decider word']],
    'agent-select|band': [['series.score', 'Series score']],
    'match-intro|band': [['main', 'Main panel'], ['lineup.team', 'Lineup team names']],
    'standings|band': [['cells.record', 'Records']],
    'player-profile|band': [['stats.value', 'Stat numbers']],
    'hud': [['eventbug.logo', 'Event logo'], ['eventbug.name', 'Event name'], ['eventbug.stage', 'Stage'], ['seriesmaps.tiles', 'Map tiles'], ['seriesmaps.names', 'Map names'], ['seriesmaps.scores', 'Map scores'], ['sbteams.logo', 'Logos'], ['sbteams.tag', 'Team tags'], ['sbteams.name', 'Team names'], ['scorebug.wins', 'Map wins'], ['scorebug.spike', 'Spike icon'], ['scorebug.spiketime', 'Spike timer'], ['winprob.value', 'Percentages'], ['winprob.bar', 'Bar'], ['winprob.fill', 'Bar fill'], ['winprob.label', 'Label', 1], ['killrows.killeragent', 'Killer agent'], ['killrows.killer', 'Killer name'], ['killrows.weapon', 'Weapon'], ['killrows.victim', 'Victim name'], ['killrows.victimagent', 'Victim agent'], ['playerrows.agentbox', 'Agent box'], ['playerrows.agent', 'Agent picture'], ['playerrows.ult', 'Ult icon'], ['playerrows.name', 'Player name'], ['playerrows.shield', 'Shield'], ['playerrows.health', 'Health number'], ['playerrows.healthbar', 'Health bar'], ['playerrows.healthfill', 'Health fill'], ['playerrows.abilities', 'Ability icons'], ['playerrows.charges', 'Ability charges'], ['playerrows.weapon', 'Weapon'], ['playerrows.creditsicon', 'Credits icon'], ['playerrows.credits', 'Credits'], ['playerrows.kda', 'K/D/A'], ['playerrows.loadout', 'Loadout icon'], ['observed.portraitbox', 'Portrait box'], ['observed.portrait', 'Portrait'], ['observed.team', 'Team and agent'], ['observed.name', 'Name'], ['observed.weapon', 'Weapon'], ['observed.credits', 'Credits'], ['observed.kda', 'K/D/A'], ['observed.health', 'Health'], ['observed.healthlabel', 'Health label'], ['observed.healthicon', 'Health icon'], ['observed.healthbar', 'Health bar'], ['observed.healthfill', 'Health fill'], ['observed.keys', 'Ability keys'], ['observed.abilitybox', 'Ability boxes'], ['observed.abilities', 'Ability icons'], ['observed.charges', 'Charges'], ['observed.ultpoints', 'Ult points'], ['sponsor.label', 'Label', 1], ['sponsor.name', 'Sponsor name'], ['sponsor.line', 'Sponsor line'], ['ltbox.kicker', 'Kicker'], ['ltbox.title', 'Title'], ['ltbox.subtitle', 'Subtitle'], ['lowerthird.accent', 'Accent'], ['lowerthird.name', 'Caster name'], ['lowerthird.handle', 'Caster handle'], ['pause.title', 'Pause title'], ['pause.time', 'Pause time'], ['banner.portrait', 'Portrait'], ['banner.headline', 'Headline'], ['banner.detail', 'Detail'], ['poll.label', 'Label', 1], ['poll.question', 'Question'], ['poll.options', 'Option names'], ['poll.bar', 'Option bars'], ['poll.fill', 'Option fills'], ['poll.percent', 'Percentages'], ['poll.votes', 'Votes'], ['scoreboard.dim', 'Dim backdrop'], ['scoreboard.title', 'Title', 1], ['scoreboard.map', 'Map line'], ['scoreboard.teams', 'Team blocks'], ['scoreboard.teamname', 'Team names'], ['scoreboard.teamscore', 'Team scores'], ['scoreboard.cols', 'Columns'], ['scoreboard.agents', 'Agent icons'], ['scoreboard.players', 'Player names'], ['scoreboard.loadout', 'Agent and weapon'], ['scoreboard.mvp', 'MVP tag'], ['roundhistory.label', 'Header label'], ['roundhistory.rounds', 'Round numbers'], ['roundhistory.now', 'Current round'], ['roundhistory.teams', 'Team tags'], ['roundhistory.cells', 'Round cells'], ['roundhistory.icons', 'Result icons'], ['roundhistory.half', 'Half mark'], ['economy.teams', 'Team panels'], ['economy.head', 'Team headers'], ['economy.score', 'Scores'], ['economy.name', 'Team names'], ['economy.side', 'Sides'], ['economy.summary', 'Phase'], ['economy.bonus', 'Loss bonus'], ['economy.bank', 'Bank'], ['economy.banklabel', 'Bank label'], ['economy.econbox', 'Credits box'], ['economy.credits', 'Credits'], ['economy.change', 'Change'], ['economy.abilitybox', 'Abilities box'], ['economy.abilities', 'Ability icons'], ['economy.kit', 'Kit box'], ['economy.ult', 'Ult icon'], ['economy.ultpoints', 'Ult points'], ['economy.charges', 'Ability charges'], ['economy.weapon', 'Weapon'], ['economy.armor', 'Armor icon'], ['economy.armorlabel', 'Armor label'], ['economy.identity', 'Player box'], ['economy.agent', 'Agent icon'], ['economy.player', 'Player name'], ['economy.agentname', 'Agent name'], ['economy.kda', 'K/D/A'], ['economy.kdalabel', 'K/D/A label'], ['recap.head', 'Header'], ['recap.icon', 'Result icon'], ['recap.result', 'Result'], ['recap.title', 'Round winner line'], ['recap.agents', 'Agent icons'], ['recap.names', 'Player names'], ['recap.labels', 'Labels'], ['recap.values', 'Numbers'], ['recap.footer', 'Footer labels'], ['recap.footervalues', 'Footer numbers'], ['duel.backs', 'Player backs'], ['duel.pictures', 'Pictures'], ['duel.shade', 'Picture shade'], ['duel.names', 'Names'], ['duel.teams', 'Team and agent'], ['duel.title', 'Title'], ['duel.values', 'Numbers'], ['duel.labels', 'Labels'], ['compare.title', 'Title'], ['compare.teams', 'Team tags'], ['compare.bars', 'Bars'], ['compare.values', 'Numbers'], ['compare.labels', 'Labels']],
};
for (const [g, parts] of Object.entries(EXTRA)) GRAPHICS[g]!.parts.push(...parts);
// ‹ FINE LAYERS
/** Battle royale graphics (core/br.js) belong to lobby games; every other graphic to versus games. */
export const isLobbyGraphic = (graphic: string) => graphic === 'brhud' || graphic.startsWith('br-');
export const graphicsFor = (shape: 'versus' | 'lobby') => Object.keys(GRAPHICS).filter((g) => isLobbyGraphic(g) === (shape === 'lobby'));
export const partsOf = (graphic: string) => GRAPHICS[graphic]?.parts ?? [];

// ── Picture slots (20 Nov): parts whose picture a template may replace. Same as SLOTS in core/templates.js. ──
export type SlotKind = 'character' | 'map' | 'vehicle' | 'item' | 'background' | 'logo-esports' | 'logo-game' | 'logo-ci' | 'any';
export interface PartPicture { src: string; kind: import('./game-assets.ts').AssetKind; fit?: 'cover' | 'contain'; flip?: boolean }
export const SLOTS: Record<string, Record<string, SlotKind>> = {};
// BR PARTS (generated by dev/br-parts.py) ›
/** Battle royale graphics (22 Nov, core/br.js). */
GRAPHICS["brhud"] = { title: "Battle royale HUD", parts: [['rail', 'Points rail'], ['rail.head', 'Rail header'], ['rail.title', 'Rail title', 1], ['rail.match', 'Rail match line'], ['rail.sub', 'Rail info bar'], ['rail.subtext', 'Rail info line'], ['rail.rows', 'Rail rows'], ['rail.bars', 'Points bars'], ['rail.mpline', 'Match point line'], ['rail.rank', 'Ranks'], ['rail.logo', 'Team logos'], ['rail.name', 'Team tags'], ['rail.mp', 'Match point tag', 1], ['rail.pips', 'Alive marks'], ['rail.points', 'Points'], ['rail.key', 'Key'], ['chip', 'Match chip'], ['chip.match', 'Match block'], ['chip.number', 'Match number'], ['chip.of', 'Match count'], ['chip.map', 'Map picture'], ['chip.event', 'Map and event'], ['chip.mapname', 'Map name'], ['chip.line', 'Event line'], ['grid', 'Points grid'], ['grid.title', 'Grid title', 1], ['grid.match', 'Grid match line'], ['grid.count', 'Alive count'], ['grid.tiles', 'Tiles'], ['grid.lead', 'Leader tile'], ['grid.rank', 'Ranks'], ['grid.name', 'Team tags'], ['grid.points', 'Points'], ['grid.pips', 'Alive marks'], ['strip', 'Top strip'], ['strip.match', 'Strip match'], ['strip.teams', 'Strip teams'], ['strip.rank', 'Strip ranks'], ['strip.logo', 'Strip logos'], ['strip.name', 'Strip tags'], ['strip.points', 'Strip points'], ['strip.alive', 'Teams left'], ['strip.alivenum', 'Teams left number'], ['popup', 'Standings pop-up'], ['popup.title', 'Pop-up title', 1], ['popup.line', 'Pop-up line'], ['popup.match', 'Pop-up match'], ['popup.body', 'Pop-up table'], ['popup.rows', 'Pop-up rows'], ['popup.rank', 'Pop-up ranks'], ['popup.logo', 'Pop-up logos'], ['popup.name', 'Pop-up names'], ['popup.pips', 'Pop-up alive marks'], ['popup.points', 'Pop-up points'], ['elim', 'Team eliminated'], ['elim.cam', 'Kill-cam frame'], ['elim.corners', 'Frame corners'], ['elim.logo', 'Team logo'], ['elim.text', 'Text plate'], ['elim.word', 'Eliminated word', 1], ['elim.name', 'Team name'], ['elim.line', 'Points and teams left'], ['elim.place', 'Place'], ['elim.hazard', 'Hazard stripe'], ['moment', 'Moments'], ['moment.word', 'Moment word'], ['moment.logo', 'Moment team logo'], ['moment.name', 'Moment name'], ['moment.line', 'Moment line'], ['moment.bar', 'Zone bar'], ['ltf', 'Live top fraggers'], ['ltf.word', 'Top fraggers word', 1], ['ltf.players', 'Top fragger rows'], ['ltf.rank', 'Top fragger ranks'], ['ltf.logo', 'Top fragger logos'], ['ltf.name', 'Top fragger names'], ['ltf.kills', 'Top fragger elims']] };
SLOTS["brhud"] = {"chip.map": "map"};
GRAPHICS["br-lobby|full"] = { title: "Starting soon", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['header', 'Header'], ['header.logo', 'Esports logo'], ['header.rule', 'Header line'], ['header.event', 'Event line'], ['header.eventmark', 'Event line marks'], ['header.title', 'Title', 1], ['header.context', 'Context'], ['header.dots', 'Context dots'], ['header.progress', 'Progress marks'], ['header.card', 'Context card'], ['emblem', 'Event emblem'], ['emblem.picture', 'Emblem picture'], ['emblem.text', 'Emblem name'], ['emblem.name', 'Emblem words'], ['countdown.label', 'Countdown label'], ['countdown', 'Countdown digits'], ['countdown.colon', 'Colon'], ['facts', 'Facts'], ['facts.label', 'Fact labels'], ['facts.value', 'Fact values'], ['facts.small', 'Fact small text'], ['standings.title', 'Standings title'], ['standings', 'Standings rows'], ['standings.rank', 'Ranks'], ['standings.logo', 'Team logos'], ['standings.name', 'Team names'], ['standings.points', 'Points'], ['standings.unit', 'Points word'], ['map', 'Tactical map'], ['map.picture', 'Map picture'], ['map.letters', 'Grid letters'], ['map.numbers', 'Grid numbers'], ['map.jump', 'Jump marker'], ['map.north', 'North arrow'], ['map.n', 'North letter']] };
SLOTS["br-lobby|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "emblem.picture": "any", "map.picture": "map"};
GRAPHICS["br-today|full"] = { title: "Today's matches", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['header', 'Header'], ['header.logo', 'Esports logo'], ['header.rule', 'Header line'], ['header.event', 'Event line'], ['header.eventmark', 'Event line marks'], ['header.title', 'Title', 1], ['header.context', 'Context'], ['header.dots', 'Context dots'], ['header.progress', 'Progress marks'], ['header.card', 'Context card'], ['day.label', 'Day labels'], ['day.number', 'Day number'], ['stops', 'Matches'], ['stops.disc', 'Map discs'], ['stops.picture', 'Map pictures'], ['stops.number', 'Match numbers'], ['stops.name', 'Map names'], ['stops.status', 'Status tags'], ['stops.winner', 'Winner tags'], ['stops.logo', 'Winner logos'], ['stops.team', 'Winner names'], ['stops.win', 'Winner word']] };
SLOTS["br-today|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "stops.picture": "map"};
GRAPHICS["br-rankings|full"] = { title: "Match results", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['header', 'Header'], ['header.logo', 'Esports logo'], ['header.rule', 'Header line'], ['header.event', 'Event line'], ['header.eventmark', 'Event line marks'], ['header.title', 'Title'], ['header.context', 'Context'], ['header.dots', 'Context dots'], ['header.progress', 'Progress marks'], ['header.card', 'Context card'], ['mapcard', 'Map card'], ['mapcard.picture', 'Map picture'], ['mapcard.name', 'Map name'], ['table', 'Table'], ['table.head', 'Column heads'], ['table.rows', 'Rows'], ['table.rank', 'Ranks'], ['table.logo', 'Team logos'], ['table.name', 'Team names'], ['table.mp', 'Match point tags'], ['table.cols', 'Numbers'], ['table.bar', 'Bars'], ['table.fill', 'Bar fills'], ['table.elims', 'Elimination marks'], ['table.mpline', 'Match point line'], ['table.total', 'Points'], ['players', 'Players'], ['players.photo', 'Player photos'], ['players.shadow', 'No-photo shadows'], ['winner', 'Winner block'], ['badge.place', 'Winner place'], ['badge', 'Winner plate'], ['badge.name', 'Winner name'], ['badge.line', 'Winner line'], ['key', 'Key'], ['key.marks', 'Key marks'], ['empty', 'Waiting note', 1]] };
SLOTS["br-rankings|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "mapcard.picture": "map"};
GRAPHICS["br-overall|full"] = { title: "Overall standings", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['header', 'Header'], ['header.logo', 'Esports logo'], ['header.rule', 'Header line'], ['header.event', 'Event line'], ['header.eventmark', 'Event line marks'], ['header.title', 'Title', 1], ['header.context', 'Context'], ['header.dots', 'Context dots'], ['header.progress', 'Progress marks'], ['header.card', 'Context card'], ['table', 'Table'], ['table.head', 'Column heads'], ['table.rows', 'Rows'], ['table.rank', 'Ranks'], ['table.logo', 'Team logos'], ['table.name', 'Team names'], ['table.mp', 'Match point tags'], ['table.cols', 'Numbers'], ['table.bar', 'Bars'], ['table.fill', 'Bar fills'], ['table.elims', 'Elimination marks'], ['table.mpline', 'Match point line'], ['table.total', 'Points'], ['leader', 'Leader card'], ['leader.label', 'Leader label', 1], ['leader.name', 'Leader name'], ['leader.line', 'Leader points'], ['header.mp', 'Match point tag']] };
SLOTS["br-overall|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item"};
GRAPHICS["br-wwcd|full"] = { title: "WWCD", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['logo', 'Esports logo'], ['players', 'Players'], ['players.photo', 'Player photos'], ['players.shadow', 'No-photo shadows'], ['flares', 'Flares'], ['shards', 'Shards'], ['word', 'Winner word'], ['word.depth', 'Word depth'], ['word.face', 'Word face'], ['subline', 'Winner line', 1], ['team', 'Team plate'], ['team.match', 'Match'], ['team.name', 'Team name'], ['team.logo', 'Team logo'], ['team.points', 'Points block'], ['team.value', 'Points number'], ['team.unit', 'Points word', 1], ['stats', 'Player plates'], ['stats.name', 'Player names'], ['stats.label', 'Stat labels'], ['stats.value', 'Stat numbers']] };
SLOTS["br-wwcd|full"] = {"logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item"};
GRAPHICS["br-mvp|full"] = { title: "Match MVP", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['header', 'Header'], ['header.logo', 'Esports logo'], ['header.rule', 'Header line'], ['header.event', 'Event line'], ['header.eventmark', 'Event line marks'], ['header.title', 'Title', 1], ['header.context', 'Context'], ['header.dots', 'Context dots'], ['header.progress', 'Progress marks'], ['header.card', 'Context card'], ['mapcard', 'Map card'], ['mapcard.picture', 'Map picture'], ['mapcard.name', 'Map name'], ['hero', 'MVP'], ['hero.number', 'Big 1'], ['hero.dials', 'Dials'], ['hero.photo', 'MVP photo'], ['hero.photoimg', 'MVP photo picture'], ['hero.shadow', 'MVP shadow'], ['hero.stats', 'Stat plates'], ['hero.values', 'Stat numbers'], ['hero.name', 'Player name'], ['hero.team', 'Team line'], ['hero.logo', 'Team logo'], ['others', 'Players 2 to 4'], ['others.rank', 'Ranks'], ['others.photo', 'Photos'], ['others.photoimg', 'Photo pictures'], ['others.shadow', 'Shadows'], ['others.name', 'Names'], ['others.line', 'Team and numbers'], ['others.values', 'Numbers'], ['empty', 'Waiting note', 1]] };
SLOTS["br-mvp|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "mapcard.picture": "map"};
GRAPHICS["br-champion|full"] = { title: "Champions", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['logo', 'Esports logo'], ['emblem', 'Event emblem'], ['emblem.picture', 'Emblem picture'], ['emblem.text', 'Emblem name'], ['emblem.name', 'Emblem words'], ['players', 'Players'], ['players.photo', 'Player photos'], ['players.shadow', 'No-photo shadows'], ['rays', 'Rays'], ['word', 'Champions word'], ['word.depth', 'Word depth'], ['word.face', 'Word face'], ['team', 'Team plate'], ['team.logo', 'Team logo'], ['team.name', 'Team name'], ['stats', 'Stats'], ['stats.value', 'Stat numbers'], ['journey', 'Journey'], ['journey.label', 'Journey title'], ['journey.sub', 'Journey line'], ['journey.marks', 'Match labels']] };
SLOTS["br-champion|full"] = {"logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "emblem.picture": "any"};
GRAPHICS["br-teams|full"] = { title: "Teams in this lobby", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['header', 'Header'], ['header.logo', 'Esports logo'], ['header.rule', 'Header line'], ['header.event', 'Event line'], ['header.eventmark', 'Event line marks'], ['header.title', 'Title', 1], ['header.context', 'Context'], ['header.dots', 'Context dots'], ['header.progress', 'Progress marks'], ['header.card', 'Context card'], ['cards', 'Team cards'], ['cards.head', 'Card heads'], ['cards.logo', 'Team logos'], ['cards.name', 'Team names'], ['cards.seed', 'Seeds'], ['cards.players', 'Players']] };
SLOTS["br-teams|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item"};
GRAPHICS["br-drop|full"] = { title: "Drop map", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['header', 'Header'], ['header.logo', 'Esports logo'], ['header.rule', 'Header line'], ['header.event', 'Event line'], ['header.eventmark', 'Event line marks'], ['header.title', 'Title', 1], ['header.context', 'Context'], ['header.dots', 'Context dots'], ['header.progress', 'Progress marks'], ['header.card', 'Context card'], ['map', 'Tactical map'], ['map.picture', 'Map picture'], ['map.letters', 'Grid letters'], ['map.numbers', 'Grid numbers'], ['map.jump', 'Jump marker'], ['map.north', 'North arrow'], ['map.n', 'North letter'], ['side.label', 'Flight path label', 1], ['side.map', 'Map name'], ['side.line', 'Match line'], ['side.legend', 'Legend'], ['side.keys', 'Legend marks']] };
SLOTS["br-drop|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "map.picture": "map"};
GRAPHICS["br-fraggers|full"] = { title: "Top fraggers", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['header', 'Header'], ['header.logo', 'Esports logo'], ['header.rule', 'Header line'], ['header.event', 'Event line'], ['header.eventmark', 'Event line marks'], ['header.title', 'Title', 1], ['header.context', 'Context'], ['header.dots', 'Context dots'], ['header.progress', 'Progress marks'], ['header.card', 'Context card'], ['cards', 'Player cards'], ['cards.top', 'Top card'], ['cards.rank', 'Ranks'], ['cards.photo', 'Photos'], ['cards.photoimg', 'Photo pictures'], ['cards.shadow', 'No-photo shadows'], ['cards.kills', 'Elims'], ['cards.word', 'Elims word'], ['cards.name', 'Player names'], ['cards.team', 'Team lines'], ['cards.logo', 'Team logos'], ['cards.stats', 'Damage and knocks'], ['cards.values', 'Numbers']] };
SLOTS["br-fraggers|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item"};
GRAPHICS["br-tom|full"] = { title: "Team of the match", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['header', 'Header'], ['header.logo', 'Esports logo'], ['header.rule', 'Header line'], ['header.event', 'Event line'], ['header.eventmark', 'Event line marks'], ['header.title', 'Title', 1], ['header.context', 'Context'], ['header.dots', 'Context dots'], ['header.progress', 'Progress marks'], ['header.card', 'Context card'], ['team', 'Team plate'], ['team.logo', 'Team logo'], ['team.name', 'Team name'], ['team.points', 'Points'], ['team.value', 'Points number'], ['players', 'Player cards'], ['players.photo', 'Photos'], ['players.photoimg', 'Photo pictures'], ['players.shadow', 'No-photo shadows'], ['players.name', 'Player names'], ['players.stats', 'Player numbers'], ['players.values', 'Numbers'], ['totals', 'Team numbers'], ['totals.value', 'Team values']] };
SLOTS["br-tom|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item"};
GRAPHICS["br-profile|full"] = { title: "Player profile", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['header', 'Header'], ['header.logo', 'Esports logo'], ['header.rule', 'Header line'], ['header.event', 'Event line'], ['header.eventmark', 'Event line marks'], ['header.title', 'Title', 1], ['header.context', 'Context'], ['header.dots', 'Context dots'], ['header.progress', 'Progress marks'], ['header.card', 'Context card'], ['photo', 'Photo'], ['photo.img', 'Photo picture'], ['photo.shadow', 'No-photo shadow'], ['team', 'Team line'], ['team.logo', 'Team logo'], ['name', 'Player name'], ['tiles', 'Stat tiles'], ['tiles.value', 'Stat numbers'], ['bars.label', 'Bars title', 1], ['bars', 'Match rows'], ['bars.match', 'Match labels'], ['bars.fill', 'Bars'], ['bars.value', 'Damage'], ['bars.elims', 'Elims'], ['rating', 'Rating'], ['rating.word', 'Rating word', 1], ['rating.value', 'Rating number']] };
SLOTS["br-profile|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item"};
GRAPHICS["br-mstats|full"] = { title: "Match stats", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['header', 'Header'], ['header.logo', 'Esports logo'], ['header.rule', 'Header line'], ['header.event', 'Event line'], ['header.eventmark', 'Event line marks'], ['header.title', 'Title'], ['header.context', 'Context'], ['header.dots', 'Context dots'], ['header.progress', 'Progress marks'], ['header.card', 'Context card'], ['mapcard', 'Map card'], ['mapcard.picture', 'Map picture'], ['mapcard.name', 'Map name'], ['table', 'Table'], ['table.head', 'Column heads'], ['table.rows', 'Rows'], ['table.rank', 'Ranks'], ['table.logo', 'Team logos'], ['table.name', 'Team names'], ['table.bar', 'Damage bars'], ['table.fill', 'Bar fills'], ['table.damage', 'Damage'], ['table.cols', 'Numbers']] };
SLOTS["br-mstats|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "mapcard.picture": "map"};
GRAPHICS["br-pvp|full"] = { title: "Player vs player", parts: [['field', 'Colour field'], ['background', 'Background picture'], ['veil', 'Colour veil'], ['chutes', 'Parachutes'], ['crate', 'Airdrop crate'], ['footer', 'Footer'], ['footer.ci', 'Partner logos'], ['footer.line', 'Footer line'], ['footer.sponsors', 'Sponsors'], ['footer.sponsor', 'Sponsor logos'], ['header', 'Header'], ['header.logo', 'Esports logo'], ['header.rule', 'Header line'], ['header.event', 'Event line'], ['header.eventmark', 'Event line marks'], ['header.title', 'Title'], ['header.context', 'Context'], ['header.dots', 'Context dots'], ['header.progress', 'Progress marks'], ['header.card', 'Context card'], ['mapcard', 'Map card'], ['mapcard.picture', 'Map picture'], ['mapcard.name', 'Map name'], ['players', 'Player cards'], ['players.photo', 'Photos'], ['players.photoimg', 'Photo pictures'], ['players.shadow', 'No-photo shadows'], ['players.team', 'Team lines'], ['players.logo', 'Team logos'], ['players.name', 'Player names'], ['players.rating', 'Rating lines', 1], ['players.ratingvalue', 'Ratings'], ['vs', 'VS mark', 1], ['rows', 'Stat rows'], ['rows.values', 'Numbers'], ['rows.label', 'Stat names'], ['rows.bars', 'Bar tracks'], ['rows.fill', 'Bars']] };
SLOTS["br-pvp|full"] = {"header.logo": "logo-esports", "footer.ci": "logo-ci", "crate": "item", "mapcard.picture": "map"};
// ‹ BR PARTS
export function slotsOf(graphic: string): Record<string, SlotKind> {
  const auto: Record<string, SlotKind> = graphic.endsWith('|full') && partsOf(graphic).some((p) => p[0] === 'background') ? { background: 'background' } : {};
  return { ...auto, ...(SLOTS[graphic] ?? {}) };
}
/** Only pack files and the producer's uploads, both served by the graphics engine. */
export const PICTURE_SRC = /^\/(packs\/[a-z0-9]{2,16}\/[0-9a-f]{64}\.(png|jpg|webp)|air-assets\/[0-9a-f-]{36})$/;
/** Which asset kinds fit a slot: logos only in their own slot; a background takes wallpapers, maps and the producer's own. */
export function slotFits(slot: SlotKind, kind: import('./game-assets.ts').AssetKind): boolean {
  if (slot.startsWith('logo-') || kind.startsWith('logo-')) return slot === kind;
  if (slot === 'any') return true;
  if (slot === 'background') return kind === 'wallpaper' || kind === 'map' || kind === 'other';
  return slot === kind || kind === 'other';
}
/** Kit art (from a game pack) is used as it is: no fill, colour or fading over it; logos never shrink below half. */
export const isKitPicture = (p: PartPicture | undefined) => !!p && p.src.startsWith('/packs/');
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
export function validPart(input: unknown, label: string, words: boolean, slot?: SlotKind): PartStyle {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${label}: settings are missing.`);
  const p = input as Record<string, unknown>;
  const known = new Set(['x', 'y', 'scale', 'z', 'hidden', 'locked', 'opacity', 'fill', 'color', 'font', 'weight', 'size', 'spacing', 'caps', 'border', 'radius', 'depth', 'label', 'entrance', 'picture']);
  for (const k of Object.keys(p)) if (!known.has(k)) throw new Error(`${label}: unknown setting “${k}”.`);
  const out: PartStyle = {
    x: range(p.x, -1920, 1920, `${label} · X`), y: range(p.y, -1080, 1080, `${label} · Y`), scale: range(p.scale, 0.25, 3, `${label} · scale`),
    z: p.z === undefined ? undefined : Math.round(range(p.z, -99, 99, `${label} · layer`)!), opacity: range(p.opacity, 0, 1, `${label} · opacity`),
    color: colorOf(p.color, `${label} · text colour`), weight: range(p.weight, 400, 900, `${label} · weight`), size: range(p.size, 6, 240, `${label} · size`),
    spacing: range(p.spacing, -0.1, 0.6, `${label} · spacing`), radius: range(p.radius, 0, 80, `${label} · corners`),
  };
  if (p.hidden !== undefined) { if (typeof p.hidden !== 'boolean') throw new Error(`${label}: shown or hidden.`); if (p.hidden) out.hidden = true; }
  if (p.locked !== undefined) { if (typeof p.locked !== 'boolean') throw new Error(`${label}: locked or not.`); if (p.locked) out.locked = true; }
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
  if (p.picture !== undefined) {
    const pic = p.picture as Record<string, unknown>;
    if (!slot) throw new Error(`${label}: this part's picture comes from the graphic and can't be changed.`);
    if (!pic || typeof pic !== 'object' || typeof pic.src !== 'string' || !PICTURE_SRC.test(pic.src)) throw new Error(`${label}: choose a picture from the game pack or your uploads.`);
    const kind = pic.kind as import('./game-assets.ts').AssetKind;
    if (typeof kind !== 'string' || !slotFits(slot, kind)) throw new Error(`${label}: that kind of picture doesn't fit here.`);
    out.picture = drop({ src: pic.src, kind, fit: pic.fit === 'contain' ? 'contain' as const : pic.fit === 'cover' ? 'cover' as const : undefined, flip: pic.flip === true ? true : undefined });
    if (isKitPicture(out.picture)) {
      if (out.fill && out.fill.kind !== 'none') throw new Error(`${label}: kit pictures are used as they are (no fill over them).`);
      if (out.color || (out.opacity !== undefined && out.opacity < 1)) throw new Error(`${label}: kit pictures are used as they are (no colour or fading).`);
      if (kind.startsWith('logo-') && out.scale !== undefined && out.scale < 0.5) throw new Error(`${label}: the logo can't be made that small.`);
    }
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
    const style = validPart(v, part[1], !!part[2], slotsOf(t.graphic)[id]);
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
