'use strict';
const { randomUUID } = require('node:crypto');
const copy = value => JSON.parse(JSON.stringify(value));
const FIELDS = ['scores', 'series', 'map_result', 'names', 'player_name', 'sides', 'observed'];
const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max && !/[<>\x00-\x1f\x7f]/.test(value);
const scope = state => JSON.stringify(state.airContext || null);
const round = state => Number.isInteger(state.round?.number) && state.round.number > 0 ? { map: String(state.map?.name || '').toUpperCase(), number: state.round.number } : null;
const playerKey = player => player?.id || player?.name || null;
function validate(field, value, state) {
  if (!FIELDS.includes(field)) throw new Error('Choose scores, series, map result, names, sides or the observed player.');
  if (!Array.isArray(state.teams) || state.teams.length !== 2) throw new Error('Match teams are unavailable.');
  if (!Array.isArray(value) || value.length !== 2) throw new Error('Provide the two current team values.');
  if (field === 'scores' && !value.every(score => Number.isInteger(score) && score >= 0 && score <= 999)) throw new Error('On-air scores must be integers from 0 to 999.');
  if (field === 'series' && !value.every(score => Number.isInteger(score) && score >= 0 && score <= 9)) throw new Error('Series wins must be integers from 0 to 9.');
  if (field === 'map_result' && !value.every(item => item && Object.keys(item).every(key => ['mapIndex', 'score'].includes(key)) && Number.isInteger(item.mapIndex) && item.mapIndex >= 1 && item.mapIndex <= 9 && Number.isInteger(item.score) && item.score >= 0 && item.score <= 2147483647 && item.mapIndex === value[0].mapIndex)) throw new Error('Choose one valid map and two non-negative scores.');
  if (field === 'names' && !value.every(team => team && Object.keys(team).every(key => ['name', 'tag'].includes(key)) && text(team.name, 80) && text(team.tag, 12))) throw new Error('Use plain team names (1–80 characters) and tags (1–12).');
  if (field === 'sides' && !(value.includes('ATK') && value.includes('DEF'))) throw new Error('Assign one attacking and one defending team.');
  if (field === 'observed' && !([0, 1].includes(value[0]) && Number.isInteger(value[1]) && value[1] >= 0 && value[1] < 5 && state.players?.[value[0]]?.[value[1]]?.name)) throw new Error('Choose a player from the received roster.');
  if (field === 'player_name' && !([0, 1].includes(value[0]) && value[1] && Object.keys(value[1]).every(key => ['index', 'name'].includes(key)) && Number.isInteger(value[1].index) && value[1].index >= 0 && value[1].index < 5 && state.players?.[value[0]]?.[value[1].index]?.name && text(value[1].name, 80))) throw new Error('Choose a received player and a plain display name (1–80 characters).');
  return copy(value);
}
class DisplayFixes {
  constructor({ saved, save = () => {}, now = Date.now } = {}) {
    this.save = save; this.now = now;
    this.data = { scope: saved?.scope || null, entries: {}, history: [] };
    // Restored values are validated against the actual current room before use.
    this.restored = saved?.entries && typeof saved.entries === 'object' ? saved.entries : {};
  }
  sync(state, captureAt = null) {
    const nextScope = scope(state);
    if (this.data.scope !== null && this.data.scope !== nextScope) {
      const hadFixes = Object.keys(this.data.entries).length || Object.keys(this.restored).length;
      this.data = { scope: nextScope, entries: {}, history: [] }; this.restored = {};
      if (hadFixes) this.saveAutomatic(); return;
    }
    this.data.scope = nextScope;
    for (const field of FIELDS) {
      const entry = this.restored[field];
      if (!entry) continue;
      try {
        validate(field, entry.value, state);
        if (field === 'player_name' && entry.names !== undefined && (!Array.isArray(entry.names) || entry.names.length > 10 || !entry.names.every(named => named && [0, 1].includes(named.team) && typeof named.playerKey === 'string' && named.playerKey.length <= 256 && typeof named.playerIdBased === 'boolean' && text(named.name, 80)))) throw new Error('Invalid saved display names.');
        if (['cleared', 'next_round'].includes(entry.until) && Number.isFinite(entry.at)) this.data.entries[field] = entry;
      } catch (_) {}
    }
    this.restored = {};
    const current = round(state); let expired = false;
    for (const [field, entry] of Object.entries(this.data.entries)) {
      const advanced = current && (!entry.round || current.map !== entry.round.map || current.number > entry.round.number);
      if (entry.until === 'next_round' && captureAt !== null && captureAt >= entry.at && advanced) { delete this.data.entries[field]; expired = true; }
    }
    if (expired) { this.data.history = []; this.saveAutomatic(); }
  }
  view(state) {
    const result = copy(state);
    for(const players of result.players || [])for(const player of players)if(player.puuid && typeof state.hudNicknames?.[player.puuid]==='string')player.name=state.hudNicknames[player.puuid];
    if (!Array.isArray(result.teams) || result.teams.length !== 2) return result;
    for (const [field, entry] of Object.entries(this.data.entries)) {
      if (field === 'scores') entry.value.forEach((value, index) => { result.teams[index].score = value; });
      if (field === 'series') entry.value.forEach((value, index) => { result.teams[index].series = value; });
      if (field === 'map_result') {
        const mapIndex = entry.value[0].mapIndex;
        if (!Array.isArray(result.series)) result.series = [];
        while (result.series.length < mapIndex) result.series.push({});
        const scores = entry.value.map(item => item.score);
        result.series[mapIndex - 1] = { ...result.series[mapIndex - 1], score: scores, winner: scores[0] > scores[1] ? 0 : scores[0] < scores[1] ? 1 : -1 };
      }
      if (field === 'names') entry.value.forEach((value, index) => { Object.assign(result.teams[index], value); });
      if (field === 'sides') entry.value.forEach((value, index) => { result.teams[index].side = value; });
      if (field === 'observed') {
        for (const team of entry.playerIdBased ? [0, 1] : [entry.value[0]]) {
          const player = (state.players?.[team] || []).findIndex(item => playerKey(item) === entry.playerKey);
          if (player >= 0) result.observed = [team, player];
        }
      }
      if (field === 'player_name') {
        const names = entry.names || [{ playerKey: entry.playerKey, playerIdBased: entry.playerIdBased, team: entry.value[0], name: entry.value[1].name }];
        for (const named of names.slice(0, 10).filter(item => text(item.name, 80))) {
          for (const team of named.playerIdBased ? [0, 1] : [named.team]) {
            const player = (state.players?.[team] || []).findIndex(item => playerKey(item) === named.playerKey);
            if (player >= 0) result.players[team][player].name = named.name;
          }
        }
      }
    }
    return result;
  }
  change(input, state) {
    this.sync(state);
    if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['action', 'field', 'value', 'until', 'reason'].includes(key))) throw new Error('Invalid on-air fix.');
    const beforeData = copy(this.data), before = copy(this.data.entries), id = randomUUID(), at = this.now();
    if (input.action === 'set') {
      const value = validate(input.field, input.value, state);
      if (!['cleared', 'next_round'].includes(input.until) || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 500) throw new Error('Choose an expiry and enter a reason (1–500 characters).');
      this.data.entries[input.field] = { id, at, value, until: input.until, reason: input.reason.trim(), round: round(state), ...(input.field === 'observed' ? { playerKey: playerKey(state.players[value[0]][value[1]]), playerIdBased: !!state.players[value[0]][value[1]].id } : {}) };
      if (input.field === 'player_name') {
        const named = { playerKey: playerKey(state.players[value[0]][value[1].index]), playerIdBased: !!state.players[value[0]][value[1].index].id, team: value[0], name: value[1].name };
        const previous = before.player_name;
        const names = previous?.names || (previous ? [{ playerKey: previous.playerKey, playerIdBased: previous.playerIdBased, team: previous.value[0], name: previous.value[1].name }] : []);
        Object.assign(this.data.entries[input.field], named, { names: [...names.filter(item => item.playerKey !== named.playerKey || !named.playerIdBased && item.team !== named.team), named].slice(-10) });
      }
    } else if (input.action === 'clear') {
      if (input.field != null && !FIELDS.includes(input.field)) throw new Error('Choose an existing fix to clear.');
      if (input.field) delete this.data.entries[input.field]; else this.data.entries = {};
    } else if (input.action === 'undo') {
      const previous = this.data.history.pop(); if (!previous) throw new Error('No fix to undo in this round.');
      this.data.entries = previous.before;
    } else throw new Error('Choose Apply, Clear or Undo.');
    if (input.action !== 'undo') this.data.history = [...this.data.history.slice(-19), { id, at, before }];
    try { this.persist(); } catch (error) { this.data = beforeData; throw error; }
    return { id, at, action: input.action, field: input.field || null, before, after: copy(this.data.entries) };
  }
  persist() { this.save(copy(this.data)); this.storageWarning = null; }
  saveAutomatic() { try { this.persist(); } catch (_) { this.storageWarning = 'The override cleared in memory, but its saved copy could not be updated. Check local storage before restarting.'; } }
  status(state) { const displayed = this.view(state); return { active: Object.entries(this.data.entries).map(([field, entry]) => ({ field, ...entry })), canUndo: this.data.history.length > 0, storageWarning: this.storageWarning || null,
    round: round(state), teams: (Array.isArray(displayed.teams) ? displayed.teams : []).slice(0, 2).map((team, index) => ({ name: team.name, tag: team.tag, side: team.side, score: team.score, series: team.series, sourceScore: state.teams[index].score })), observed: displayed.observed,
    players: (displayed.players || []).slice(0, 2).map(players => players.slice(0, 5).map(player => ({ name: player.name || '', id: player.id || null }))) }; }
}
module.exports = { DisplayFixes };
