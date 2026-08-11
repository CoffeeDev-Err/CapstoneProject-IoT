/**
 * socket.js — Singleton Socket.IO Client
 *
 * Creates and exports ONE shared Socket.IO connection for the whole frontend.
 * Using a singleton prevents multiple connections from being opened if
 * different components import this module at the same time.
 *
 * Environment variables:
 *   VITE_SOCKET_URL — (optional) point to the production server URL.
 *                     Falls back to http://localhost:4000 for local dev.
 *
 * Exports:
 *   socket            — the shared Socket.IO client instance
 *   emitBackupRequest — helper to fire an emergency backup request
 */
import { io } from 'socket.io-client'
import { SOCKET_URL } from './runtime'

/**
 * Read the backend address from the build-time environment. A production build
 * served by the API defaults to the current HTTPS origin.
 */
/**
 * Shared Socket.IO client instance used across the entire app.
 *   autoConnect: true  — connects as soon as this module is first imported
 *   transports         — starts with polling and upgrades when WebSocket is supported
 */
export const socket = io(SOCKET_URL, {
  transports: ['polling', 'websocket'],
  autoConnect: true,
})

/**
 * emitBackupRequest
 * Sends an 'emergency:request' event to the backend for a specific officer.
 * The server then broadcasts an 'emergency:alert' to ALL connected clients
 * so every supervisor on duty is notified at the same time.
 *
 * @param {string} personnelId - Unique ID of the officer that needs backup
 */
export const emitBackupRequest = (personnelId) => {
  // Defensive guard — do not emit if no ID was provided
  if (!personnelId) {
    return
  }

  socket.emit('emergency:request', { id: personnelId })
}
