<script setup lang="ts">
import type { BoardApi } from '~/composables/useBoard'
import type { TaskRow } from '~/types/board'

const props = defineProps<{ task: TaskRow; api: BoardApi }>()

const editing = ref(false)
const errorMessage = ref('')
const saving = ref(false)
const editTitle = ref('')
const editDescription = ref('')
const editStatus = ref('todo')
const editPriority = ref('medium')

const statusOptions = ['todo', 'in_progress', 'done']
const priorityOptions = ['low', 'medium', 'high']

function beginEdit() {
  editTitle.value = props.task.title
  editDescription.value = props.task.description
  editStatus.value = props.task.status
  editPriority.value = props.task.priority
  errorMessage.value = ''
  editing.value = true
}

async function save() {
  saving.value = true
  errorMessage.value = ''
  try {
    await props.api.updateTask(props.task.id, {
      title: editTitle.value,
      description: editDescription.value,
      status: editStatus.value,
      priority: editPriority.value,
    })
    editing.value = false
  } catch (err) {
    const e = extractError(err)
    errorMessage.value = e.message
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (import.meta.server) return
  if (!window.confirm(`Delete task "${props.task.title}"?`)) return
  errorMessage.value = ''
  try {
    await props.api.deleteTask(props.task.id)
  } catch (err) {
    errorMessage.value = extractError(err).message
  }
}
</script>

<template>
  <li class="task" :data-task-id="task.id" :data-task-title="task.title">
    <div v-if="!editing" class="task-main">
      <span class="task-title" data-testid="task-title">{{ task.title }}</span>
      <span class="task-meta">
        {{ task.project_name }} · {{ task.status.replace('_', ' ') }} · priority {{ task.priority }}
      </span>
      <span v-if="task.description" class="task-desc">{{ task.description }}</span>
    </div>
    <div v-else class="task-main">
      <form class="task-editform" autocomplete="off" data-testid="task-edit-form" @submit.prevent="save">
        <input
          v-model="editTitle"
          type="text"
          maxlength="200"
          required
          data-testid="edit-title"
        />
        <input v-model="editDescription" type="text" maxlength="2000" placeholder="Description" data-testid="edit-desc" />
        <select v-model="editStatus" data-testid="edit-status">
          <option v-for="s in statusOptions" :key="s" :value="s">{{ s.replace('_', ' ') }}</option>
        </select>
        <select v-model="editPriority" data-testid="edit-priority">
          <option v-for="p in priorityOptions" :key="p" :value="p">{{ p }}</option>
        </select>
        <button type="submit" :disabled="saving" data-testid="edit-save">Save</button>
        <button type="button" @click="editing = false">Cancel</button>
      </form>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    </div>
    <div v-if="!editing" class="task-actions">
      <button type="button" class="edit" data-testid="task-edit" @click="beginEdit">Edit</button>
      <button type="button" class="delete" data-testid="task-delete" @click="remove">Delete</button>
    </div>
  </li>
</template>