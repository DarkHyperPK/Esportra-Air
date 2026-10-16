'use strict';
class CaptureWindow {
  constructor({ now = Date.now, maxBytes = 8 * 1024 * 1024, maxItems = 10000 } = {}) {
    this.now = now; this.maxBytes = maxBytes; this.maxItems = maxItems; this.entries = []; this.bytes = 0; this.dropped = 0;
    this.acknowledged = 0;
  }
  push(packet) {
    const size = Buffer.byteLength(JSON.stringify(packet));
    if (size > this.maxBytes) { this.dropped += 1; return; }
    this.entries.push({ packet, at: Number.isFinite(packet.ts) ? Math.min(this.now(), packet.ts) : this.now(), size }); this.bytes += size; this.prune();
  }
  prune() {
    while (this.entries.length && (this.now() - this.entries[0].at > 60000 || this.bytes > this.maxBytes || this.entries.length > this.maxItems)) {
      const removed = this.entries.shift(); this.bytes -= removed.size; if (removed.packet.sequence > this.acknowledged) this.dropped += 1;
    }
  }
  since(sequence, streamId) { this.prune(); return this.entries.filter(item => streamId !== item.packet.streamId || item.packet.sequence > sequence).map(item => ({ ...item.packet, recovered: true, bufferedAgeMs: Math.max(0, this.now() - item.at) })); }
  status() { this.prune(); return { retainedMessages: this.entries.length, retainedBytes: this.bytes, oldestAgeMs: this.entries.length ? this.now() - this.entries[0].at : 0, droppedMessages: this.dropped }; }
  capturedAt(sequence) { return this.entries.find(item => item.packet.sequence === sequence)?.packet.ts ?? null; }
  acknowledge(sequence) { if (Number.isInteger(sequence)) this.acknowledged = Math.max(this.acknowledged, sequence); }
}
module.exports = CaptureWindow;
