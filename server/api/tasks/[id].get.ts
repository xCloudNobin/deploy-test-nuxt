export default defineEventHandler((event) => {
  const db = requireDb()
  const id = parseId(getRouterParam(event, 'id'))
  const task = getTask(db, id)
  if (!task) throw httpNotFound('Task not found')
  return { task }
})