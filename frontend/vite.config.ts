import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Server-only values are read here, never injected into the browser bundle.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }

  return {
    base: '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      host: env.DEV_SERVER_HOST || '127.0.0.1',
      port: 5173,
      strictPort: true,
      // Development API proxy: keep browser calls on /api, then remove that prefix for FastAPI.
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api(?=\/|$)/, ''),
        },
      },
    },
    preview: { host: env.DEV_SERVER_HOST || '127.0.0.1', port: 4173 },
  }
})
