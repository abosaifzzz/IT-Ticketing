import {fileURLToPath} from 'node:url'
import { productionGuard } from './scripts/productionGuard.mjs'
import { configureApiProxy } from './scripts/apiProxy.mjs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, '.', '')
  if (mode === 'production' && env.VITE_AUTH_MODE && env.VITE_AUTH_MODE !== 'api') throw new Error('Production requires API authentication')
  return { resolve: { alias: command === 'build' ? [{find:/^.*\/(?:demoCredentials|mockAuthProvider)\.js$/,replacement:fileURLToPath(new URL('./src/services/auth/productionMockDisabled.js',import.meta.url))}] : [] }, plugins: [react(), tailwindcss(), productionGuard()], build: { target: 'es2022' }, server: {
    host: 'localhost', port: 5173, strictPort: true, watch: { ignored: ['**/artifacts.local/**'] },
    proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:3001', changeOrigin: false, configure: configureApiProxy } },
  } }
})
