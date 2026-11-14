// What Bitfocus Companion can see and do: the screens in the show, people on air and sponsors, and
// button actions that run through the same Production methods as Air's keys (so Cued applies the same
// way). Production satisfies CompanionTarget; this file never reaches anything else.
import type { LayerMode } from '../shared/layers.ts';
import type { ControlMode } from '../shared/companion.ts';
import type { Screen } from '../shared/api.ts';
import { ROLE_NAME, type OnAir } from '../shared/model.ts';

export interface CompanionTarget {
  readonly control: ControlMode;
  version(): string;
  screens(): Screen[];
  /** People and sponsors on air for the selected match (empty without one). */
  people(): OnAir;
  /** The full-screen graphic on air. */
  onAirScreen(): string | null;
  setLayer(id: string, mode: LayerMode): Promise<unknown>;
  lowerThird(input: { kind: 'person'; name: string; role: string } | null): Promise<unknown>;
  sponsorRead(id: string | null): Promise<unknown>;
  toast(text: string): Promise<unknown>;
  pause(kind: 'technical' | 'timeout' | null): Promise<unknown>;
  takeCue(how: 'take' | 'stinger'): Promise<unknown>;
  clearCue(): unknown;
  autopilotHold(): unknown;
  autopilotSkip(): unknown;
  autopilotTake(): Promise<unknown>;
}

/** What Companion's dropdowns offer: screens in the show, people on air, sponsors on for this match. */
export function companionHello(t: CompanionTarget) {
  const on = t.people();
  return {
    version: t.version(),
    screens: t.screens().filter((x) => x.hosted && x.enabled).map((x) => ({ id: x.id, title: x.title })),
    talent: on.talent.map((p) => ({ id: p.id, name: p.name })),
    sponsors: on.sponsors.map((x) => ({ id: x.id, name: x.name })),
  };
}

/** A Companion button. Autopilot buttons only work with the Both setting. */
export async function companionAct(t: CompanionTarget, name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'fullscreen': {
      const screen = String(args.screen ?? '');
      if (!t.screens().some((x) => x.id === screen && x.hosted && x.enabled)) throw new Error('That screen is not in My show.');
      const on = args.on === 'toggle' ? t.onAirScreen() !== screen : args.on !== false && args.on !== 'off';
      return t.setLayer(`fs:${screen}`, on ? 'on' : 'off');
    }
    case 'talent': {
      if (args.talentId === null || args.talentId === undefined || args.talentId === '') return t.lowerThird(null);
      const person = t.people().talent.find((p) => p.id === args.talentId);
      if (!person) throw new Error('That person is not on air for this match.');
      return t.lowerThird({ kind: 'person', name: person.name, role: ROLE_NAME[person.role] });
    }
    case 'sponsor': return t.sponsorRead(typeof args.sponsorId === 'string' && args.sponsorId ? args.sponsorId : null);
    case 'toast': {
      const text = typeof args.text === 'string' ? args.text.trim() : '';
      if (!text || text.length > 120 || /[<>]/.test(text)) throw new Error('A toast is plain text, 1–120 characters.');
      return t.toast(text);
    }
    case 'pause': return t.pause(args.kind === 'technical' || args.kind === 'timeout' ? args.kind : null);
    case 'take': return t.takeCue('take');
    case 'take_stinger': return t.takeCue('stinger');
    case 'clear': return t.clearCue();
    case 'autopilot_hold':
    case 'autopilot_skip':
    case 'autopilot_take':
      if (t.control !== 'both') throw new Error('Autopilot buttons work when Air is set to Both.');
      if (name === 'autopilot_hold') return t.autopilotHold();
      if (name === 'autopilot_skip') return t.autopilotSkip();
      return t.autopilotTake();
    default: throw new Error(`Air does not know the action “${name}”.`);
  }
}
