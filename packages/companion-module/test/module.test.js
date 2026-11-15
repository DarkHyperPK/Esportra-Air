const { test } = require('node:test')
const assert = require('node:assert/strict')
const { WebSocketServer } = require('ws')
const { AirLink } = require('../link.js')
const { EsportraAir, variableDefinitions } = require('../main.js')

const serve = () => new Promise((done) => {
	const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }, () => done(wss))
})
const until = async (check, label) => {
	const end = Date.now() + 3000
	while (!check()) { if (Date.now() > end) assert.fail(label); await new Promise((r) => setTimeout(r, 20)) }
}

test('the link reads hello, values and events, and an action resolves or rejects with Air’s reason', async () => {
	const wss = await serve()
	wss.on('connection', (ws, req) => {
		assert.match(req.url, /^\/companion\?key=k%2Fey$/)
		ws.send(JSON.stringify({ type: 'hello', mode: 'both', screens: [{ id: 'halftime', title: 'Halftime' }], talent: [], sponsors: [] }))
		ws.send(JSON.stringify({ type: 'values', values: { score_a: 3 } }))
		ws.send(JSON.stringify({ type: 'event', name: 'map_end', data: {} }))
		ws.on('message', (raw) => {
			const m = JSON.parse(raw.toString())
			ws.send(JSON.stringify(m.name === 'toast' ? { type: 'result', id: m.id, ok: true } : { type: 'result', id: m.id, ok: false, error: 'No.' }))
		})
	})
	const seen = { status: [], hello: null, values: null, events: [] }
	const link = new AirLink({ host: '127.0.0.1', port: wss.address().port, key: 'k/ey', onStatus: (s) => seen.status.push(s), onHello: (h) => (seen.hello = h), onValues: (v) => (seen.values = v), onEvent: (e) => seen.events.push(e.name) })
	await assert.rejects(link.act('toast'), /Not connected/)
	link.start()
	await until(() => seen.events.length === 1, 'event')
	assert.deepEqual([seen.status.at(-1), seen.hello.screens[0].id, seen.values.score_a, seen.events[0]], ['ok', 'halftime', 3, 'map_end'])
	await link.act('toast', { text: 'hi' })
	await assert.rejects(link.act('nope'), /No\./)
	link.stop()
	wss.close()
})

test('a wrong key says so instead of retrying silently', async () => {
	const { createServer } = require('node:http')
	const http = createServer()
	http.on('upgrade', (_req, socket) => { socket.write('HTTP/1.1 401 No\r\n\r\n'); socket.destroy() })
	await new Promise((r) => http.listen(0, '127.0.0.1', r))
	const why = []
	const link = new AirLink({ host: '127.0.0.1', port: http.address().port, key: 'x', retryMs: 50, onStatus: (s, w) => why.push([s, w]) })
	link.start()
	await until(() => why.some(([s]) => s === 'bad_key'), 'bad key')
	assert.match(why.find(([s]) => s === 'bad_key')[1], /key does not match/)
	link.stop()
	http.close()
})

test('the module defines actions from Air’s own screens, people and sponsors; autopilot buttons only with Both', () => {
	const made = {}
	const fake = Object.assign(Object.create(EsportraAir.prototype), {
		hello: { mode: 'companion', screens: [{ id: 'map-result', title: 'Map result' }], talent: [{ id: 't1', name: 'Sara Malik' }], sponsors: [] },
		values: { on_air: 'Map result', cued: 1 }, lastEvent: 'map_end',
		setActionDefinitions: (a) => (made.actions = a), setFeedbackDefinitions: (f) => (made.feedbacks = f), setPresetDefinitions: (p) => (made.presets = p),
	})
	fake.define()
	assert.deepEqual(Object.keys(made.actions), ['fullscreen', 'talent', 'sponsor', 'toast', 'pause', 'take', 'take_stinger', 'clear'])
	assert.deepEqual(made.actions.fullscreen.options[0].choices, [{ id: 'map-result', label: 'Map result' }])
	assert.deepEqual(made.actions.talent.options[0].choices.map((c) => c.label), ['Hide the lower third', 'Sara Malik'])
	assert.equal(made.feedbacks.on_air.callback({ options: { screen: 'map-result' } }), true)
	assert.equal(made.feedbacks.cued.callback(), true)
	assert.equal(made.feedbacks.last_event.callback({ options: { event: 'map_end' } }), true)
	assert.ok(made.presets['fs_map-result'] && made.presets.take && made.presets.tech)
	fake.hello = { ...fake.hello, mode: 'both' }
	fake.define()
	assert.ok(made.actions.autopilot_take)
	const ids = variableDefinitions().map((v) => v.variableId)
	assert.ok(['score_a', 'p10_credits', 'event_count', 'last_event'].every((id) => ids.includes(id)))
})
