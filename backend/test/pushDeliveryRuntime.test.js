const assert = require('node:assert/strict')
const { it } = require('node:test')
const createRuntime = require('../src/runtime/pushDeliveryRuntime')

it('gates on database readiness, skips overlapping ticks, and resumes after errors', async () => {
	let ready = false
	let calls = 0
	let release
	let errors = 0
	const runtime = createRuntime({
		isDatabaseReady: () => ready,
		service: { runOnce: () => { calls += 1; return new Promise((resolve, reject) => { release = { resolve, reject } }) } },
		logger: { error() { errors += 1 } },
	})
	await runtime.tick()
	assert.equal(calls, 0)
	ready = true
	const first = runtime.tick()
	await runtime.tick()
	assert.equal(calls, 1)
	release.reject(new Error('DB unavailable'))
	await first
	assert.equal(errors, 1)
	const second = runtime.tick()
	release.resolve()
	await second
	assert.equal(calls, 2)
	runtime.stop()
})

it('starts once, drains immediately, and stops the polling timer', async (t) => {
	let interval
	let cleared
	let calls = 0
	t.mock.method(global, 'setInterval', (callback) => { interval = callback; return 42 })
	t.mock.method(global, 'clearInterval', (timer) => { cleared = timer })
	const runtime = createRuntime({
		isDatabaseReady: () => true,
		service: { runOnce: async () => { calls += 1 } },
	})
	runtime.start()
	runtime.start()
	await Promise.resolve()
	assert.equal(calls, 1)
	assert.equal(global.setInterval.mock.callCount(), 1)
	interval()
	await Promise.resolve()
	assert.equal(calls, 2)
	runtime.stop()
	assert.equal(cleared, 42)
})
