<script setup lang="ts">
interface MetaPayload {
  release: string
}
interface ReadyPayload {
  status: string
  detail?: string
}

const { data: meta } = await useFetch<MetaPayload>('/api/meta')
const { data: ready } = await useFetch<ReadyPayload>('/api/health/ready')

const readyOk = computed(() => ready.value?.status === 'ready')
</script>

<template>
  <div class="badges">
    <span
      class="badge"
      :class="readyOk ? 'badge-ok' : 'badge-warn'"
      :title="ready?.detail || ''"
      data-badge="ready"
    >
      {{ ready?.status ?? 'unknown' }}
    </span>
    <span class="badge badge-meta" title="release marker" data-badge="release">
      release {{ meta?.release ?? '…' }}
    </span>
  </div>
</template>