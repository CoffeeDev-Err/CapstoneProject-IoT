import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { createApiProxy, localApiGuard } from './dev/apiProxy'

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '')
  const proxyEnabled = command === 'serve' && !isPreview
  return {
    plugins: [react(), ...(proxyEnabled ? [localApiGuard()] : [])],
    // Development requests use the browser's origin and the proxy below.
    ...(proxyEnabled ? {
      define: {
        'import.meta.env.VITE_API_URL': JSON.stringify(''),
        'import.meta.env.VITE_SOCKET_URL': JSON.stringify(''),
      },
    } : {}),
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
    },
    build: {
      // MapLibre is lazy-loaded and is not part of the initial application load.
      chunkSizeWarningLimit: 1000,
    },
    server: {
      host: '127.0.0.1',
      port: 5600,
      strictPort: true,
      ...(proxyEnabled ? {
        proxy: {
          '^/(api|socket\\.io|uploads)(/|\\?|$)': createApiProxy(
            env.DEV_API_PROXY_TARGET || 'http://localhost:4000',
          ),
        },
      } : {}),
    },
    preview: { proxy: {} },
  }
})
