import type { H3Event } from 'h3'

// Runtime helpers use auto-imported server-utils/h3 symbols; local limit
// constants are auto-imported from services/utils/db.ts.

export function badRequest(message: string, fields: Record<string, string> = {}) {
  return createError({
    statusCode: 400,
    statusMessage: 'Bad Request',
    message,
    data: { error: message, fields },
  })
}

export function httpNotFound(message: string) {
  return createError({
    statusCode: 404,
    statusMessage: 'Not Found',
    message,
    data: { error: message },
  })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function readJsonObject(event: H3Event): Promise<Record<string, unknown>> {
  let body: unknown
  try {
    body = await readBody(event)
  } catch {
    throw badRequest('Request body is not valid JSON')
  }
  if (!isRecord(body)) throw badRequest('Request body must be a JSON object')
  return body
}

export function parseId(value: unknown): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) throw badRequest('Invalid identifier')
  return id
}

type TaskStatusValue = (typeof TASK_STATUSES)[number]
type PriorityValue = (typeof PRIORITIES)[number]
type ProjectStatusValue = (typeof PROJECT_STATUSES)[number]

function optionalString(value: unknown, path: string, max: number): { ok: boolean; value?: string; error?: string } {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (typeof value !== 'string') return { ok: false, error: `${path} must be a string` }
  const trimmed = value.trim()
  if (trimmed.length > max) return { ok: false, error: `${path} must be ${max} characters or fewer` }
  return { ok: true, value: trimmed }
}

export interface TaskInput {
  project_id: number
  title: string
  description: string
  status: TaskStatusValue
  priority: PriorityValue
}

export function validateTaskInput(body: Record<string, unknown>, requireProject: boolean): TaskInput {
  const fields: Record<string, string> = {}

  const projectValue = body.project_id
  let projectId = 0
  if (projectValue === undefined || projectValue === null) {
    if (requireProject) fields.project_id = 'project_id is required'
  } else if (typeof projectValue !== 'number' || !Number.isInteger(projectValue) || projectValue < 1) {
    fields.project_id = 'project_id must be a positive integer'
  } else {
    projectId = projectValue
  }

  const titleValue = body.title
  let title = ''
  if (typeof titleValue !== 'string' || titleValue.trim() === '') {
    fields.title =
      typeof titleValue === 'string'
        ? 'title is required and must not be blank'
        : 'title is required and must be a string'
  } else {
    title = titleValue.trim()
    if (title.length > TITLE_MAX) fields.title = `title must be ${TITLE_MAX} characters or fewer`
  }

  const desc = optionalString(body.description, 'description', DESCRIPTION_MAX)
  if (!desc.ok) fields.description = desc.error!
  const description = desc.value ?? ''

  let status: TaskStatusValue = 'todo'
  let priority: PriorityValue = 'medium'
  if (body.status !== undefined && body.status !== null && body.status !== '') {
    if (!TASK_STATUSES.includes(body.status as TaskStatusValue)) {
      fields.status = `status must be one of: ${TASK_STATUSES.join(', ')}`
    } else {
      status = body.status as TaskStatusValue
    }
  }
  if (body.priority !== undefined && body.priority !== null && body.priority !== '') {
    if (!PRIORITIES.includes(body.priority as PriorityValue)) {
      fields.priority = `priority must be one of: ${PRIORITIES.join(', ')}`
    } else {
      priority = body.priority as PriorityValue
    }
  }

  if (Object.keys(fields).length > 0) throw badRequest('Validation failed', fields)
  if (requireProject && !projectId) {
    throw badRequest('Validation failed', { project_id: 'project_id is required' })
  }

  return { project_id: projectId, title, description, status, priority }
}

export interface ProjectInput {
  name: string
  description: string
  status: ProjectStatusValue
}

export function validateProjectInput(body: Record<string, unknown>): ProjectInput {
  const fields: Record<string, string> = {}

  const nameValue = body.name
  let name = ''
  if (typeof nameValue !== 'string' || nameValue.trim() === '') {
    fields.name =
      typeof nameValue === 'string'
        ? 'name is required and must not be blank'
        : 'name is required and must be a string'
  } else {
    name = nameValue.trim()
    if (name.length > NAME_MAX) fields.name = `name must be ${NAME_MAX} characters or fewer`
  }

  const desc = optionalString(body.description, 'description', DESCRIPTION_MAX)
  if (!desc.ok) fields.description = desc.error!
  const description = desc.value ?? ''

  let status: ProjectStatusValue = 'active'
  if (body.status !== undefined && body.status !== null && body.status !== '') {
    if (!PROJECT_STATUSES.includes(body.status as ProjectStatusValue)) {
      fields.status = `project status must be one of: ${PROJECT_STATUSES.join(', ')}`
    } else {
      status = body.status as ProjectStatusValue
    }
  }

  if (Object.keys(fields).length > 0) throw badRequest('Validation failed', fields)
  return { name, description, status }
}

export function parseFilterStatus(value: string | null): TaskStatusValue | null {
  if (!value) return null
  if (!TASK_STATUSES.includes(value as TaskStatusValue)) {
    throw badRequest(`status filter must be one of: ${TASK_STATUSES.join(', ')}`)
  }
  return value as TaskStatusValue
}

export function parseFilterPriority(value: string | null): PriorityValue | null {
  if (!value) return null
  if (!PRIORITIES.includes(value as PriorityValue)) {
    throw badRequest(`priority filter must be one of: ${PRIORITIES.join(', ')}`)
  }
  return value as PriorityValue
}