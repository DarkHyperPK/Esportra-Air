'use strict';
class VirtualTimers {
  constructor({ position }) { this.position = position; this.next = 0; this.timers = new Map(); }
  schedule(callback, delay) { const id = ++this.next; this.timers.set(id, { at: this.position() + delay, callback }); return id; }
  cancel(id) { this.timers.delete(id); }
  async advance() {
    const due = [...this.timers].filter(([, timer]) => timer.at <= this.position()).sort((a,b) => a[1].at-b[1].at);
    for (const [id, timer] of due) { if (!this.timers.has(id)) continue; this.timers.delete(id); await timer.callback(); }
  }
}
module.exports = VirtualTimers;
