'use strict';
const { EventEmitter } = require('events');
const FEATURES = ['score', 'round', 'players', 'credits', 'spike', 'playerCapture', 'map', 'observed'];

class ProductionFeed extends EventEmitter {
  constructor({ now = Date.now } = {}) { super(); this.now = now; this.reset(null); }
  reset(matchCode) { this.matchCode = matchCode; this.state = null; this.lastAt = null; this.events=[];this.packets=[]; this.activity = Object.fromEntries(FEATURES.map(name => [name, []])); }
  recordPackets(matchCode, messages = []) { if (matchCode!==this.matchCode)return; for(const message of messages.slice(-50)) { let data; try {data=JSON.stringify(message);}catch(_){continue;} if(data.length>32768)continue;this.packets.push({at:this.now(),data:JSON.parse(data)}); }this.packets=this.packets.slice(-100); }
  update(matchCode, state) { if (matchCode === this.matchCode && this.state) this.state = state; }
  seed(matchCode, state) { if (matchCode === this.matchCode && this.lastAt === null) this.state = state; }

  accept(matchCode, state, events = [], reported = [], captureAt = this.now()) {
    if (matchCode !== this.matchCode) return false;
    if (!reported.length && !events.length) return false;
    const now = captureAt;
    for (const feature of FEATURES) {
      if (reported.includes(feature)) this.activity[feature].push(now);
      const last = this.activity[feature].at(-1);
      this.activity[feature] = this.activity[feature].filter(time => time >= this.now() - 60000).slice(-6000);
      if (!this.activity[feature].length && last !== undefined) this.activity[feature].push(last);
    }
    this.state = state;
    for(const event of events.slice(-100))this.events.push({at:now,name:event.type || event.name || 'Game update',data:Object.fromEntries(Object.entries(event).filter(([key])=>key!=='state'))});this.events=this.events.slice(-200);
    // Player-PC heartbeats do not establish that the observer's match feed is fresh.
    if (reported.some(feature => feature !== 'playerCapture') || events.length) this.lastAt = Math.max(this.lastAt ?? 0, now);
    this.emit('events', events); return true;
  }

  snapshot() {
    const state = this.state, now = this.now();
    if (!state) return { available: false, matchCode: this.matchCode, features: [], events: [] };
    const ageMs = this.lastAt === null ? null : Math.max(0, now - this.lastAt), known = name => this.activity[name].length > 0;
    const live = ['live', 'planted'].includes(state.round?.phase);
    const named = team => (state.players?.[team] || []).filter(player => player.name);
    return {
      available: true, matchCode: this.matchCode, ageMs, stale: live && (ageMs === null || ageMs >= 10000),
      round: known('round') ? state.round?.number ?? null : null, phase: known('round') ? state.round?.phase || 'unknown' : 'unknown',
      map:known('map')?state.map?.name || null:null,observedPlayer:known('observed')?state.players?.[state.observed?.[0]]?.[state.observed?.[1]]?.name || null:null,
      players:known('players')?(state.players || []).flatMap((players,team)=>players.filter(player=>player.name).map((player,slot)=>({...player,team,slot:`${team}:${slot}`,creditsKnown:known('credits')}))):[],
      teams: [0, 1].map(index => ({ name: state.teams?.[index]?.name || `Team ${index + 1}`, score: known('score') ? state.teams?.[index]?.score ?? null : null, alive: known('players') && named(index).length ? named(index).filter(player => player.alive).length : null, credits: known('credits') && named(index).length ? named(index).reduce((sum, player) => sum + (Number(player.credits) || 0), 0) : null })),
      spike: known('spike') || known('round') ? state.round?.phase === 'planted' ? 'Planted' : 'Not planted' : 'Unknown',
      playerCoverage: (state.players || []).flatMap((team, index) => team.filter(player => player.name).map((player, slot) => ({ slot: `${index}:${slot}`, name: player.name, connected: !!player.captureCoverage && now - player.captureCoverage.lastSeenAt < 10000, lastSeenAt: player.captureCoverage?.lastSeenAt || null, health: player.hpKnown ? player.hp : null, abilities: player.abilitiesKnown ? player.abilityAvailability : null }))),
      features: FEATURES.map(name => { const recent = this.activity[name].filter(time => time >= now - 60000), last = this.activity[name].at(-1); return { name, state: last === undefined ? 'waiting' : now - last < 10000 ? 'live' : 'covered', ageMs: last === undefined ? null : now - last, changes: recent.length }; }),
    };
  }
}
module.exports = ProductionFeed;
