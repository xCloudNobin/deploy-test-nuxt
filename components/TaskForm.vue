<script setup lang="ts">
import type { BoardApi } from '~/composables/useBoard'
import type { TaskRow } from '~/types/board'

const props = defineProps<{ api: BoardApi }>()
const api = props.api

const title = ref('')
const description = ref('')
const status = ref('todo')
const priority = ref('medium')
const errorMessage = ref('')
const fieldErrors = ref<Record<string, string>>({})
const submitting = ref(false)

const activeProjectId = computed(() => api.activeProjectId.value)
const statusOptions = ['todo', 'in_progress', 'done']
const priorityOptions = ['low', 'medium', 'high']

async function submit() {
  if (!activeProjectId.value) {
    errorMessage.value = 'Create or select a project first'
    return
  }
  submitting.value = true
  errorMessage.value = ''
  fieldErrors.value = {}
  try {
    await api.createTask({
      project_id: activeProjectId.value,
      title: title.value,
      description: description.value,
      status: status.value,
      priority: priority.value,
    })
    title.value = ''
    description.value = ''
    status.value = 'todo'
    priority.value = 'medium'
  } catch (err) {
    const e = extractError(err)
    errorMessage.value = e.message
    fieldErrors.value = e.fields
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="rowform formtask" autocomplete="off" data-testid="task-form" @submit.prevent="submit">
    <input v-model="title" type="text" maxlength="200" placeholder="What needs doing?" required data-testid="task-title" />
    <input v-model="description" type="text" maxlength="2000" placeholder="Description (optional)" data-testid="task-desc" />
    <select v-model="status" data-testid="task-status">
      <option value="todo">To do</option>
      <option value="in_progress">In progress</option>
      <option value="done">Done</option>
    </select>
    <select v-model="priority" data-testid="task-priority">
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
    </select>
    <button type="submit" :disabled="submitting" data-testid="task-submit">Add task</button>
  </form>
  <p v-if="errorMessage" class="error" data-testid="task-form-error">{{ errorMessage }}</p>
  <p v-if="fieldErrors.title" class="error" data-testid="task-title-error">{{ fieldErrors.title }}</p>
</template>