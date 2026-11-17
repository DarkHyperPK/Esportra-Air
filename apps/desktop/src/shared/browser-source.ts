// Browser sources for your own OBS scenes (Rundown › Copy browser source, 17 Nov). Air is the cue tool for the
// graphics over the game; the crew runs the desk and every scene in OBS. Each Rundown row gets one address to
// paste into an OBS browser source (1920×1080). It follows the match selected in Air, so it is added once.
//  · A full-screen graphic (Map veto, Agent select, results, your designs) shows alone, in the row's look,
//    only while Air has it on air (Take, a key, autopilot): the full-screen host with ?only=<screen>.
//  · The "always on" address shows it all the time, for crews who show and hide sources in OBS themselves.
//  · The HUD and the scene graphics (Starting soon, Desk) are their own pages.
import type { Screen } from './api.ts';

export interface SourceLinks {
  /** Shows the graphic while Air has it on air. */
  url: string;
  /** Shows it all the time (full-screen graphics only). */
  always: string | null;
}

export function browserSource(port: number, screens: Screen[], row: { show?: string | null; style?: 'full' | 'band' }): SourceLinks | null {
  if (!row.show || !port) return null;
  const base = `http://127.0.0.1:${port}/o/`;
  const own = row.show.startsWith('own:');
  const screen = screens.find((x) => x.id === row.show);
  if (!own && !screen) return null;
  if (own || screen!.hosted) {
    const host = screens.find((x) => x.id === 'fullscreen');
    if (!host) return null;
    const url = `${base}${host.outputId}?only=${encodeURIComponent(row.show)}&style=${row.style === 'band' ? 'band' : 'full'}`;
    return { url, always: `${url}&always=1` };
  }
  return { url: `${base}${screen!.outputId}`, always: null };
}
