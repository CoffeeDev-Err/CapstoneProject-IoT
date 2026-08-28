const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const models = require('../src/models')

const EXPECTED_MODEL_CONTRACTS = {
	User: ['users', 4],
	AuthSession: ['auth_sessions', 3],
	EmailVerification: ['email_verifications', 2],
	Personnel: ['personnel', 5],
	GpsDeviceAssignment: ['gps_device_assignments', 4],
	CurrentLocation: ['current_locations', 3],
	LocationHistory: ['location_history', 2],
	Barangay: ['barangays', 3],
	Deployment: ['deployments', 7],
	Report: ['reports', 11],
	Task: ['tasks', 4],
	Notification: ['notifications', 4],
	PushDevice: ['push_devices', 2],
	AuditLog: ['audit_logs', 2],
}

describe('model registry compatibility surface', () => {
	it('retains every export, collection, and declared index', () => {
		assert.deepEqual(Object.keys(models), Object.keys(EXPECTED_MODEL_CONTRACTS))
		for (const [name, [collection, indexCount]] of Object.entries(EXPECTED_MODEL_CONTRACTS)) {
			assert.equal(models[name].collection.name, collection, `${name} collection changed`)
			assert.equal(models[name].schema.indexes().length, indexCount, `${name} indexes changed`)
		}
	})
})
