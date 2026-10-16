"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
class OutputRegistry {
  constructor({ config, hudRoot, port, currentMatch = () => 'MAIN' }) {
    this.config = config;
    this.hudRoot = hudRoot;
    this.port = port;
    this.currentMatch = currentMatch;
  }
  catalogue() {
    try {
      return fs
        .readdirSync(path.join(this.hudRoot, "overlays"))
        .filter((name) => /^[\w-]+\.html$/.test(name))
        .sort()
        .map((file) => ({ name: file.slice(0, -5), type: "Browser source" }));
    } catch {
      return [];
    }
  }
  list() {
    const saved = this.config.get("outputs");
    return (Array.isArray(saved) ? saved : [])
      .filter(
        (output) =>
          output &&
          typeof output.id === "string" &&
          typeof output.name === "string" &&
          /^[\w-]+$/.test(output.overlay || "") &&
          /^[A-Za-z0-9_-]{1,64}$/.test(output.matchCode || ""),
      )
      .slice(0, 100)
      .map((output) => ({
        id: output.id,
        name: output.name,
        overlay: output.overlay,
        matchCode: output.matchCode,
        followMatch: output.followMatch === true,
        type: "Browser source",
        url: `http://localhost:${this.port}/o/${encodeURIComponent(output.id)}`,
      }));
  }
  add({ name, overlay, matchCode = "MAIN", followMatch = true } = {}) {
    if (typeof followMatch !== 'boolean') throw new Error('Choose whether this output follows the selected match.');
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80)
      throw new Error("Enter an output name, up to 80 characters.");
    if (!this.catalogue().some((item) => item.name === overlay))
      throw new Error("Choose an existing HUD overlay.");
    if (typeof matchCode !== "string" || !/^[A-Z0-9_-]{1,64}$/i.test(matchCode))
      throw new Error("Use an alphanumeric match code.");
    const saved = this.list().map(({ url, type, ...item }) => item);
    if (saved.length >= 100)
      throw new Error("This machine already has 100 outputs.");
    const output = {
      id: crypto.randomUUID(),
      name: name.trim(),
      overlay,
      matchCode,
      followMatch,
    };
    this.config.set("outputs", [...saved, output]);
    return output;
  }
  remove(id) {
    const saved = this.list().map(({ url, type, ...item }) => item);
    if (!saved.some((item) => item.id === id))
      throw new Error("Output no longer exists.");
    this.config.set(
      "outputs",
      saved.filter((item) => item.id !== id),
    );
  }
  resolve(id) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const output = this.list().find(item => item.id === id);
    if (!output || !this.catalogue().some(item => item.name === output.overlay)) return null;
    const code = output.followMatch ? this.currentMatch() || 'MAIN' : output.matchCode;
    return { ...output, matchCode: /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : 'MAIN' };
  }
}
module.exports = OutputRegistry;
