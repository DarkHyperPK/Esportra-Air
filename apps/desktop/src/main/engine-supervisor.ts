// Starts, finds and watches the graphics engine process.
//
// The engine runs detached from the Air window. When Air starts it first re-attaches to a running
// engine (found through `<data>/engine.lock` and confirmed with the write key), so restarting or
// crashing the window never takes graphics off air. If the engine itself stops, it is restarted;
// its match state is persisted, so overlays reconnect to the same state.

import { EventEmitter } from 'node:events';
import { EngineClient, type EngineStatus, type Fetch } from './engine-client.ts';

export interface ChildHandle {
  pid?: number;
  unref(): void;
  once(event: 'exit', listener: (code: number | null) => void): unknown;
}

export interface SupervisorOptions {
  binary: string;
  hudRoot: string;
  dataDir: string;
  port: number;
  key: string;
  spawn: (command: string, args: string[], options: { detached: boolean; env: NodeJS.ProcessEnv; logFile: string }) => ChildHandle;
  readFile: (path: string) => Promise<string>;
  isAlive: (pid: number) => boolean;
  kill: (pid: number) => void;
  fetch?: Fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Environment passed to the engine besides the key (keep it minimal). */
  env?: NodeJS.ProcessEnv;
  monitorEveryMs?: number;
  startTimeoutMs?: number;
}

export type EngineState = 'starting' | 'running' | 'restarting' | 'failed';

const join = (dir: string, file: string) => (dir.endsWith('/') || dir.endsWith('\\') ? dir + file : `${dir}/${file}`);

export class EngineSupervisor extends EventEmitter {
  state: EngineState = 'starting';
  reattached = false;
  error: string | null = null;
  status: EngineStatus | null = null;
  readonly client: EngineClient;
  private readonly options: SupervisorOptions;
  private readonly sleep: (ms: number) => Promise<void>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  private restarting = false;
  private stopped = false;

  constructor(options: SupervisorOptions) {
    super();
    this.options = options;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.client = new EngineClient(`http://127.0.0.1:${options.port}`, options.key, options.fetch);
  }

  get port() {
    return this.options.port;
  }

  private setState(state: EngineState, error: string | null = null) {
    this.state = state;
    this.error = error;
    this.emit('change');
  }

  /** Re-attaches to a running engine, or starts one. */
  async start(): Promise<void> {
    this.stopped = false;
    this.setState('starting');
    try {
      if (await this.attach()) {
        this.reattached = true;
      } else {
        this.reattached = false;
        await this.launch();
      }
      this.setState('running');
    } catch (error) {
      this.setState('failed', error instanceof Error ? error.message : String(error));
    }
    this.monitor();
  }

  /** Finds an engine from its lock file and confirms we can control it. */
  private async attach(): Promise<boolean> {
    let lock: { pid?: number; port?: number };
    try {
      lock = JSON.parse(await this.options.readFile(join(this.options.dataDir, 'engine.lock')));
    } catch {
      return false;
    }
    if (typeof lock.pid !== 'number' || !this.options.isAlive(lock.pid)) return false;
    if (lock.port !== this.options.port) return false;
    try {
      this.status = await this.client.get<EngineStatus>('/control/status');
      return this.status.pid === lock.pid;
    } catch (error) {
      // An engine we cannot control (its key was lost) holds the port: replace it.
      if ((error as { status?: number }).status === 401) {
        this.options.kill(lock.pid);
        await this.sleep(500);
      }
      return false;
    }
  }

  private async launch(): Promise<void> {
    const { binary, hudRoot, dataDir, port, key } = this.options;
    const child = this.options.spawn(binary, ['--root', hudRoot, '--data', dataDir, '--host', '127.0.0.1', '--port', String(port)], {
      detached: true,
      env: { ...(this.options.env ?? {}), AIR_ENGINE_KEY: key },
      logFile: join(dataDir, 'engine.log'),
    });
    let exited: number | null | undefined;
    child.once('exit', (code) => {
      exited = code;
    });
    child.unref();
    const deadline = Date.now() + (this.options.startTimeoutMs ?? 10_000);
    while (Date.now() < deadline) {
      if (exited !== undefined) {
        throw new Error(`The graphics engine could not start (exit ${exited}). Port ${port} may be in use by another program; see engine.log.`);
      }
      try {
        this.status = await this.client.get<EngineStatus>('/control/status');
        return;
      } catch {
        await this.sleep(150);
      }
    }
    throw new Error('The graphics engine did not start in time. See engine.log in the Air data folder.');
  }

  private monitor() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), this.options.monitorEveryMs ?? 1000);
    this.timer.unref?.();
  }

  /** Reads engine status; three missed polls in a row restart it. */
  async poll(): Promise<void> {
    if (this.restarting || this.stopped) return;
    try {
      this.status = await this.client.get<EngineStatus>('/control/status');
      this.failures = 0;
      if (this.state !== 'running') this.setState('running');
      this.emit('status', this.status);
    } catch {
      this.failures += 1;
      if (this.failures >= 3) await this.restart();
    }
  }

  private async restart() {
    this.restarting = true;
    this.setState('restarting', 'The graphics engine stopped. Restarting it with the saved match state.');
    try {
      if (!(await this.attach())) await this.launch();
      this.failures = 0;
      this.setState('running');
      this.emit('restarted');
    } catch (error) {
      this.setState('failed', error instanceof Error ? error.message : String(error));
    } finally {
      this.restarting = false;
    }
  }

  /** Whether any overlay is connected (graphics may be on air). */
  hasViewers(): boolean {
    return (this.status?.outputs ?? []).some((o) => o.connections > 0) || (this.status?.rooms ?? []).some((r) => r.clients > 0);
  }

  /** Stops watching; with `shutdown`, also stops the engine (graphics go off air). */
  async stop(shutdown: boolean): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (shutdown) {
      try {
        await this.client.post('/control/shutdown');
      } catch {
        // Already gone.
      }
    }
  }
}
