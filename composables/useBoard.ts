import type { Board } from '~/types/board'

export interface BoardApi {
  board: Ref<Board | null>
  error: Ref<any>
  loading: ComputedRef<boolean>
  refresh: () => Promise<void>
  activeProjectId: ComputedRef<number | null>
  projectId: ComputedRef<string>
  q: ComputedRef<string>
  statusQ: ComputedRef<string>
  priorityQ: ComputedRef<string>
  setFilter: (patch: Record<string, string>) => Promise<void>
  createProject: (input: Record<string, unknown>) => Promise<void>
  deleteProject: (id: number) => Promise<void>
  createTask: (input: Record<string, unknown>) => Promise<void>
  updateTask: (id: number, input: Record<string, unknown>) => Promise<void>
  deleteTask: (id: number) => Promise<void>
}

export async function useBoard(): Promise<BoardApi> {
  const route = useRoute()

  const projectId = computed(() =>
    typeof route.query.project_id === 'string' ? route.query.project_id : '',
  )
  const q = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
  const statusQ = computed(() => (typeof route.query.status === 'string' ? route.query.status : ''))
  const priorityQ = computed(() =>
    typeof route.query.priority === 'string' ? route.query.priority : '',
  )

  const { data, error, refresh, status: fetchStatus } = await useFetch<Board>('/api/board', {
    query: computed(() => ({
      project_id: projectId.value || undefined,
      q: q.value || undefined,
      status: statusQ.value || undefined,
      priority: priorityQ.value || undefined,
    })),
    watch: [projectId, q, statusQ, priorityQ],
    server: true,
  })

  const board = computed(() => (data.value ?? null) as Board | null)
  const loading = computed(() => fetchStatus.value === 'pending')

  const activeProjectId = computed(() => {
    const raw = projectId.value
    if (raw) {
      const n = Number(raw)
      if (Number.isInteger(n) && n > 0) return n
    }
    const first = board.value?.projects?.[0]
    return first ? first.id : null
  })

  async function setFilter(patch: Record<string, string>): Promise<void> {
    await navigateTo({ query: { ...route.query, ...patch } })
  }

  async function createProject(input: Record<string, unknown>): Promise<void> {
    const res = await $fetch<{ project: { id: number } }>('/api/projects', {
      method: 'POST',
      body: input,
    })
    await refresh()
    await setFilter({ project_id: String(res.project.id) })
  }

  async function deleteProject(id: number): Promise<void> {
    await $fetch(`/api/projects/${id}`, { method: 'DELETE' })
    const query = { ...route.query }
    if (String(route.query.project_id) === String(id)) delete query.project_id
    await navigateTo({ query })
    await refresh()
  }

  async function createTask(input: Record<string, unknown>): Promise<void> {
    await $fetch('/api/tasks', { method: 'POST', body: input })
    await refresh()
  }

  async function updateTask(id: number, input: Record<string, unknown>): Promise<void> {
    await $fetch(`/api/tasks/${id}`, { method: 'PATCH', body: input })
    await refresh()
  }

  async function deleteTask(id: number): Promise<void> {
    await $fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    await refresh()
  }

  return {
    board: board as Ref<Board | null>,
    error,
    loading,
    refresh,
    activeProjectId,
    projectId,
    q,
    statusQ,
    priorityQ,
    setFilter,
    createProject,
    deleteProject,
    createTask,
    updateTask,
    deleteTask,
  }
}