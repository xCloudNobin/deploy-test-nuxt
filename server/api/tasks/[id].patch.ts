export default defineEventHandler(async (event) => {
  const db = requireDb()
  const id = parseId(getRouterParam(event, 'id'))
  const current = getTask(db, id)
  if (!current) throw httpNotFound('Task not found')

  const body = await readJsonObject(event)
  const keys = ['title', 'description', 'status', 'priority', 'project_id']
  if (!keys.some((k) => body[k] !== undefined)) {
    throw badRequest('Nothing to update: provide at least one of title, description, status, priority')
  }

  const merged: Record<string, unknown> = {}
  for (const k of keys) {
    if (body[k] !== undefined) merged[k] = body[k]
  }
  const input = validateTaskInput(merged, false)
  const projectId = input.project_id || current.project_id
  if (input.project_id && !getProject(db, input.project_id)) {
    throw badRequest('project_id does not exist', { project_id: 'no project with that id' })
  }

  db.prepare(
    `UPDATE task SET project_id = ?, title = ?, description = ?, status = ?, priority = ?,
            updated_at = datetime('now') WHERE id = ?`,
  ).run(projectId, input.title, input.description, input.status, input.priority, id)
  return { task: getTask(db, id) }
})