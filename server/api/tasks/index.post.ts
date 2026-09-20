export default defineEventHandler(async (event) => {
  const db = requireDb()
  const body = await readJsonObject(event)
  const input = validateTaskInput(body, true)
  if (!getProject(db, input.project_id)) {
    throw badRequest('project_id does not exist', { project_id: 'no project with that id' })
  }
  const res = db
    .prepare(
      'INSERT INTO task (project_id, title, description, status, priority) VALUES (?, ?, ?, ?, ?)',
    )
    .run(input.project_id, input.title, input.description, input.status, input.priority)
  const task = getTask(db, Number(res.lastInsertRowid))
  setResponseStatus(event, 201)
  return { task }
})