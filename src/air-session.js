"use strict";
const { randomUUID, createHash } = require("node:crypto");
const AirLocalStore = require("./air-local-store");
const { UUID, validateProject } = require("./air-projects");
const { verifyLease } = require("./air-access");
class AirHttpError extends Error {
  constructor(status, message, current) {
    super(message);
    this.status = status;
    this.current = current;
  }
}
class AirSession {
  constructor({
    apiBase,
    fetch,
    keytar,
    service,
    root,
    deviceId,
    deviceName,
    mode,
  }) {
    Object.assign(this, {
      apiBase: apiBase.replace(/\/$/, ""),
      fetch,
      keytar,
      service,
      root,
      deviceId,
      deviceName,
      mode,
    });
    this.credential =
      "air-account:" + createHash("sha256").update(this.apiBase).digest("hex");
    this.session = null;
    this.access = null;
    this.store = null;
    this.syncing = null;
    this.error = null;
    this.eventQueue = { enqueue: (payload) => this.enqueueEvent(payload) };
  }
  async persist() {
    if (this.session)
      await this.keytar.setPassword(
        this.service,
        this.credential,
        JSON.stringify({ session: this.session, access: this.access }),
      );
  }
  async initialize() {
    this.loading = true;
    try {
      const saved = await this.keytar.getPassword(
        this.service,
        this.credential,
      );
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!UUID.test(parsed.session?.userId)) return;
      this.session = parsed.session;
      this.access = parsed.access;
      this.store = new AirLocalStore(
        this.root,
        this.apiBase,
        this.session.userId,
      );
      await this.checkAccess();
      await this.sync();
    } catch (error) {
      this.error = error.message;
    } finally {
      this.loading = false;
    }
  }
  status() {
    const now = Date.now(),
      validUntil = this.session?.account?.validUntil;
    const online =
      !!this.access?.online &&
      now >= this.access.lastSeenAt - 300000 &&
      now - this.access.checkedAt < 300000 &&
      (!validUntil || Date.parse(validUntil) > now);
    const offline =
      !!this.session &&
      !!this.access &&
      !this.access.denied &&
      verifyLease(this.access.lease, {
        userId: this.session.userId,
        deviceId: this.deviceId,
        now,
        lastSeenAt: this.access.lastSeenAt,
        pinnedKey: this.access.pinnedKey,
      });
    let expiresAt = null;
    try {
      expiresAt = this.access?.lease
        ? JSON.parse(
            Buffer.from(this.access.lease.payload, "base64").toString(),
          ).expiresAt
        : null;
    } catch (_) {}
    return {
      loading: this.loading === true,
      authenticated: !!this.session?.userId,
      userId: this.session?.userId || null,
      email: this.session?.email || null,
      workspaces: this.session?.workspaces || [],
      account: this.session?.account || null,
      deviceId: this.deviceId,
      canProduce: online || offline,
      offline: !online && offline,
      offlineExpiresAt: expiresAt,
      warning:
        this.access?.warning ||
        (expiresAt &&
        Date.parse(expiresAt) - now < 86400000 &&
        Date.parse(expiresAt) > now
          ? "Cached access expires within 24 hours. Reconnect before your next broadcast."
          : null) ||
        (offline
          ? "Working offline with verified access. Reconnect before the cached access expires."
          : this.session && !online
            ? "Connect to renew Air access before starting another broadcast."
            : null),
      error: this.error,
      pending:
        this.store?.list().filter((project) => project.dirty).length || 0,
    };
  }
  async assertAccess() {
    if (!this.status().canProduce) await this.checkAccess();
    if (!this.status().canProduce)
      throw new Error(
        "Renew Air access before starting another match. Your existing draft is retained.",
      );
    this.access.lastSeenAt = Math.max(this.access.lastSeenAt || 0, Date.now());
    await this.persist();
  }
  async tokens(input) {
    if (
      !input?.access_token ||
      !input.refresh_token ||
      !Number.isFinite(Number(input.expires_in))
    )
      throw new Error("Account service returned an incomplete session.");
    this.session = {
      ...this.session,
      accessToken: input.access_token,
      refreshToken: input.refresh_token,
      expiresAt: Date.now() + Math.min(86400, Number(input.expires_in)) * 1000,
    };
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    const userId = this.session?.userId,
      refreshToken = this.session?.refreshToken;
    const operation = (async () => {
      const response = await this.fetch(
        this.apiBase + "/api/air/auth/refresh",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
          timeout: 10000,
          redirect: "error",
          size: 65536,
        },
      );
      if (
        this.session?.userId !== userId ||
        this.session?.refreshToken !== refreshToken
      )
        throw new Error("Account changed during session renewal.");
      if (!response.ok)
        throw new AirHttpError(
          response.status,
          response.status === 401
            ? "Sign in again to renew the account session."
            : "Account connection is unavailable.",
        );
      const tokens = await response.json();
      if (this.session?.userId !== userId)
        throw new Error("Account changed during session renewal.");
      await this.tokens(tokens);
      await this.persist();
    })();
    this.refreshing = operation;
    try {
      return await operation;
    } finally {
      if (this.refreshing === operation) this.refreshing = null;
    }
  }
  async request(
    route,
    { method = "GET", body, raw, headers = {} } = {},
    retry = true,
  ) {
    if (!this.session?.accessToken)
      throw new Error("Sign in to use independent projects.");
    if (this.session.expiresAt < Date.now() + 30000) await this.refresh();
    const requestedUser = this.session.userId;
    const response = await this.fetch(this.apiBase + route, {
      method,
      headers: {
        ...(raw ? {} : { "Content-Type": "application/json" }),
        ...headers,
        Authorization: "Bearer " + this.session.accessToken,
        "X-Air-Device-Id": this.deviceId,
      },
      body: raw || (body === undefined ? undefined : JSON.stringify(body)),
      timeout: 10000,
      redirect: "error",
      size: 8 * 1024 * 1024,
    });
    if (this.session?.userId !== requestedUser)
      throw new Error("Account changed during the request.");
    if (response.status === 401 && retry) {
      await this.refresh();
      return this.request(route, { method, body, raw, headers }, false);
    }
    if (!response.ok) {
      let result = {};
      try {
        result = await response.json();
      } catch (_) {}
      throw new AirHttpError(
        response.status,
        result.error || "Air could not complete this request.",
        result.current,
      );
    }
    return response;
  }
  async json(route, options) {
    return (await this.request(route, options)).json();
  }
  async login(email, password) {
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      typeof password !== "string" ||
      !password ||
      password.length > 4096
    )
      throw new Error("Enter your Esportra email and password.");
    const old = this.session,
      access = this.access;
    try {
      const response = await this.fetch(
        this.apiBase + "/api/auth/desktop-login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
          timeout: 10000,
          redirect: "error",
          size: 65536,
        },
      );
      if (!response.ok)
        throw new Error("Sign-in failed. Check your email and password.");
      this.session = { email: email.trim() };
      this.access = null;
      await this.tokens(await response.json());
      const result = await this.json("/api/air/session", { method: "POST" });
      if (!UUID.test(result.userId))
        throw new Error("Account identity was not returned.");
      this.session = {
        ...this.session,
        userId: result.userId,
        account: result.account,
        workspaces: result.workspaces,
      };
      this.store = new AirLocalStore(
        this.root,
        this.apiBase,
        this.session.userId,
      );
      await this.checkAccess();
      await this.persist();
      await this.sync();
      return this.status();
    } catch (error) {
      if (!this.session?.userId) {
        this.session = old;
        this.access = access;
      }
      throw error;
    }
  }
  async logout() {
    this.session = null;
    this.access = null;
    this.store = null;
    this.error = null;
    await this.keytar.deletePassword(this.service, this.credential);
  }
  async checkAccess() {
    if (!this.session) throw new Error("Sign in first.");
    const checkingUser = this.session.userId;
    try {
      const info = await this.json("/api/air/session", { method: "POST" });
      if (info.userId !== this.session.userId)
        throw new Error("Account identity changed. Sign in again.");
      this.session = {
        ...this.session,
        account: info.account,
        workspaces: info.workspaces,
      };
      await this.json("/api/air/devices", {
        method: "POST",
        body: {
          deviceId: this.deviceId,
          name: this.deviceName,
          mode: this.mode,
        },
      });
      const result = await this.json("/api/air/access", {
        method: "POST",
        body: { deviceId: this.deviceId },
      });
      const now = Date.now(),
        previous = this.access?.lastSeenAt || 0;
      const lease = result.offlineLease;
      if (
        lease &&
        !verifyLease(lease, {
          userId: this.session.userId,
          deviceId: this.deviceId,
          now,
          lastSeenAt: previous,
          pinnedKey: lease.publicKey,
        })
      )
        throw new Error(
          "Access verification failed. Check the Windows date and time, then reconnect.",
        );
      this.access = {
        online: true,
        checkedAt: now,
        lastSeenAt: Math.max(now, previous),
        lease,
        pinnedKey: lease?.publicKey,
        warning: result.offlineWarning,
        denied: false,
      };
      this.error = null;
      await this.persist();
      return this.status();
    } catch (error) {
      if (this.session?.userId !== checkingUser) throw error;
      if ([401, 403, 409].includes(error.status)) {
        this.access = {
          ...this.access,
          online: false,
          denied: true,
          lease: null,
        };
        await this.persist();
      } else if (this.access) this.access.online = false;
      this.error = error.message;
      if (!this.status().canProduce) throw error;
      return this.status();
    }
  }
  list(workspaceId) {
    if (!this.store) return [];
    return this.store
      .list()
      .filter((project) => !workspaceId || project.workspaceId === workspaceId);
  }
  get(id) {
    if (!UUID.test(id) || !this.store)
      throw new Error("Choose a saved project.");
    const project = this.store.read(id);
    if (!project) throw new Error("Project is not available in this account.");
    return project;
  }
  async save(input) {
    if (!this.session?.userId)
      throw new Error("Sign in before editing projects.");
    if (
      !UUID.test(input.id) ||
      !this.session.workspaces.some(
        (workspace) => workspace.id === input.workspaceId,
      )
    )
      throw new Error("Choose one of your Air workspaces.");
    const previous = this.store.read(input.id);
    if (previous && previous.workspaceId !== input.workspaceId)
      throw new Error(
        "Projects cannot move between workspaces. Create a separate project instead.",
      );
    const project = this.store.edit(validateProject(input));
    void this.sync().catch(() => {});
    return project;
  }
  async create(workspaceId, project) {
    return this.save({
      ...project,
      id: randomUUID(),
      workspaceId,
      revision: 0,
      localVersion: 0,
    });
  }
  async sync() {
    if (this.syncing) return this.syncing;
    if (!this.store || !this.session) return;
    this.syncing = this.performSync().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }
  async performSync() {
    const store = this.store,
      userId = this.session.userId;
    try {
      for (const [id, asset] of Object.entries(store.assetIndex()).filter(
        ([, asset]) => asset.dirty,
      )) {
        await this.request(`/api/air/workspaces/${asset.workspaceId}/assets`, {
          method: "POST",
          raw: store.asset(id),
          headers: { "Content-Type": "image/png", "X-Air-Asset-Id": id },
        });
        if (this.store !== store) return;
        store.write(require("node:path").join(store.root, "assets.json"), {
          ...store.assetIndex(),
          [id]: { ...asset, dirty: false },
        });
      }
      for (const sent of store
        .list()
        .filter((project) => project.dirty && !project.conflict)) {
        try {
          const remote = await this.json(
            sent.revision
              ? `/api/air/projects/${sent.id}`
              : `/api/air/workspaces/${sent.workspaceId}/projects`,
            {
              method: sent.revision ? "PUT" : "POST",
              body: {
                id: sent.id,
                title: sent.title,
                document: sent.document,
                revision: sent.revision,
              },
            },
          );
          if (this.store !== store) return;
          store.acknowledge(sent, remote);
        } catch (error) {
          if (error.status !== 409 || !error.current) throw error;
          if (this.store !== store) return;
          if (
            require("node:util").isDeepStrictEqual(
              JSON.parse(
                JSON.stringify(error.current.document, (k, v) =>
                  v === null ? undefined : v,
                ),
              ),
              JSON.parse(
                JSON.stringify(sent.document, (k, v) =>
                  v === null ? undefined : v,
                ),
              ),
            ) &&
            error.current.title === sent.title
          )
            store.acknowledge(sent, error.current);
          else store.conflict(sent.id, error.current);
        }
      }
      for (const workspace of this.session.workspaces) {
        const projects = await this.json(
          `/api/air/workspaces/${workspace.id}/projects`,
        );
        for (const summary of projects) {
          const local = store.read(summary.id);
          if (!local?.dirty && (!local || summary.revision > local.revision)) {
            const project = await this.json(`/api/air/projects/${summary.id}`);
            if (this.store !== store) return;
            store.save({
              ...project,
              localVersion: (local?.localVersion || 0) + 1,
              dirty: false,
              conflict: null,
            });
          }
        }
      }
      for (const project of store.list())
        for (const team of [
          ...project.document.teams,
          ...(project.document.sponsors || []),
        ]) {
          const id = team.logoAssetId;
          if (id && !store.asset(id)) {
            const response = await this.request(`/api/air/assets/${id}`);
            const bytes = await response.buffer();
            if (this.store !== store) return;
            store.saveAsset(id, project.workspaceId, bytes, false);
          }
        }
      const pending = store.events();
      for (const projectId of [
        ...new Set(pending.map((event) => event.projectId)),
      ]) {
        const events = pending
          .filter((event) => event.projectId === projectId)
          .slice(0, 100);
        const result = await this.json(
          `/api/air/projects/${projectId}/events`,
          { method: "POST", body: { events } },
        );
        if (this.store !== store) return;
        store.acknowledgeEvents(result.accepted || []);
      }
      if (this.session?.userId === userId) this.error = null;
    } catch (error) {
      if (this.session?.userId === userId)
        this.error =
          error.status === 409
            ? "Resolve the project conflict before syncing."
            : error.message;
    }
  }
  enqueueEvent(payload) {
    if (!this.store) return;
    const projectId = payload.showId || payload.event?.showId;
    if (!projectId || !this.store.read(projectId)) return;
    const source = payload.event || payload;
    const allowed = [
      "type",
      "scene",
      "segmentId",
      "actor",
      "ts",
      "data",
      "placementId",
      "durationMs",
      "sponsorId",
    ];
    const data = Object.fromEntries(
      Object.entries(source).filter(([key]) => allowed.includes(key)),
    );
    const encoded = JSON.stringify(data);
    if (encoded.length > 8192)
      throw new Error("Production event exceeds the local metadata limit.");
    this.store.enqueue({
      id: randomUUID(),
      projectId,
      at: new Date().toISOString(),
      type: String(source.type || "ProductionEvent").slice(0, 80),
      data,
    });
  }
  async heartbeat(health) {
    if (!this.session) return;
    if (this.access) {
      this.access.lastSeenAt = Math.max(
        this.access.lastSeenAt || 0,
        Date.now(),
      );
      await this.persist();
    }
    try {
      await this.json(`/api/air/devices/${this.deviceId}/heartbeat`, {
        method: "POST",
        body: health,
      });
    } catch (error) {
      if (error.status === 403) {
        this.access = {
          ...this.access,
          online: false,
          denied: true,
          lease: null,
        };
        await this.persist();
      }
      this.error = error.message;
    }
  }
  async asset(workspaceId, bytes) {
    if (!this.session?.userId) throw new Error("Sign in before adding logos.");
    if (
      !this.session.workspaces.some((workspace) => workspace.id === workspaceId)
    )
      throw new Error("Choose your workspace.");
    const id = randomUUID();
    this.store.saveAsset(id, workspaceId, bytes);
    void this.sync().catch(() => {});
    return { id, url: `http://localhost:5300/air-assets/${id}` };
  }
  resolve(id, choice) {
    if (!["keep-local", "use-cloud"].includes(choice))
      throw new Error("Choose which draft to keep.");
    const project = this.store.resolve(id, choice);
    void this.sync().catch(() => {});
    return project;
  }
}
module.exports = { AirSession, AirHttpError };
