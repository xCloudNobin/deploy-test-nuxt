export default defineEventHandler(async (event) => {
  const db = requireDb()
  const id = parseId(getRouterParam(event, 'id'))
  const current = getProject(db, id)
  if (!current) throw httpNotFound('Project not found')

  const body = await readJsonObject(event)
  if (body.name === undefined && body.description === undefined && body.status === undefined) {
    throw badRequest('Nothing to update: provide at least one of name, description, status')
  }

  const merged: Record<string, unknown> = {
    name: body.name ?? current.name,
    description: body.description ?? current.description,
    status: body.status ?? current.status,
  }
  const input = validateProjectInput(merged)
  db.prepare(
    "UPDATE project SET name = ?, description = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(input.name, input.description, input.status, id)
  return { project: getProject(db, id) }
})