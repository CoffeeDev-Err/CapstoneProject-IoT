/**
 * server.js — HTTP + Socket.IO Realtime Server
 *
 * Entry point for the BantayCabagan backend. Wraps the Express app with a
 * native Node.js HTTP server and attaches Socket.IO for bidirectional
 * realtime communication with connected frontend clients.
 *
 * Realtime events emitted by this server:
 *   personnel:bootstrap — full officer list sent once per new connection
 *   personnel:update    — full officer list broadcast every 4 seconds
 *   emergency:alert     — broadcast to ALL clients when backup is requested
 *   emergency:status    — ack sent back to the requesting client only
 *
 * Realtime events received from clients:
 *   emergency:request   — a client is requesting backup for a specific officer
 */
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/db');
const createOperationalStore = require('./operationalStore');
require('dotenv').config();

// Connect to MongoDB
connectDB();

// Port is read from the environment so it can be overridden in production
const PORT = process.env.PORT || 4000;

// Wrap the Express app in a plain Node.js HTTP server so Socket.IO
// can co-exist on the same port as the REST API
const server = http.createServer(app);

/**
 * Socket.IO server instance.
 * cors origin '*' allows the React dev server to connect freely;
 * lock this down to your production domain before deploying publicly.
 */
const io = new Server(server, {
	cors: {
		origin: '*',
		methods: ['GET', 'POST'],
	},
});

/**
 * In-memory personnel array — the single source of truth for officer data.
 * In a production system this would be replaced by a MySQL query so real
 * GPS devices can write their coordinates directly to the database.
 */
const personnel = [
	{
		id: 'pcpl-001',
		badge: 'P-1001',
		name: 'Mon Maguas',
		rank: 'Police Corporal',
		locationName: 'Cabagan Public Market',
		latitude: 17.4271,
		longitude: 121.7692,
		status: 'On Patrol',
		photoUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
		lastUpdated: new Date().toISOString(),
	},
	{
		id: 'psms-002',
		badge: 'P-1002',
		name: 'GerryBoy Aggabao',
		rank: 'Police Staff Sergeant',
		locationName: 'Cabagan Municipal Hall',
		latitude: 17.4213,
		longitude: 121.7683,
		status: 'Monitoring',
		photoUrl: 'https://randomuser.me/api/portraits/women/44.jpg',
		lastUpdated: new Date().toISOString(),
	},
	{
		id: 'pltc-003',
		badge: 'P-1003',
		name: 'Romel Manzano',
		rank: 'Police Lieutenant',
		locationName: 'Barangay Centro',
		latitude: 17.4189,
		longitude: 121.7748,
		status: 'Responding',
		photoUrl: 'https://randomuser.me/api/portraits/men/18.jpg',
		lastUpdated: new Date().toISOString(),
	},
];

const operationalStore = createOperationalStore({ app, io, personnel });

/**
 * randomDrift
 * Returns a small random offset (±0.0009°) to simulate GPS movement.
 * Replace this with real IoT device coordinates in production.
 */
const randomDrift = () => (Math.random() - 0.5) * 0.0018;

/**
 * updatePersonnelPositions
 * Nudges every officer's lat/lng by a small random amount and
 * stamps the current timestamp. Called by the broadcast interval.
 */
const updatePersonnelPositions = () => {
	for (const member of personnel) {
		member.latitude += randomDrift();
		member.longitude += randomDrift();
		member.lastUpdated = new Date().toISOString();
	}
};

// ── Socket.IO connection handler ──────────────────────────────────────────────
io.on('connection', (socket) => {
	// Send the full officer list immediately so the new client's map
	// populates without waiting for the next 4-second broadcast cycle
	socket.emit('personnel:bootstrap', personnel);
	operationalStore.registerSocket(socket);

	/**
	 * emergency:request
	 * Fired by a client when a supervisor clicks "Request Backup".
	 * If the officer ID is found, broadcast an alert to ALL clients.
	 * Send a status ack back to the requesting client regardless.
	 */
	socket.on('emergency:request', ({ id }) => {
		const member = personnel.find((item) => item.id === id);

		if (!member) {
			// Tell only the requester that the officer was not found
			socket.emit('emergency:status', {
				success: false,
				message: 'Personnel not found.',
			});
			return;
		}

		// Broadcast the alert to ALL connected clients (io.emit, not socket.emit)
		io.emit('emergency:alert', {
			id: member.id,
			name: member.name,
			rank: member.rank,
			locationName: member.locationName,
			latitude: member.latitude,
			longitude: member.longitude,
			timestamp: new Date().toISOString(),
			message: `${member.rank} ${member.name} requested backup.`,
		});
		operationalStore.createTask({
			type: 'backup',
			requested_by: member.id,
			requester_name: member.name,
			title: `Backup requested by ${member.name}`,
			description: 'Responders are needed at the officer current location.',
			location: member.locationName,
			latitude: member.latitude,
			longitude: member.longitude,
			required_responders: 3,
		});

		// Ack back to the requesting client so the UI can confirm success
		socket.emit('emergency:status', {
			success: true,
			message: 'Backup request has been sent.',
		});
	});
});

/**
 * GPS broadcast interval — runs every 1 500 ms.
 * Updates simulated positions then pushes the full personnel array
 * to every connected client so all map markers move in real time.
 * The SmoothMarker on the frontend animates over ~1 400 ms so markers
 * are always visibly moving and reach the target before the next tick.
 */
setInterval(() => {
	updatePersonnelPositions();
	io.emit('personnel:update', personnel);
}, 1500);

// Start the HTTP + Socket.IO server
server.listen(PORT, () => {
	console.log(`BantayCabagan backend server running on port ${PORT}`);
});
