import { existsSync, readFileSync } from 'node:fs'

const release = existsSync('VERSION') ? readFileSync('VERSION', 'utf8').trim() : ''

export default defineNuxtConfig({
  ssr: true,
  devtools: { enabled: false },
  compatibilityDate: '2025-07-15',
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      release: release || 'develop',
    },
  },
  nitro: {
    preset: 'node-server',
    externals: {
      external: ['better-sqlite3'],
    },
  },
})