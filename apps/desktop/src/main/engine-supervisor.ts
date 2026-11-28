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
  /** Where the engine listens: 127.0.0.1 (this PC only, the default) or 0.0.0.0 (Graphics on the local network). */
  host?: string;
  spawn: (command: string, args: string[], options: { detached: boolean; env: NodeJS.ProcessEnv; logFile: string }) => ChildHandle;
  readFile: (path: string) => Promise<string>;
  writeFile?: (path: string, data: string) => Promise<void>;
  /** Identifies the engine binary Air ships (size and date). A running engine started from another build is replaced. */
  buildId?: string;
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
  private lockHost = '127.0.0.1';
  private stopped = false;

  constructor(options: SupervisorOptions) {
    super();
    this.options = options;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.client = new EngineClient(`http://127.0.0.1:${options.port}`, options.key, options.fetch);
  }

  get host() {
    return this.options.host ?? '127.0.0.1';
  }

  /** Restarts the engine on another listening address; its saved match state comes back with it. */
  async setHost(host: string): Promise<void> {
    if (host === this.host) return;
    this.restarting = true;
    this.options.host = host;
    this.setState('restarting', 'Restarting the graphics to change who can load them.');
    try {
      if (this.status?.pid && this.options.isAlive(this.status.pid)) await this.replace();
      else await this.launch();
      this.failures = 0;
      this.setState('running');
      this.emit('restarted');
    } catch (error) {
      this.setState('failed', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.restarting = false;
    }
  }

  get port() {
    return this.options.port;
  }

  get dataDir() {
    return this.options.dataDir;
  }

  get hudRoot() {
    return this.options.hudRoot;
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
        // After an update the engine left running is the old build (older limits, missing routes): replace it.
        // Its match state is saved, so overlays reconnect to the same graphics within a second or two.
        if ((await this.outdated()) || this.lockHost !== this.host) {
          await this.replace();
          this.reattached = false;
        }
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
    let lock: { pid?: number; port?: number; host?: string };
    try {
      lock = JSON.parse(await this.options.readFile(join(this.options.dataDir, 'engine.lock')));
    } catch {
      return false;
    }
    if (typeof lock.pid !== 'number' || !this.options.isAlive(lock.pid)) return false;
    if (lock.port !== this.options.port) return false;
    this.lockHost = lock.host || '127.0.0.1';
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

  /** Whether the running engine was started from a different binary than the one Air ships now. */
  private async outdated(): Promise<boolean> {
    if (!this.options.buildId) return false;
    let running = '';
    try {
      running = (await this.options.readFile(join(this.options.dataDir, 'engine.build'))).trim();
    } catch {
      // Started by an Air from before builds were recorded: also an older build.
    }
    return running !== this.options.buildId;
  }

  /** Stops the running engine and starts the shipped one. */
  private async replace(): Promise<void> {
    const pid = this.status?.pid;
    try {
      await this.client.post('/control/shutdown');
    } catch {
      // Already going.
    }
    for (let i = 0; i < 40 && pid && this.options.isAlive(pid); i++) await this.sleep(100);
    if (pid && this.options.isAlive(pid)) this.options.kill(pid);
    await this.launch();
  }

  private async launch(): Promise<void> {
    const { binary, hudRoot, dataDir, port, key } = this.options;
    if (this.options.buildId && this.options.writeFile) await this.options.writeFile(join(dataDir, 'engine.build'), this.options.buildId).catch(() => undefined);
    const child = this.options.spawn(binary, ['--root', hudRoot, '--data', dataDir, '--host', this.host, '--port', String(port)], {
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
