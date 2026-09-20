import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  PRIORITIES,
  PROJECT_STATUSES,
  TASK_STATUSES,
  TITLE_MAX,
  type Priority,
  type ProjectStatus,
  type TaskStatus,
} from '../constants'

export type Db = Database.Database

export interface ProjectSummary {
  id: number
  name: string
  description: string
  status: ProjectStatus
  created_at: string
  updated_at: string
  task_total: number
  todo: number
  in_progress: number
  done: number
}

export interface TaskRow {
  id: number
  project_id: number
  project_name: string
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  created_at: string
  updated_at: string
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS project (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'archived')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'todo'
              CHECK (status IN ('todo', 'in_progress', 'done')),
  priority    TEXT NOT NULL DEFAULT 'medium'
              CHECK (priority IN ('low', 'medium', 'high')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_project ON task(project_id, status);
CREATE INDEX IF NOT EXISTS idx_task_status ON task(status);

CREATE TABLE IF NOT EXISTS seed_flag (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  seeded_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS heartbeat (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  checked_at  TEXT NOT NULL
);
`

const SEED_PROJECTS = [
  { name: 'Launch checklist', description: 'Demo project created by the idempotent seeder.' },
  { name: 'Support triage', description: 'Second demo board, also created once.' },
] as const

const SEED_TASKS = [
  { project: 0, title: 'Write the launch blurb', status: 'done', priority: 'high' },
  { project: 0, title: 'Schedule demo for the team', status: 'in_progress', priority: 'medium' },
  { project: 0, title: 'Prepare rollback notes', status: 'todo', priority: 'low' },
  { project: 1, title: 'Reproduce reported bug #42', status: 'in_progress', priority: 'high' },
] as const

export interface SeedResult {
  seeded: boolean
  projects: number
  tasks: number
}

export interface ProbeResult {
  ok: boolean
  detail: string
}

export function openDb(path: string): Db {
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  const seedResult = seed(db)
  console.log(
    `[nuxt-taskboard] sqlite ready ${path} (seeded=${seedResult.seeded} projects=${seedResult.projects} tasks=${seedResult.tasks})`,
  )
  return db
}

export function migrate(db: Db): void {
  db.exec(SCHEMA)
}

export function seed(db: Db): SeedResult {
  const flag = db.prepare('SELECT seeded_at FROM seed_flag WHERE id = 1').get() as
    | { seeded_at: string }
    | undefined
  if (flag !== undefined) {
    const projects = (db.prepare('SELECT COUNT(*) AS n FROM project').get() as { n: number }).n
    const tasks = (db.prepare('SELECT COUNT(*) AS n FROM task').get() as { n: number }).n
    return { seeded: false, projects, tasks }
  }

  const apply = db.transaction(() => {
    const insertProject = db.prepare(
      "INSERT INTO project (name, description, status) VALUES (?, ?, 'active')",
    )
    const insertTask = db.prepare(
      "INSERT INTO task (project_id, title, description, status, priority) VALUES (?, ?, '', ?, ?)",
    )
    const projectIds: number[] = []
    for (const p of SEED_PROJECTS) {
      const res = insertProject.run(p.name, p.description)
      projectIds.push(Number(res.lastInsertRowid))
    }
    for (const t of SEED_TASKS) {
      insertTask.run(projectIds[t.project], t.title, t.status, t.priority)
    }
    db.prepare("REPLACE INTO seed_flag (id, seeded_at) VALUES (1, datetime('now'))").run()
  })
  apply()

  return { seeded: true, projects: SEED_PROJECTS.length, tasks: SEED_TASKS.length }
}

export function probeDb(path: string): ProbeResult {
  let db: Db
  try {
    mkdirSync(dirname(path), { recursive: true })
    db = new Database(path)
    migrate(db)
  } catch (err) {
    return { ok: false, detail: errorMessage(err, `cannot open database at ${path}`) }
  }
  try {
    db.pragma('foreign_keys = ON')
    db.prepare("INSERT OR REPLACE INTO heartbeat (id, checked_at) VALUES (1, datetime('now'))").run()
    const row = db.prepare('SELECT checked_at FROM heartbeat WHERE id = 1').get() as
      | { checked_at: string }
      | undefined
    return { ok: true, detail: row ? row.checked_at : '' }
  } catch (err) {
    return { ok: false, detail: errorMessage(err, 'database probe failed') }
  } finally {
    db.close()
  }
}

// Single lazy connection shared by every request; failures are remembered so a
// broken database degrades every API/read to 503 while liveness stays 200.
let db: Db | null = null
let initError: string | null = null
let lastAttempt = 0

export function getDb(): Db | null {
  if (db) return db
  const now = Date.now()
  if (initError && now - lastAttempt < 2000) return null
  lastAttempt = now
  try {
    const { dbPath } = loadConfig()
    db = openDb(dbPath)
    initError = null
    return db
  } catch (err) {
    initError = err instanceof Error ? err.message : String(err)
    console.error(
      `[nuxt-taskboard] FATAL: could not open database; readiness and database routes will report 503. ${initError}`,
    )
    return null
  }
}

export function requireDb(): Db {
  const d = getDb()
  if (!d) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: 'Database is unavailable',
      data: { error: 'Service Unavailable', db: 'unavailable' },
    })
  }
  return d
}

export function closeDb(): void {
  try {
    db?.close()
  } catch (err) {
    console.error('[nuxt-taskboard] error closing database:', err)
  }
  db = null
  initError = null
}

const PROJECT_SUMMARY_SELECT = `SELECT p.id, p.name, p.description, p.status,
                                       p.created_at, p.updated_at,
                                       COUNT(t.id) AS task_total,
                                       SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END) AS todo,
                                       SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
                                       SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done
                                  FROM project p LEFT JOIN task t ON t.project_id = p.id`

export function listProjects(db: Db): ProjectSummary[] {
  return db
    .prepare(`${PROJECT_SUMMARY_SELECT} GROUP BY p.id ORDER BY p.id ASC`)
    .all() as ProjectSummary[]
}

export function getProject(db: Db, id: number): ProjectSummary | null {
  const row = db.prepare(`${PROJECT_SUMMARY_SELECT} WHERE p.id = ? GROUP BY p.id`).get(id) as
    | ProjectSummary
    | undefined
  return row ?? null
}

const TASK_SELECT = `SELECT t.id, t.project_id, p.name AS project_name, t.title,
                            t.description, t.status, t.priority, t.created_at, t.updated_at
                       FROM task t JOIN project p ON p.id = t.project_id`

export function getTask(db: Db, id: number): TaskRow | null {
  const row = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id) as TaskRow | undefined
  return row ?? null
}

export function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export interface TaskFilter {
  projectId: number | null
  q: string | null
  status: TaskStatus | null
  priority: Priority | null
}

export function listTasks(db: Db, filter: TaskFilter): TaskRow[] {
  const like = filter.q ? `%${escapeLike(filter.q)}%` : null
  return db
    .prepare(
      `SELECT t.id, t.project_id, p.name AS project_name, t.title, t.description,
              t.status, t.priority, t.created_at, t.updated_at
         FROM task t JOIN project p ON p.id = t.project_id
        WHERE (($project IS NULL) OR t.project_id = $project)
          AND (($status IS NULL) OR t.status = $status)
          AND (($priority IS NULL) OR t.priority = $priority)
          AND (($q IS NULL) OR t.title LIKE $q ESCAPE '\\' OR t.description LIKE $q ESCAPE '\\')
        ORDER BY t.id DESC`,
    )
    .all({ project: filter.projectId, status: filter.status, priority: filter.priority, q: like }) as TaskRow[]
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export type { TaskStatus, Priority, ProjectStatus }
export { TASK_STATUSES, PRIORITIES, PROJECT_STATUSES, TITLE_MAX, DESCRIPTION_MAX, NAME_MAX }