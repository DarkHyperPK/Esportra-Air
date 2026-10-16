'use strict';
// Only the dedicated node-auth contract can invalidate pairing. Network outages cannot.
class NodeSessionMonitor {
  constructor({ apiBase, token, onRevoked, fetch, schedule = setInterval, cancel = clearInterval }) {
    this.apiBase = apiBase.replace(/\/$/, ''); this.token = token; this.onRevoked = onRevoked; this.fetch = fetch; this.schedule = schedule; this.cancel = cancel;
    this.timer = null; this.busy = false; this.stopped = true;
  }
  start() { this.stop(); this.stopped = false; void this.check(); this.timer = this.schedule(() => void this.check(), 10000); }
  stop() { this.stopped = true; this.cancel(this.timer); this.timer = null; }
  async revoke() { if (!this.stopped) { this.stop(); await this.onRevoked(); } }
  async check() {
    if (this.stopped || this.busy) return;
    this.busy = true;
    try {
      const response = await this.fetch(`${this.apiBase}/api/broadcast/nodes/session`, { headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(2000) });
      if (this.stopped || response.status !== 401) return;
      const data = await response.json();
      if (data?.error === 'node_not_active' && !this.stopped) await this.revoke();
    } catch { /* Offline/old backend keeps local pairing and retries. */ }
    finally { this.busy = false; }
  }
}
module.exports = NodeSessionMonitor;
