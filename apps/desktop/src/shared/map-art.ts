// Map pictures for Air's own interface (the veto panel's tiles). Air downloads Riot's map art once into the
// graphics engine's art cache (src/main/art-cache.ts), and the engine serves it at /art/ under the same path
// as on media.valorant-api.com. The ids are the catalogue's (esportra-valorant-hud/core/catalog.js).
import type { MapName } from './match-data.ts';

const MAP_UUID: Record<MapName, string> = {
  ABYSS: '224b0a95-48b9-f703-1bd8-67aca101a61f', ASCENT: '7eaecc1b-4337-bbf6-6ab9-04b8f06b3319', BIND: '2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba',
  BREEZE: '2fb9a4fd-47b8-4e7d-a969-74b4046ebd53', CORRODE: '1c18ab1f-420d-0d8b-71d0-77ad3c439115', FRACTURE: 'b529448b-4d60-346e-e89e-00a4c527a405',
  HAVEN: '2bee0dc9-4ffe-519b-1cbd-7fbe763a6047', ICEBOX: 'e2ad5c54-4114-a870-9641-8ea21279579a', LOTUS: '2fe4ed3a-450a-948b-6d6b-e89a78e680a9',
  PEARL: 'fd267378-4d1d-484f-ff52-77821ed10dc2', SPLIT: 'd960549e-485c-e861-8d71-aa9d1aed12a2', SUMMIT: '756da597-416b-c0f2-f47b-afbdf28670bc',
  SUNSET: '92584fbe-486a-b1b2-9faa-39b0f486b498',
};

/** The tall map picture (veto tiles) or the wide splash, from the engine on this PC; null for a map Air does not know. */
export function mapArt(enginePort: number, map: MapName, kind: 'tall' | 'splash' = 'tall'): string | null {
  const id = MAP_UUID[map];
  return id ? `http://127.0.0.1:${enginePort}/art/maps/${id}/${kind === 'tall' ? 'listviewicontall' : 'splash'}.png` : null;
}

/** A map's colour while its picture is missing (no art cache yet). */
export const mapTint = (m: string) => `hsl(${[...m].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)} 28% 30%)`;
