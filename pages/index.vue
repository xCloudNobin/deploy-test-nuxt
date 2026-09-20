<script setup lang="ts">
import { useBoard } from '~/composables/useBoard'
import type { BoardApi } from '~/composables/useBoard'

const board: BoardApi = await useBoard()
provide('boardApi', board)
</script>

<template>
  <div>
    <header class="topbar">
      <div class="wrap">
        <h1>Nuxt Taskboard</h1>
        <HealthBadge />
      </div>
    </header>

    <main class="wrap grid">
      <ProjectPanel :api="board" />
      <TaskPanel :api="board" />
    </main>

    <footer class="wrap footer-note">
      <span
        >deploy-test-nuxt · Nuxt 3 SSR + SQLite · validations + restart persistence ·
        MIT</span
      >
    </footer>
  </div>
</template>