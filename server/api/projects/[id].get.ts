export default defineEventHandler((event) => {
  const db = requireDb()
  const id = parseId(getRouterParam(event, 'id'))
  const project = getProject(db, id)
  if (!project) throw httpNotFound('Project not found')
  const tasks = db.prepare('SELECT * FROM task WHERE project_id = ? ORDER BY id DESC').all(id)
  return { project, tasks }
})