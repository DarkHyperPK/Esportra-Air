// What the Player app's interface and main process exchange.
import type { LinkView } from '../../../../packages/capture/src/link.ts';
import type { PcRole } from '../../../../packages/capture/src/protocol.ts';
import type { RecorderView } from '../../../../packages/capture/src/recorder.ts';

export type { LinkView, PcRole };

export interface PlayerSnapshot {
  version: string;
  /** This PC's name as the producer sees it. */
  name: string;
  /** The role last used (or being chosen). */
  role: PcRole;
  link: LinkView;
  feed: { state: 'off' | 'waiting' | 'live' | 'unavailable'; reason: string | null };
  /** Record game data (troubleshooting): raw game data to a file on this PC only. */
  recording: RecorderView;
}

export interface PlayerApi {
  snapshot(): Promise<PlayerSnapshot>;
  onSnapshot(listener: (snapshot: PlayerSnapshot) => void): () => void;
  connect(input: { address: string; code: string; role: PcRole }): Promise<PlayerSnapshot>;
  disconnect(): Promise<PlayerSnapshot>;
  retry(): Promise<PlayerSnapshot>;
  startCapture(input: { consent: true }): Promise<PlayerSnapshot>;
  stopCapture(): Promise<PlayerSnapshot>;
  setRecording(on: boolean): Promise<PlayerSnapshot>;
}

export const CHANNELS = { call: 'player:call', snapshot: 'player:snapshot' } as const;
export type PlayerMethod = Exclude<keyof PlayerApi, 'onSnapshot'>;
export const METHODS: PlayerMethod[] = ['snapshot', 'connect', 'disconnect', 'retry', 'startCapture', 'stopCapture', 'setRecording'];
