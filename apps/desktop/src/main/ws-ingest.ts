// The shared ingest client, connected over the `ws` package.
import WebSocket from 'ws';
import { IngestClient, type IngestSocket } from '../../../../packages/capture/src/ingest.ts';

export const wsIngest = (options: { now?: () => number } = {}) => new IngestClient({ connect: (url) => new WebSocket(url) as unknown as IngestSocket, ...options });
