const FLESPI_DEVICES_URL = 'https://flespi.io/gw/devices/all';
const FLESPI_GATEWAY_URL = 'https://flespi.io/gw';
const CACHE_TTL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 8_000;
const TELEMETRY_PARAMETERS = [
	'position.latitude',
	'position.longitude',
	'position.speed',
	'position.direction',
	'position.valid',
	'position.satellites',
	'position.accuracy',
	'timestamp',
	'server.timestamp',
	'battery.level',
];

let cachedDevices = null;
let cachedAt = 0;

const normalizeDevice = (device) => {
	const imei = String(device?.configuration?.ident || '').trim();

	if (!/^\d{8,20}$/.test(imei)) {
		return null;
	}

	return {
		id: String(device.id),
		name: device.name || `GPS ${imei}`,
		imei,
		deviceType: device.device_type_name || 'GPS tracker',
		connected: Boolean(device.connected),
		enabled: device.enabled !== false,
		lastActive: device.last_active
			? new Date(device.last_active * 1000).toISOString()
			: null,
	};
};

const getToken = () => {
	const token = String(process.env.FLESPI_TOKEN || '').trim();

	if (!token) {
		const error = new Error('Flespi integration is not configured.');
		error.code = 'FLESPI_NOT_CONFIGURED';
		throw error;
	}

	return token;
};

const fetchFlespiJson = async (url) => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			headers: {
				Authorization: `FlespiToken ${getToken()}`,
				Accept: 'application/json',
				'x-flespi-app': 'bantaycabagan-backend',
			},
			signal: controller.signal,
		});
		const payload = await response.json().catch(() => ({}));

		if (!response.ok) {
			const message = payload?.errors?.[0]?.reason
				|| payload?.message
				|| `Flespi returned HTTP ${response.status}.`;
			const error = new Error(message);
			error.code = 'FLESPI_REQUEST_FAILED';
			throw error;
		}

		return payload;
	} catch (error) {
		if (error.name === 'AbortError') {
			const timeoutError = new Error('Flespi request timed out.');
			timeoutError.code = 'FLESPI_REQUEST_TIMEOUT';
			throw timeoutError;
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
};

const fetchRegisteredDevices = async ({ forceRefresh = false } = {}) => {
	getToken();

	if (!forceRefresh && cachedDevices && Date.now() - cachedAt < CACHE_TTL_MS) {
		return cachedDevices;
	}

	const query = new URLSearchParams({
		fields: [
			'id',
			'name',
			'device_type_name',
			'configuration',
			'connected',
			'enabled',
			'last_active',
		].join(','),
	});
	const payload = await fetchFlespiJson(`${FLESPI_DEVICES_URL}?${query}`);
	const devices = (Array.isArray(payload.result) ? payload.result : [])
		.map(normalizeDevice)
		.filter(Boolean)
		.sort((left, right) => left.name.localeCompare(right.name));

	cachedDevices = devices;
	cachedAt = Date.now();
	return devices;
};

const readTelemetry = (telemetry, parameter) => telemetry?.[parameter];
const telemetryNumber = (value) => (
	value === null || value === undefined || value === '' || typeof value === 'boolean'
		? Number.NaN
		: Number(value)
);

const fetchLatestTelemetry = async ({ deviceIds = [] } = {}) => {
	const selector = [...new Set(deviceIds.map(String).filter(Boolean))].join(',');
	if (!selector) return [];

	const telemetrySelector = TELEMETRY_PARAMETERS.join(',');
	const payload = await fetchFlespiJson(
		`${FLESPI_GATEWAY_URL}/devices/${selector}/telemetry/${telemetrySelector}`,
	);

	return (Array.isArray(payload.result) ? payload.result : []).map((item) => {
		const telemetry = item?.telemetry || {};
		const latitude = readTelemetry(telemetry, 'position.latitude');
		const longitude = readTelemetry(telemetry, 'position.longitude');
		const trackerTimestamp = readTelemetry(telemetry, 'timestamp');
		const serverTimestamp = readTelemetry(telemetry, 'server.timestamp');
		const positionTimestamp = Math.max(
			telemetryNumber(latitude?.ts) || 0,
			telemetryNumber(longitude?.ts) || 0,
		);
		// Telemetry parameters update independently. A heartbeat/battery message
		// must not make cached coordinates look like a fresh GPS fix.
		const recordedAt = positionTimestamp || telemetryNumber(trackerTimestamp?.value)
			|| telemetryNumber(serverTimestamp?.value);
		const readPositionParameter = (parameter) => {
			const entry = readTelemetry(telemetry, parameter);
			return telemetryNumber(entry?.ts) >= recordedAt ? entry?.value : undefined;
		};
		const positionValid = readPositionParameter('position.valid');

		return {
			deviceId: String(item.id),
			latitude: telemetryNumber(latitude?.value),
			longitude: telemetryNumber(longitude?.value),
			speed: telemetryNumber(readPositionParameter('position.speed')),
			heading: telemetryNumber(readPositionParameter('position.direction')),
			positionValid: typeof positionValid === 'boolean' ? positionValid : undefined,
			satellites: telemetryNumber(readPositionParameter('position.satellites')),
			accuracy: telemetryNumber(readPositionParameter('position.accuracy')),
			batteryLevel: telemetryNumber(readTelemetry(telemetry, 'battery.level')?.value),
			recordedAt,
			receivedAt: Number(serverTimestamp?.value) || null,
		};
	});
};

module.exports = {
	fetchLatestTelemetry,
	fetchRegisteredDevices,
};
