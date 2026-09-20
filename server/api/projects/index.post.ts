export default defineEventHandler(async (event) => {
  const db = requireDb()
  const body = await readJsonObject(event)
  const input = validateProjectInput(body)
  const res = db
    .prepare('INSERT INTO project (name, description, status) VALUES (?, ?, ?)')
    .run(input.name, input.description, input.status)
  const project = getProject(db, Number(res.lastInsertRowid))
  setResponseStatus(event, 201)
  return { project }
})