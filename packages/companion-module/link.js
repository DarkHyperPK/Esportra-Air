// The connection to Esportra Air: a WebSocket with the key, reconnecting by itself. Kept apart from
// Companion's SDK so it can be tested against Air directly.
const WebSocket = require('ws')

class AirLink {
	/**
	 * @param {{ host: string, port: number, key: string, onStatus?: (s: 'connecting'|'ok'|'bad_key'|'error', why?: string) => void,
	 *   onHello?: (h: any) => void, onValues?: (v: Record<string, any>) => void, onEvent?: (e: {name: string, data: any}) => void, retryMs?: number }} o
	 */
	constructor(o) {
		this.o = o
		this.ws = null
		this.closed = false
		this.timer = null
		this.nextId = 1
		this.waiting = new Map()
	}

	start() {
		this.closed = false
		this.open()
	}

	open() {
		const { host, port, key } = this.o
		this.status('connecting')
		const ws = new WebSocket(`ws://${host}:${port}/companion?key=${encodeURIComponent(key)}`)
		this.ws = ws
		ws.on('open', () => this.status('ok'))
		ws.on('unexpected-response', (_req, res) => {
			this.status(res.statusCode === 401 ? 'bad_key' : 'error', res.statusCode === 401 ? 'The key does not match Air. Copy it again from Air › Settings › Companion.' : `Air refused the connection (${res.statusCode}).`)
		})
		ws.on('error', (e) => this.status('error', e.message))
		ws.on('message', (raw) => {
			let m
			try { m = JSON.parse(raw.toString()) } catch { return }
			if (m.type === 'hello') this.o.onHello?.(m)
			else if (m.type === 'values') this.o.onValues?.(m.values)
			else if (m.type === 'event') this.o.onEvent?.({ name: m.name, data: m.data ?? {} })
			else if (m.type === 'result') {
				const w = this.waiting.get(m.id)
				if (!w) return
				this.waiting.delete(m.id)
				if (m.ok) w.resolve()
				else w.reject(new Error(m.error ?? 'Air refused it.'))
			}
		})
		ws.on('close', (code) => {
			for (const w of this.waiting.values()) w.reject(new Error('Air disconnected.'))
			this.waiting.clear()
			if (code === 4001) this.status('bad_key', 'The key changed in Air. Copy it again from Air › Settings › Companion.')
			if (!this.closed) this.timer = setTimeout(() => this.open(), this.o.retryMs ?? 2000)
		})
	}

	status(s, why) {
		this.lastStatus = s
		this.o.onStatus?.(s, why)
	}

	/** Asks Air for an action; resolves when Air has done it, rejects with Air's reason. */
	act(name, args = {}) {
		const ws = this.ws
		if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Not connected to Air.'))
		const id = this.nextId++
		return new Promise((resolve, reject) => {
			this.waiting.set(id, { resolve, reject })
			ws.send(JSON.stringify({ type: 'action', id, name, args }))
		})
	}

	stop() {
		this.closed = true
		clearTimeout(this.timer)
		this.ws?.close()
		this.ws = null
	}
}

module.exports = { AirLink }
