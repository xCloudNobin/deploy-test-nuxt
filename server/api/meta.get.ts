export default defineEventHandler(() => {
  const cfg = loadConfig()
  return {
    name: 'deploy-test-nuxt',
    description: 'Nuxt 3 SSR taskboard: SQLite persistence, validated CRUD, search/filter.',
    release: cfg.buildMarker,
    runtime: { name: 'node', framework: 'nuxt', version: process.version },
    database: { engine: 'sqlite', path: cfg.dbPath },
  }
})