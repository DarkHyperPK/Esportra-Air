// HTTP client for the graphics engine (see engine/crates/air-engine/src/http.rs).

export class EngineError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type Fetch = typeof fetch;

export class EngineClient {
  readonly base: string;
  readonly key: string;
  private readonly fetchImpl: Fetch;

  constructor(base: string, key: string, fetchImpl: Fetch = fetch) {
    this.base = base;
    this.key = key;
    this.fetchImpl = fetchImpl;
  }

  async request<T = unknown>(method: string, path: string, body?: unknown, timeoutMs = 3000): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.base + path, {
        method,
        headers: { 'X-Esportra-Key': this.key, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new EngineError('The graphics engine is not responding.', 0);
    }
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const message = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : `Engine request failed (${response.status}).`;
      throw new EngineError(message, response.status);
    }
    return data as T;
  }

  get<T = unknown>(path: string) {
    return this.request<T>('GET', path);
  }
  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body ?? {});
  }
  put<T = unknown>(path: string, body: unknown) {
    return this.request<T>('PUT', path, body);
  }
  patch<T = unknown>(path: string, body: unknown) {
    return this.request<T>('PATCH', path, body);
  }

  /** Uploads raw bytes (an image for the asset store). */
  async putBytes(path: string, bytes: Uint8Array, timeoutMs = 10_000) {
    let response: Response;
    try {
      response = await this.fetchImpl(this.base + path, { method: 'PUT', headers: { 'X-Esportra-Key': this.key, 'Content-Type': 'application/octet-stream' }, body: bytes, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new EngineError('The graphics engine is not responding.', 0);
    }
    if (!response.ok) {
      let message = `Engine request failed (${response.status}).`;
      try { message = String(((await response.json()) as { error?: string }).error ?? message); } catch { /* keep */ }
      throw new EngineError(message, response.status);
    }
  }

  /** Downloads a stored file (a picture or font from the asset store). */
  async getBytes(path: string, timeoutMs = 10_000): Promise<Buffer> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.base + path, { headers: { 'X-Esportra-Key': this.key }, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new EngineError('The graphics engine is not responding.', 0);
    }
    if (!response.ok) throw new EngineError(`Engine request failed (${response.status}).`, response.status);
    return Buffer.from(await response.arrayBuffer());
  }

  /** Read-only WebSocket URL: receives a room's events without being counted as an on-air viewer. */
  observeUrl(matchCode: string) {
    return `${this.base.replace(/^http/, 'ws')}/ws?match=${encodeURIComponent(matchCode)}&role=observe`;
  }

  /** WebSocket URL for ingesting game data into a match room. */
  ingestUrl(matchCode: string) {
    return `${this.base.replace(/^http/, 'ws')}/ws?match=${encodeURIComponent(matchCode)}&role=ingest&key=${encodeURIComponent(this.key)}`;
  }
}

/** The engine's `/control/status` shape (the parts Air reads). */
export interface EngineStatus {
  pid: number;
  version: string;
  rooms: Array<{
    match: string;
    v: number;
    clients: number;
    lastFeedAt: number | null;
    feedAgeMs: number | null;
    feedPaused: boolean;
    testRound: { running: boolean; startedAt?: number; durationMs: number; speed?: number; fromMs?: number };
    /** Per team, per player slot: is the camera connected on an overlay page. */
    cams?: boolean[][];
  }>;
  outputs: Array<{ id: string; connections: number; lastFrameAt: number | null }>;
}
