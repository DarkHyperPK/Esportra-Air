// Esportra Air for Bitfocus Companion.
// Air sends game events and values; buttons ask Air for graphics. Air never switches scenes: if you
// want a scene change on an Air event, add your OBS or vMix action to the same trigger in Companion.
//
// Events for triggers: every event sets $(air:last_event) and adds one to $(air:event_count). Make a
// Companion trigger on "variable changed: event_count" with the condition "Esportra Air: Last event is …".
const { InstanceBase, InstanceStatus, runEntrypoint, combineRgb } = require('@companion-module/base')
const { AirLink } = require('./link.js')

const EVENTS = [
	['map_start', 'Map starts'], ['round_live', 'Round live'], ['round_end', 'Round ends'], ['halftime', 'Halftime'], ['map_end', 'Map ends'],
	['spike_planted', 'Spike planted'], ['spike_defused', 'Spike defused'], ['spike_exploded', 'Spike exploded'], ['kill', 'Kill'], ['ace', 'Ace'], ['team_ace', 'Team ace'],
	['graphic_on_air', 'Graphic on air'], ['graphic_off_air', 'Graphic off air'], ['pause_on', 'Tech pause / timeout on'], ['pause_off', 'Tech pause / timeout off'],
	['data_paused', 'Game data paused'], ['data_back', 'Game data back'],
]

/** The values Air keeps up to date (see apps/desktop/src/shared/companion.ts). */
function variableDefinitions() {
	const v = [
		['round', 'Round'], ['phase', 'Round phase'], ['map', 'Map number'], ['map_name', 'Map name'], ['on_air', 'Graphic on air'], ['cued', 'Changes waiting in Cued'], ['autopilot_next', 'Autopilot: next step'],
		['last_event', 'Last event'], ['last_event_team', 'Last event: team (0 or 1)'], ['last_event_round', 'Last event: round'], ['last_event_moment', 'Last round end: moment'], ['event_count', 'Events so far (for triggers)'],
	]
	for (const [s, t] of [['a', 'Team A'], ['b', 'Team B']]) {
		v.push([`team_${s}`, `${t} name`], [`tag_${s}`, `${t} tag`], [`score_${s}`, `${t} score`], [`series_${s}`, `${t} maps won`], [`alive_${s}`, `${t} players alive`], [`credits_${s}`, `${t} credits`])
	}
	for (let n = 1; n <= 10; n++) {
		const who = `Player ${n} (${n <= 5 ? 'team A' : 'team B'})`
		for (const [f, t] of [['name', 'name'], ['agent', 'agent'], ['alive', 'alive'], ['kills', 'kills'], ['deaths', 'deaths'], ['assists', 'assists'], ['credits', 'credits']]) v.push([`p${n}_${f}`, `${who} ${t}`])
	}
	return v.map(([variableId, name]) => ({ variableId, name }))
}

class EsportraAir extends InstanceBase {
	async init(config) {
		this.config = config
		this.hello = { screens: [], talent: [], sponsors: [], mode: 'companion' }
		this.values = {}
		this.events = 0
		this.lastEvent = ''
		this.setVariableDefinitions(variableDefinitions())
		this.setVariableValues({ event_count: 0, last_event: '' })
		this.define()
		this.connect()
	}

	async destroy() {
		this.link?.stop()
	}

	async configUpdated(config) {
		this.config = config
		this.connect()
	}

	getConfigFields() {
		return [
			{ type: 'static-text', id: 'info', width: 12, label: 'Esportra Air', value: 'In Air, open Settings › Graphics control and choose Stream Deck / Companion or Both. Copy the address and key from Settings › Companion.' },
			{ type: 'textinput', id: 'host', label: 'Air PC address', width: 8, default: '127.0.0.1' },
			{ type: 'number', id: 'port', label: 'Port', width: 4, min: 1, max: 65535, default: 5321 },
			{ type: 'textinput', id: 'key', label: 'Key', width: 12, default: '' },
		]
	}

	connect() {
		this.link?.stop()
		const { host, port, key } = this.config ?? {}
		if (!host || !key) {
			this.updateStatus(InstanceStatus.BadConfig, 'Enter the address and key from Air › Settings › Companion.')
			return
		}
		this.link = new AirLink({
			host, port: Number(port) || 5321, key,
			onStatus: (s, why) => this.updateStatus(s === 'ok' ? InstanceStatus.Ok : s === 'connecting' ? InstanceStatus.Connecting : s === 'bad_key' ? InstanceStatus.AuthenticationFailure : InstanceStatus.ConnectionFailure, why ?? null),
			onHello: (h) => { this.hello = h; this.define() },
			onValues: (v) => { this.values = v; this.setVariableValues(v); this.checkFeedbacks('on_air', 'cued') },
			onEvent: (e) => {
				this.events += 1
				this.lastEvent = e.name
				this.setVariableValues({
					last_event: e.name, event_count: this.events, last_event_team: e.data.team ?? '', last_event_round: e.data.round ?? '', last_event_moment: e.data.moment ?? '',
				})
				this.checkFeedbacks('last_event')
			},
		})
		this.link.start()
	}

	async act(name, args) {
		try {
			await this.link?.act(name, args)
		} catch (e) {
			this.log('warn', `Air: ${e.message}`)
		}
	}

	/** Actions, feedbacks and presets, with Air's own screens, people and sponsors in the dropdowns. */
	define() {
		const screens = this.hello.screens.map((s) => ({ id: s.id, label: s.title }))
		const talent = [{ id: '', label: 'Hide the lower third' }, ...this.hello.talent.map((t) => ({ id: t.id, label: t.name }))]
		const sponsors = [{ id: '', label: 'Hide the lower third' }, ...this.hello.sponsors.map((s) => ({ id: s.id, label: s.name }))]
		const screenField = { type: 'dropdown', id: 'screen', label: 'Graphic', choices: screens, default: screens[0]?.id ?? '' }
		const actions = {
			fullscreen: {
				name: 'Full-screen graphic', options: [screenField, { type: 'dropdown', id: 'on', label: 'Do', choices: [{ id: 'toggle', label: 'Toggle' }, { id: 'on', label: 'Show' }, { id: 'off', label: 'Hide' }], default: 'toggle' }],
				callback: (a) => this.act('fullscreen', { screen: a.options.screen, on: a.options.on }),
			},
			talent: { name: 'Talent lower third', options: [{ type: 'dropdown', id: 'talentId', label: 'Person', choices: talent, default: talent[1]?.id ?? '' }], callback: (a) => this.act('talent', { talentId: a.options.talentId || null }) },
			sponsor: { name: 'Sponsor lower third', options: [{ type: 'dropdown', id: 'sponsorId', label: 'Sponsor', choices: sponsors, default: sponsors[1]?.id ?? '' }], callback: (a) => this.act('sponsor', { sponsorId: a.options.sponsorId || null }) },
			toast: { name: 'Toast', options: [{ type: 'textinput', id: 'text', label: 'Text', default: '', useVariables: true }], callback: async (a, ctx) => this.act('toast', { text: await ctx.parseVariablesInString(a.options.text) }) },
			pause: { name: 'Tech pause / timeout', options: [{ type: 'dropdown', id: 'kind', label: 'Panel', choices: [{ id: 'technical', label: 'Tech pause' }, { id: 'timeout', label: 'Timeout' }, { id: 'none', label: 'End the pause' }], default: 'technical' }], callback: (a) => this.act('pause', { kind: a.options.kind === 'none' ? null : a.options.kind }) },
			take: { name: 'Take what is cued', options: [], callback: () => this.act('take') },
			take_stinger: { name: 'Take behind the stinger', options: [], callback: () => this.act('take_stinger') },
			clear: { name: 'Clear Cued', options: [], callback: () => this.act('clear') },
		}
		if (this.hello.mode === 'both') {
			actions.autopilot_hold = { name: 'Autopilot: hold', options: [], callback: () => this.act('autopilot_hold') }
			actions.autopilot_skip = { name: 'Autopilot: skip', options: [], callback: () => this.act('autopilot_skip') }
			actions.autopilot_take = { name: 'Autopilot: take now', options: [], callback: () => this.act('autopilot_take') }
		}
		this.setActionDefinitions(actions)

		const red = { bgcolor: combineRgb(225, 29, 72), color: combineRgb(255, 255, 255) }
		const titleOf = (id) => this.hello.screens.find((s) => s.id === id)?.title
		this.setFeedbackDefinitions({
			on_air: { type: 'boolean', name: 'Graphic is on air', defaultStyle: red, options: [screenField], callback: (f) => this.values.on_air === titleOf(f.options.screen) },
			cued: { type: 'boolean', name: 'Something is waiting in Cued', defaultStyle: { bgcolor: combineRgb(251, 191, 36), color: combineRgb(0, 0, 0) }, options: [], callback: () => Number(this.values.cued) > 0 },
			last_event: {
				type: 'boolean', name: 'Last event is …', description: 'Use as the condition of a trigger on "event_count changed".', defaultStyle: red,
				options: [{ type: 'dropdown', id: 'event', label: 'Event', choices: EVENTS.map(([id, label]) => ({ id, label })), default: 'map_end' }],
				callback: (f) => this.lastEvent === f.options.event,
			},
		})

		const style = (text, bg = combineRgb(24, 24, 27)) => ({ text, size: '14', color: combineRgb(255, 255, 255), bgcolor: bg })
		const presets = {}
		for (const s of this.hello.screens) {
			presets[`fs_${s.id}`] = { type: 'button', category: 'Full-screen graphics', name: s.title, style: style(s.title), steps: [{ down: [{ actionId: 'fullscreen', options: { screen: s.id, on: 'toggle' } }], up: [] }], feedbacks: [{ feedbackId: 'on_air', options: { screen: s.id }, style: red }] }
		}
		presets.take = { type: 'button', category: 'Cued', name: 'Take', style: style('TAKE'), steps: [{ down: [{ actionId: 'take', options: {} }], up: [] }], feedbacks: [{ feedbackId: 'cued', options: {}, style: { bgcolor: combineRgb(251, 191, 36), color: combineRgb(0, 0, 0) } }] }
		presets.stinger = { type: 'button', category: 'Cued', name: 'Take behind the stinger', style: style('STINGER'), steps: [{ down: [{ actionId: 'take_stinger', options: {} }], up: [] }], feedbacks: [] }
		presets.clear = { type: 'button', category: 'Cued', name: 'Clear', style: style('CLEAR'), steps: [{ down: [{ actionId: 'clear', options: {} }], up: [] }], feedbacks: [] }
		presets.tech = { type: 'button', category: 'Pauses', name: 'Tech pause', style: style('TECH\\nPAUSE'), steps: [{ down: [{ actionId: 'pause', options: { kind: 'technical' } }], up: [] }], feedbacks: [] }
		presets.score = { type: 'button', category: 'Values', name: 'Score', style: style('$(air:tag_a) $(air:score_a)\\n$(air:tag_b) $(air:score_b)'), steps: [], feedbacks: [] }
		this.setPresetDefinitions(presets)
	}
}

// Companion starts this file as its own process; tests require it without starting Companion's link.
if (require.main === module) runEntrypoint(EsportraAir, [])

module.exports = { EsportraAir, variableDefinitions, EVENTS }
