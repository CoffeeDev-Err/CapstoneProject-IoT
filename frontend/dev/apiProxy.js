const proxyPath = /^\/(?:api|socket\.io|uploads)(?:\/|\?|$)/

// Requests from a different website must not gain access to the local proxy.
const isLocalRequest = (req) => {
  const host = req.headers.host || ''
  if (!/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(host)) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  return !req.headers.origin || req.headers.origin === `http://${host}`
}

export const localApiGuard = () => ({
  name: 'local-api-guard',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (proxyPath.test(req.url) && !isLocalRequest(req)) {
        res.writeHead(403)
        res.end('Only same-origin local requests may use the API proxy.')
        return
      }
      next()
    })
    const guardUpgrade = (req, socket) => {
      if (proxyPath.test(req.url) && !isLocalRequest(req)) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      }
    }
    server.httpServer?.prependListener('upgrade', guardUpgrade)
    server.httpServer?.once('close', () => {
      server.httpServer.removeListener('upgrade', guardUpgrade)
    })
  },
})

export const createApiProxy = (target) => {
  const url = new URL(target)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('DEV_API_PROXY_TARGET must be an HTTP(S) URL without credentials.')
  }
  return {
    target: url.origin,
    changeOrigin: true,
    ws: true,
    cookieDomainRewrite: '',
    configure(proxy) {
      const prepareRequest = (proxyReq) => {
        // The browser talks to its own origin; this hop is server-to-server.
        proxyReq.removeHeader('origin')
        proxyReq.removeHeader('referer')
      }
      proxy.on('proxyReq', prepareRequest)
      proxy.on('proxyReqWs', (proxyReq, req) => {
        if (!isLocalRequest(req)) {
          proxyReq.destroy()
          return
        }
        prepareRequest(proxyReq)
      })
      proxy.on('proxyRes', (response) => {
        // Only the loopback HTTP copy changes. AWS retains Secure + HttpOnly.
        const cookies = response.headers['set-cookie']
        if (cookies) {
          response.headers['set-cookie'] = cookies.map((cookie) => (
            cookie.startsWith('gs_session=')
              ? cookie.replace(/;\s*Secure\b/gi, '')
              : cookie
          ))
        }
      })
    },
  }
}
