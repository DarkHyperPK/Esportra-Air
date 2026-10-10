'use strict';

// ─── Default rule definitions ─────────────────────────────────────────────────
// Each rule: { name, event, condition?(gepEvent)=>bool, action(gepEvent, runner, ctx) }
// ctx = { hudPatch: async (matchCode, patch) => void }

const DEFAULT_RULES = [
  {
    name:  'economy',
    event: 'valorant_round_start',
    condition: (e) => e.phase === 'buying',
    // Full-buy: auto-take armed segment. Eco/force-buy: enter hold window so
    // operator can decide whether to cut to gameplay or wait.
    action: async (e, runner) => {
      const { activeSegment } = runner.getState();
      if (!activeSegment) return;
      const { state, id } = activeSegment;
      if (e.economy === 'full_buy') {
        if (state === 'armed' || state === 'holding') await runner.take(id);
      } else if (state === 'armed') {
        runner.hold(id);
      }
    },
  },
  {
    name:  'spike_timer',
    event: 'valorant_spike_planted',
    // Show spike timer overlay on the HUD immediately.
    action: async (_e, _runner, { hudPatch, matchCode }) => {
      await hudPatch(matchCode, { show: { spikeTimer: true } });
    },
  },
  {
    name:  'round_recap',
    event: 'valorant_round_end',
    // Show round recap banner for 4 s then dismiss.
    action: async (_e, _runner, { hudPatch, matchCode }) => {
      await hudPatch(matchCode, { show: { roundRecap: 'show' } });
      setTimeout(() => hudPatch(matchCode, { show: { roundRecap: 'hide' } }), 4000);
    },
  },
  {
    name:      'multi_kill',
    event:     'valorant_kill_feed',
    condition: (e) => Array.isArray(e.kills) && e.kills.length >= 3,
    // Ace (5K) or multi-kill (3K/4K) lower-third banner for 5 s.
    action: async (e, _runner, { hudPatch, matchCode }) => {
      const count = e.kills.length;
      const label = count >= 5 ? 'ACE' : `${count}K`;
      await hudPatch(matchCode, { lowerThird: { text: label, show: true } });
      setTimeout(() => hudPatch(matchCode, { lowerThird: { show: false } }), 5000);
    },
  },
];

/**
 * RulesEngine — declarative in-round automation rules.
 *
 * Rules fire asynchronously and are isolated: one rule error does not stop others.
 * Swap rules at runtime via loadRules(rules[]).
 */
class RulesEngine {
  /**
   * @param {{ hudPatch: Function, logger?: object }} opts
   * hudPatch: async (matchCode: string, patch: object) => void
   */
  constructor({ hudPatch, logger = console }) {
    this._hudPatch = hudPatch;
    this._logger   = logger;
    this._rules    = [...DEFAULT_RULES];
  }

  /**
   * Replace the active rule set with a new declarative config.
   * @param {object[]} rules
   */
  loadRules(rules) {
    this._rules = rules;
  }

  /**
   * Process one GEP event against all matching rules.
   * Called by ShowRunner.processGepEvent().
   *
   * @param {object}     gepEvent
   * @param {ShowRunner} showRunner
   */
  async processEvent(gepEvent, showRunner, matchCode = 'MAIN') {
    const ctx = { hudPatch: this._hudPatch, matchCode };
    for (const rule of this._rules) {
      if (rule.event !== gepEvent.type) continue;
      if (rule.condition && !rule.condition(gepEvent)) continue;
      try {
        await rule.action(gepEvent, showRunner, ctx);
      } catch (err) {
        this._logger.error(`[rules-engine] rule "${rule.name}" error:`, err.message);
      }
    }
  }
}

module.exports = { RulesEngine, DEFAULT_RULES };
