import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { once } from 'node:events'
import { createServer } from 'vite'
import WebSocket, { WebSocketServer } from 'ws'
import { createApiProxy, localApiGuard } from '../dev/apiProxy.js'

// Exercise real HTTP and WebSocket forwarding against a local fixture;
// never sign in or change records on the live AWS backend.
const upstream = createHttpServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/api/login') {
    res.setHeader('Set-Cookie', [
      'gs_session=test-session; Domain=upstream.example; Path=/; Secure; HttpOnly; SameSite=Lax',
    ])
  }
  if (req.url === '/api/logout') {
    res.setHeader('Set-Cookie', 'gs_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0')
  }
  if (req.url === '/api/protected' && !req.headers.cookie?.includes('gs_session=test-session')) {
    res.statusCode = 401
  }
  res.end(JSON.stringify({ path: req.url, origin: req.headers.origin, cookie: req.headers.cookie, body }))
})
const wsUpstream = new WebSocketServer({ server: upstream })
wsUpstream.on('connection', (socket, req) => {
  socket.send(JSON.stringify({ origin: req.headers.origin, cookie: req.headers.cookie }))
})
upstream.listen(0, '127.0.0.1')
await once(upstream, 'listening')
const vite = await createServer({
  configFile: false,
  logLevel: 'silent',
  plugins: [localApiGuard()],
  server: {
    host: '127.0.0.1', port: 0,
    proxy: { '^/(api|socket\\.io|uploads)(/|\\?|$)': createApiProxy(`http://127.0.0.1:${upstream.address().port}`) },
  },
})
const sockets = []
try {
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  const login = await fetch(`${origin}/api/login`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fixture: true }),
  })
  const cookie = login.headers.getSetCookie()[0]
  assert.match(cookie, /^gs_session=test-session;/)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.doesNotMatch(cookie, /;\s*(Secure|Domain=)/i)
  const loginBody = await login.json()
  assert.equal(loginBody.origin, undefined)
  assert.equal(loginBody.body, '{"fixture":true}')
  const authHeaders = { Origin: origin, Cookie: cookie.split(';')[0] }
  assert.equal((await fetch(`${origin}/api/protected`, { headers: authHeaders })).status, 200)
  assert.equal((await fetch(`${origin}/api/protected`)).status, 401)
  const logout = await fetch(`${origin}/api/logout`, { method: 'POST', headers: authHeaders })
  assert.match(logout.headers.getSetCookie()[0], /Max-Age=0/)
  for (const path of ['/socket.io/?EIO=4&transport=polling', '/uploads/photo.png']) {
    assert.equal((await (await fetch(`${origin}${path}`, { headers: authHeaders })).json()).path, path)
  }
  assert.equal((await fetch(`${origin}/api/protected`, { headers: { Origin: 'https://untrusted.example' } })).status, 403)
  const ws = new WebSocket(`${origin.replace('http:', 'ws:')}/socket.io/?EIO=4&transport=websocket`, { headers: authHeaders })
  sockets.push(ws)
  const [message] = await once(ws, 'message')
  assert.deepEqual(JSON.parse(message), { cookie: 'gs_session=test-session' })
  ws.close()
  await once(ws, 'close')
  const rejectedWs = new WebSocket(`${origin.replace('http:', 'ws:')}/socket.io/`, { origin: 'https://untrusted.example' })
  sockets.push(rejectedWs)
  const [error] = await once(rejectedWs, 'error')
  assert.match(error.message, /403/)
  console.log('Dev proxy passed: session/login/logout, JSON body, uploads, polling, WebSocket cookies, and cross-origin rejection.')
} finally {
  for (const socket of sockets) socket.terminate()
  for (const socket of wsUpstream.clients) socket.terminate()
  await vite.close()
  wsUpstream.close()
  upstream.closeAllConnections()
  upstream.close()
}
