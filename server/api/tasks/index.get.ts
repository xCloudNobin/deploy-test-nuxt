export default defineEventHandler((event) => {
  const db = requireDb()
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const status = typeof query.status === 'string' ? parseFilterStatus(query.status) : parseFilterStatus(null)
  const priority = typeof query.priority === 'string' ? parseFilterPriority(query.priority) : parseFilterPriority(null)
  const projectRaw = typeof query.project_id === 'string' ? query.project_id : ''
  const projectId = projectRaw ? parseId(projectRaw) : null

  const tasks = listTasks(db, { projectId, q: q || null, status, priority })
  return { tasks, count: tasks.length, query: { q, status, priority, project_id: projectId } }
})