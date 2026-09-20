export default defineEventHandler((event) => {
  const probe = probeDb(loadConfig().dbPath)
  if (probe.ok) {
    return { status: 'ready', db: 'sqlite', checked_at: probe.detail || null }
  }
  setResponseStatus(event, 503)
  return { status: 'unavailable', db: 'sqlite', detail: probe.detail }
})