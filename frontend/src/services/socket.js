/**
 * socket.js — Singleton Socket.IO Client
 *
 * Creates and exports ONE shared Socket.IO connection for the whole frontend.
 * Using a singleton prevents multiple connections from being opened if
 * different components import this module at the same time.
 *
 * Environment variables:
 *   VITE_SOCKET_URL — (optional) point to the production server URL.
 *                     Uses the local Vite proxy during development.
 *
 * Exports:
 *   socket            — the shared Socket.IO client instance
 */
import { io } from 'socket.io-client'
import { SOCKET_URL } from './runtime'

/**
 * Read the backend address from the build-time environment. A production build
 * served by the API defaults to the current HTTPS origin.
 */
/**
 * Shared Socket.IO client instance used across the entire app.
 *   autoConnect: false — the auth hook connects once the session is known
 *   withCredentials    — sends the httpOnly session cookie on the handshake so
 *                        the server can authenticate the socket like the API
 *   transports         — starts with polling and upgrades when WebSocket is supported
 */
export const socket = io(SOCKET_URL, {
  transports: ['polling', 'websocket'],
  autoConnect: false,
  withCredentials: true,
  // The web dashboard loads its initial state through the paginated REST APIs.
  // This prevents the socket handshake from fetching and sending the same data again.
  auth: { bootstrapMode: 'rest' },
})
