import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiProxyPlugin } from './localApiProxy.ts'

// https://vite.dev/config/
export default defineConfig({
  // apiProxyPlugin: /api-proxy/<scheme>/<host>/… → forwarded server-side so
  // Jira/ServiceNow/AI REST calls never hit browser CORS (see localApiProxy.ts)
  plugins: [react(), apiProxyPlugin()],
})
