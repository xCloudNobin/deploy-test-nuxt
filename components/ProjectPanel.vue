<script setup lang="ts">
import type { BoardApi } from '~/composables/useBoard'
import type { ProjectSummary } from '~/types/board'

const props = defineProps<{ api: BoardApi }>()
const api = props.api

const name = ref('')
const description = ref('')
const errorMessage = ref('')
const fieldErrors = ref<Record<string, string>>({})
const submitting = ref(false)

const projects = computed<ProjectSummary[]>(() => api.board.value?.projects ?? [])
const activeId = computed(() => api.activeProjectId.value)

async function select(p: ProjectSummary) {
  errorMessage.value = ''
  fieldErrors.value = {}
  await api.setFilter({ project_id: String(p.id) })
}

async function submit() {
  submitting.value = true
  errorMessage.value = ''
  fieldErrors.value = {}
  try {
    await api.createProject({ name: name.value, description: description.value })
    name.value = ''
    description.value = ''
  } catch (err) {
    const e = extractError(err)
    errorMessage.value = e.message
    fieldErrors.value = e.fields
  } finally {
    submitting.value = false
  }
}

async function remove(p: ProjectSummary) {
  if (import.meta.server) return
  if (!window.confirm(`Delete project "${p.name}" and all of its tasks?`)) return
  errorMessage.value = ''
  try {
    await api.deleteProject(p.id)
  } catch (err) {
    errorMessage.value = extractError(err).message
  }
}
</script>

<template>
  <section class="panel" data-panel="projects">
    <h2>Projects</h2>
    <form class="rowform" autocomplete="off" @submit.prevent="submit">
      <input v-model="name" type="text" maxlength="120" placeholder="Project name" required />
      <input v-model="description" type="text" maxlength="2000" placeholder="Description (optional)" />
      <button type="submit" :disabled="submitting">Add project</button>
    </form>
    <p v-if="errorMessage" class="error" data-testid="project-error">{{ errorMessage }}</p>
    <p v-if="fieldErrors.name" class="error">{{ fieldErrors.name }}</p>

    <p v-if="projects.length === 0" class="empty">No projects yet — add one above.</p>
    <ul v-else class="projectlist">
      <li
        v-for="p in projects"
        :key="p.id"
        class="project-row"
        :class="{ active: p.id === activeId }"
        :data-project-id="p.id"
      >
        <button type="button" class="select" data-testid="select-project" @click="select(p)">
          <span class="pname">{{ p.name }}</span>
          <span class="pcounts">
            todo {{ p.todo }} · doing {{ p.in_progress }} · done {{ p.done }}
          </span>
        </button>
        <button
          type="button"
          class="delete"
          :data-testid="`delete-project-${p.id}`"
          aria-label="Delete project"
          @click="remove(p)"
        >
          ✕
        </button>
      </li>
    </ul>
  </section>
</template>