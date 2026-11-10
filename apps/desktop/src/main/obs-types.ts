// The slice of obs-websocket-js that Air uses, so tests can substitute an in-memory OBS.
export interface ObsSocket {
  connect(url: string, password?: string, identification?: { rpcVersion: number }): Promise<{ obsWebSocketVersion: string }>;
  disconnect(): Promise<void>;
  call(request: string, data?: Record<string, unknown>): Promise<any>;
  on(event: string, listener: (...args: any[]) => void): unknown;
  off?(event: string, listener: (...args: any[]) => void): unknown;
  once?(event: string, listener: (...args: any[]) => void): unknown;
}
