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
    testRound: { running: boolean; startedAt?: number; durationMs: number };
  }>;
  outputs: Array<{ id: string; connections: number; lastFrameAt: number | null }>;
}
