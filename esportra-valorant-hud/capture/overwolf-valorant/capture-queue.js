'use strict';
class CaptureQueue {
  constructor({ now = Date.now } = {}) { this.now = now; this.items = []; this.bytes = 0; }
  add(message) {
    const bytes = Buffer.byteLength(JSON.stringify(message));
    if (bytes > 8 * 1024 * 1024) return;
    const age = Number.isFinite(message.bufferedAgeMs) ? Math.max(0, message.bufferedAgeMs) : 0;
    this.items.push({ message, bytes, at: this.now() - age }); this.bytes += bytes;
    while (this.items.length && (this.now() - this.items[0].at > 60000 || this.bytes > 8 * 1024 * 1024 || this.items.length > 10000)) { const item = this.items.shift(); this.bytes -= item.bytes; }
  }
  drain() {
    const result = this.items.filter(item => this.now() - item.at <= 60000).map(item => ({ ...item.message, recovered: true, bufferedAgeMs: this.now() - item.at }));
    this.items = []; this.bytes = 0; return result;
  }
}
module.exports = CaptureQueue;
