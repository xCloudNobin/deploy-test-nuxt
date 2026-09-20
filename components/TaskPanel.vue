<script setup lang="ts">
import type { BoardApi } from '~/composables/useBoard'
import type { ProjectSummary, TaskRow } from '~/types/board'

const props = defineProps<{ api: BoardApi }>()
const api = props.api

const search = ref(api.q.value)
const statusFilter = ref(api.statusQ.value)
const priorityFilter = ref(api.priorityQ.value)

let debounce: ReturnType<typeof setTimeout> | null = null

watch(() => api.q.value, (v) => { if (v !== search.value) search.value = v })
watch(() => api.statusQ.value, (v) => { if (v !== statusFilter.value) statusFilter.value = v })
watch(() => api.priorityQ.value, (v) => { if (v !== priorityFilter.value) priorityFilter.value = v })

function applySearch() {
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => { api.setFilter({ q: search.value }) }, 250)
}

function applyFilters() {
  if (debounce) clearTimeout(debounce)
  api.setFilter({ q: search.value, status: statusFilter.value, priority: priorityFilter.value })
}

const tasks = computed<TaskRow[]>(() => api.board.value?.tasks ?? [])
const projects = computed<ProjectSummary[]>(() => api.board.value?.projects ?? [])
const hasDbError = computed(() => !!api.error.value)
const activeProjectId = computed(() => api.activeProjectId.value)
const projectName = computed(
  () => projects.value.find((p) => p.id === activeProjectId.value)?.name ?? '',
)

const statusOptions = ['todo', 'in_progress', 'done']
const priorityOptions = ['low', 'medium', 'high']
</script>

<template>
  <section class="panel" data-panel="tasks">
    <h2>Tasks <span class="count" data-testid="task-count">({{ tasks.length }})</span></h2>
    <p v-if="projectName" class="muted">Board: {{ projectName }}</p>

    <TaskForm v-if="!hasDbError" :api="api" />

    <div class="toolbar">
      <input
        v-model="search"
        type="search"
        placeholder="Search titles and descriptions"
        data-testid="search"
        @input="applySearch"
      />
      <select v-model="statusFilter" data-testid="filter-status" @change="applyFilters">
        <option value="">All statuses</option>
        <option v-for="s in statusOptions" :key="s" :value="s">{{ s.replace('_', ' ') }}</option>
      </select>
      <select v-model="priorityFilter" data-testid="filter-priority" @change="applyFilters">
        <option value="">All priorities</option>
        <option v-for="p in priorityOptions" :key="p" :value="p">{{ p }}</option>
      </select>
      <button type="button" data-testid="refresh" @click="api.refresh()">Refresh</button>
    </div>

    <div v-if="hasDbError" class="error" data-testid="db-error">
      Database unavailable: {{ (api.error.value as any)?.message || 'could not reach the board API' }}.
      Liveness stays up; readiness reports 503 until the database is available again.
    </div>

    <p v-else-if="tasks.length === 0" class="empty" data-testid="tasks-empty">No tasks match.</p>
    <ul v-else class="tasklist">
      <TaskItem v-for="t in tasks" :key="t.id" :task="t" :api="api" />
    </ul>
  </section>
</template>