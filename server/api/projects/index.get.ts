export default defineEventHandler(() => {
  const db = requireDb()
  return { projects: listProjects(db) }
})