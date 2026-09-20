export interface ProjectSummary {
  id: number
  name: string
  description: string
  status: string
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
  status: string
  priority: string
  created_at: string
  updated_at: string
}

export interface Board {
  projects: ProjectSummary[]
  tasks: TaskRow[]
  query: { q: string; status: string | null; priority: string | null; project_id: number | null }
  release: string
}