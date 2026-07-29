const FLESPI_DEVICES_URL = 'https://flespi.io/gw/devices/all';
const CACHE_TTL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 8_000;

let cachedDevices = null;
let cachedAt = 0;

const normalizeDevice = (device) => {
	const imei = String(device?.configuration?.ident || '').trim();

	if (!/^\d{15}$/.test(imei)) {
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

const fetchRegisteredDevices = async ({ forceRefresh = false } = {}) => {
	const token = process.env.FLESPI_TOKEN;

	if (!token) {
		const error = new Error('Flespi integration is not configured.');
		error.code = 'FLESPI_NOT_CONFIGURED';
		throw error;
	}

	if (!forceRefresh && cachedDevices && Date.now() - cachedAt < CACHE_TTL_MS) {
		return cachedDevices;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const query = new URLSearchParams({
			fields: [
				'id',
				'name',
				'device_type_name',
				'configuration.ident',
				'connected',
				'enabled',
				'last_active',
			].join(','),
		});
		const response = await fetch(`${FLESPI_DEVICES_URL}?${query}`, {
			headers: {
				Authorization: `FlespiToken ${token}`,
				Accept: 'application/json',
			},
			signal: controller.signal,
		});
		const payload = await response.json().catch(() => ({}));


		if (!response.ok) {
			const message = payload?.errors?.[0]?.reason
				|| payload?.message
				|| `Flespi returned HTTP ${response.status}.`;
			throw new Error(message);
		}

		const devices = (Array.isArray(payload.result) ? payload.result : [])
			.map(normalizeDevice)
			.filter(Boolean)
			.sort((left, right) => left.name.localeCompare(right.name));

		cachedDevices = devices;
		cachedAt = Date.now();
		return devices;
	} catch (error) {
		if (error.name === 'AbortError') {
			throw new Error('Flespi device request timed out.');
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
};

module.exports = {
	fetchRegisteredDevices,
};
