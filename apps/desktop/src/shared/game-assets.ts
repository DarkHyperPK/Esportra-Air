// Game packs (20 Nov): a game's official pictures (characters, maps, vehicles, items, wallpapers and its logos),
// hosted by Esportra and downloaded once by Air into the engine's data folder (`/packs/<game>/<sha256>.<ext>`).
// The producer may also add pictures of their own. Kit rules travel with each asset: logos are protected (only
// the kit's own variants, never recoloured), kit art is never recoloured or filtered.

export const ASSET_KINDS = ['character', 'map', 'vehicle', 'item', 'wallpaper', 'logo-esports', 'logo-game', 'logo-ci', 'other'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const KIND_LABEL: Record<AssetKind, string> = {
  character: 'Characters', map: 'Maps', vehicle: 'Vehicles', item: 'Items', wallpaper: 'Wallpapers',
  'logo-esports': 'Esports logo', 'logo-game': 'Game logo', 'logo-ci': 'Partner logos (CI)', other: 'Other',
};
export const isLogo = (k: AssetKind) => k.startsWith('logo-');

export interface PackFile { sha256: string; ext: 'png' | 'jpg' | 'webp'; bytes: number }
export interface GameAsset {
  id: string;
  kind: AssetKind;
  name: string;
  w: number;
  h: number;
  file: PackFile;
  /** A small version for lists (about 320 px), so the browser never decodes the full picture. */
  thumb?: PackFile;
  /** Logo variant as the kit names it (black, white, yellow). */
  variant?: string;
  /** `kit`: from the game's official pack, unchanged and protected by its rules; `mine`: the producer's own. */
  source: 'kit' | 'mine';
}
export interface PackManifest { game: string; version: string; assets: GameAsset[] }

/** Games that have a pack and whose pack needs a tournament licence before use. */
export const LICENSED_PACKS: Record<string, { licence: string; rules: string[] }> = {
  pubgm: {
    licence: 'This event has a PUBG MOBILE tournament licence',
    rules: [
      'Use the latest PUBG MOBILE Esports logo (preferred) or PUBG MOBILE logo, top left on full screens.',
      'The CI logo (KRAFTON, Level Infinite, Lightspeed) goes bottom left; keep sponsors apart from it.',
      'Use only PUBG MOBILE assets: no PUBG (PC) content and nothing from other games.',
      'Never modify a logo or a game asset (no recolouring, cut-outs or filters); move, scale and flip are fine.',
      'Tournaments with a livestream and over USD 3,000 send their broadcast graphics for review before the event.',
    ],
  },
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SHA = /^[0-9a-f]{64}$/;
const GAME = /^[a-z0-9]{2,16}$/;
const MAX_BYTES = 60_000_000;

function file(input: unknown, what: string): PackFile {
  const f = input as Record<string, unknown>;
  if (!f || typeof f !== 'object' || typeof f.sha256 !== 'string' || !SHA.test(f.sha256)) throw new Error(`${what}: the file has no valid checksum.`);
  if (!['png', 'jpg', 'webp'].includes(f.ext as string)) throw new Error(`${what}: only PNG, JPEG or WebP pictures.`);
  const bytes = Number(f.bytes);
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > MAX_BYTES) throw new Error(`${what}: the file size is out of range.`);
  return { sha256: f.sha256, ext: f.ext as PackFile['ext'], bytes };
}

/** One asset as Esportra or the producer gave it, checked; throws a plain sentence when it can't be used. */
export function validAsset(input: unknown, source: GameAsset['source']): GameAsset {
  const a = input as Record<string, unknown>;
  if (!a || typeof a !== 'object') throw new Error('An asset is missing.');
  const name = typeof a.name === 'string' ? a.name.replace(/[<>]/g, '').trim().slice(0, 80) : '';
  if (typeof a.id !== 'string' || !ID.test(a.id) || !name) throw new Error('An asset has no id or name.');
  if (!(ASSET_KINDS as readonly string[]).includes(a.kind as string)) throw new Error(`${name}: unknown kind.`);
  const w = Number(a.w), h = Number(a.h);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 8192 || h > 8192) throw new Error(`${name}: the picture size is out of range.`);
  const kind = a.kind as AssetKind;
  if (source === 'mine' && isLogo(kind)) throw new Error(`${name}: game logos only come from the official pack.`);
  return {
    id: a.id, kind, name, w, h, file: file(a.file, name),
    ...(a.thumb !== undefined ? { thumb: file(a.thumb, `${name} (small)`) } : {}),
    ...(typeof a.variant === 'string' && /^[a-z]{1,16}$/.test(a.variant) ? { variant: a.variant } : {}),
    source,
  };
}

export function validManifest(input: unknown): PackManifest {
  const m = input as Record<string, unknown>;
  if (!m || typeof m !== 'object' || typeof m.game !== 'string' || !GAME.test(m.game)) throw new Error('The game pack names no game.');
  if (typeof m.version !== 'string' || !/^[\w.-]{1,40}$/.test(m.version)) throw new Error('The game pack has no version.');
  if (!Array.isArray(m.assets) || m.assets.length > 2000) throw new Error('The game pack lists no pictures.');
  const seen = new Set<string>();
  const assets = m.assets.map((x) => validAsset(x, 'kit')).filter((a) => !seen.has(a.id) && seen.add(a.id));
  return { game: m.game, version: m.version, assets };
}

/** Where the engine serves a pack file. */
export const packPath = (game: string, f: PackFile) => `/packs/${game}/${f.sha256}.${f.ext}`;
export const assetSrc = (port: number, game: string, a: GameAsset, small = false) => `http://127.0.0.1:${port}${packPath(game, (small && a.thumb) || a.file)}`;

export interface PackStatus {
  game: string;
  version: string | null;
  total: number;
  have: number;
  downloading: boolean;
  /** Plain words: why the pack is not complete (offline, not signed in, licence not confirmed…). */
  waiting: string | null;
}
