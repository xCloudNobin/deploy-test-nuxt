export default defineEventHandler(() => ({
  status: 'alive',
  timestamp: new Date().toISOString(),
}))