export default defineEventHandler((event) => {
  const db = requireDb()
  const id = parseId(getRouterParam(event, 'id'))
  const res = db.prepare('DELETE FROM project WHERE id = ?').run(id)
  if (Number(res.changes) === 0) throw httpNotFound('Project not found')
  setResponseStatus(event, 204)
  return null
})