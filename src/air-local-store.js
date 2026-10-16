"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { UUID, validateProject } = require("./air-projects");
class AirLocalStore {
  constructor(root, origin, userId) {
    if (!UUID.test(userId)) throw new Error("Invalid account.");
    this.root = path.join(
      root,
      createHash("sha256")
        .update(origin + ":" + userId)
        .digest("hex"),
    );
    fs.mkdirSync(this.root, { recursive: true });
  }
  file(id) {
    if (!UUID.test(id)) throw new Error("Invalid project identity.");
    return path.join(this.root, id + ".json");
  }
  write(file, value) {
    const temp = file + ".tmp";
    const descriptor = fs.openSync(temp, "w");
    try {
      fs.writeFileSync(descriptor, JSON.stringify(value));
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temp, file);
  }
  read(id) {
    try {
      return JSON.parse(fs.readFileSync(this.file(id), "utf8"));
    } catch (_) {
      return null;
    }
  }
  list() {
    return fs
      .readdirSync(this.root)
      .filter((file) => /^[0-9a-f-]{36}\.json$/i.test(file))
      .map((file) => this.read(file.slice(0, -5)))
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }
  save(project) {
    validateProject(project);
    this.write(this.file(project.id), project);
    return project;
  }
  edit(input) {
    const old = this.read(input.id);
    if (old && input.localVersion !== old.localVersion)
      throw new Error("This local draft changed. Reload it before saving.");
    return this.save({
      ...input,
      revision: old?.revision || 0,
      localVersion: (old?.localVersion || 0) + 1,
      dirty: true,
      updatedAt: new Date().toISOString(),
      conflict: old?.conflict || null,
    });
  }
  acknowledge(sent, remote) {
    if (
      remote.id !== sent.id ||
      remote.workspaceId !== sent.workspaceId ||
      !Number.isInteger(remote.revision) ||
      remote.revision < 1
    )
      throw new Error("Cloud project identity does not match the local draft.");
    const current = this.read(sent.id);
    if (!current) return;
    this.save(
      current.localVersion === sent.localVersion
        ? {
            ...remote,
            localVersion: current.localVersion,
            dirty: false,
            conflict: null,
          }
        : { ...current, revision: remote.revision, conflict: null },
    );
  }
  conflict(id, remote) {
    const current = this.read(id);
    if (current) this.save({ ...current, conflict: remote });
  }
  resolve(id, choice) {
    const old = this.read(id);
    if (!old?.conflict) throw new Error("No saved conflict to resolve.");
    this.write(path.join(this.root, `${id}-conflict-${Date.now()}.json`), old);
    return this.save(
      choice === "keep-local"
        ? {
            ...old,
            revision: old.conflict.revision,
            localVersion: old.localVersion + 1,
            dirty: true,
            conflict: null,
          }
        : {
            ...old.conflict,
            localVersion: old.localVersion + 1,
            dirty: false,
            conflict: null,
          },
    );
  }
  events() {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(this.root, "events.json"), "utf8"),
      );
    } catch (_) {
      return [];
    }
  }
  enqueue(event) {
    const events = this.events();
    if (events.length >= 10000)
      throw new Error(
        "Local event queue is full. Reconnect to sync before continuing.",
      );
    this.write(path.join(this.root, "events.json"), [...events, event]);
  }
  acknowledgeEvents(ids) {
    const selected = new Set(ids);
    this.write(
      path.join(this.root, "events.json"),
      this.events().filter((event) => !selected.has(event.id)),
    );
  }
  assetIndex() {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(this.root, "assets.json"), "utf8"),
      );
    } catch (_) {
      return {};
    }
  }
  saveAsset(id, workspaceId, bytes, dirty = true) {
    if (!UUID.test(id) || !UUID.test(workspaceId) || bytes.length > 5242880)
      throw new Error("Invalid logo.");
    const descriptor=fs.openSync(path.join(this.root,id+'.png.tmp'),'w');
    try{fs.writeFileSync(descriptor,bytes);fs.fsyncSync(descriptor);}finally{fs.closeSync(descriptor);}
    fs.renameSync(
      path.join(this.root, id + ".png.tmp"),
      path.join(this.root, id + ".png"),
    );
    this.write(path.join(this.root, "assets.json"), {
      ...this.assetIndex(),
      [id]: { workspaceId, dirty },
    });
  }
  asset(id) {
    if (!UUID.test(id) || !this.assetIndex()[id]) return null;
    try {
      return fs.readFileSync(path.join(this.root, id + ".png"));
    } catch (_) {
      return null;
    }
  }
}
module.exports = AirLocalStore;
