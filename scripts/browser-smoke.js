#!/usr/bin/env node
// Browser check for the Nuxt taskboard production build.
//
// Drives the real client (system Chromium via playwright-core) against the
// running production server: SSR page load, hydration, release/health badges,
// create-task form mutation, search filter, edit, server validation error
// display and delete — all as a human would interact with the board.
//
// Env:
//   BASE       base URL of the running production server (default localhost)
//   MARKER     expected release marker shown in the UI
//   CHROME_BIN (optional) path to the Chrome/Chromium executable
//
// Exit codes: 0 = all checks passed, nonzero = a check failed.
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = (process.env.BASE || 'http://127.0.0.1:3000').replace(/\/+$/, '')
const MARKER = process.env.MARKER || ''

function findChrome() {
  const preset = process.env.CHROME_BIN
  if (preset && fs.existsSync(preset)) return preset
  for (const c of [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ]) {
    if (fs.existsSync(c)) return c
  }
  return preset || 'google-chrome'
}

let pass = 0
let fail = 0

function check(cond, okMessage, badMessage) {
  if (cond) {
    pass += 1
    console.log(`  ok   ${okMessage}`)
  } else {
    fail += 1
    console.log(`  FAIL ${badMessage}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(fn, label, timeout = 15000) {
  const start = Date.now()
  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop
      if (await fn()) return true
    } catch {
      /* selector may be absent; keep polling */
    }
    if (Date.now() - start > timeout) {
      console.log(`  (timed out waiting for: ${label})`)
      return false
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(200)
  }
}

async function taskTitles(page) {
  return page.$$eval('li.task .task-title', (els) => els.map((e) => e.textContent || ''))
}

const browser = await chromium.launch({
  executablePath: findChrome(),
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
page.on('dialog', (d) => d.accept())
const clientErrors = []
page.on('pageerror', (e) => clientErrors.push(String(e)))

console.log(`browser check against ${BASE} (marker ${MARKER || '<none>'})`)

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })

const h1 = await page.textContent('h1').catch(() => '')
check(h1.includes('Nuxt Taskboard'), 'page heading rendered', `heading missing: ${h1 || 'empty'}`)

const rows = await waitFor(
  () => page.$$eval('li.task', (els) => els.length).then((n) => n > 0),
  'task rows from database',
)
check(rows, 'task list rendered on the client (hydration of SSR data)', 'no tasks rendered in the browser')

const ready = await waitFor(
  () =>
    page
      .$eval('[data-badge="ready"]', (el) => el.textContent || '')
      .then((t) => t.includes('ready'))
      .catch(() => false),
  'readiness badge ready',
)
check(ready, 'readiness badge shows "ready"', 'readiness badge not ready')

const releaseBadge = await page.$eval('[data-badge="release"]', (el) => el.textContent || '').catch(() => '')
check(
  !MARKER || releaseBadge.includes(MARKER),
  `release marker "${MARKER}" shown in UI`,
  `release marker missing from UI badge: "${releaseBadge}"`,
)

const unique = `BrowserTask-${Date.now()}`
await page.fill('[data-testid="task-title"]', unique)
await page.selectOption('[data-testid="task-status"]', 'done')
await page.selectOption('[data-testid="task-priority"]', 'high')
await page.click('[data-testid="task-submit"]')

const created = await waitFor(
  () => taskTitles(page).then((titles) => titles.some((t) => t.includes(unique))),
  'created task to appear',
)
check(created, `create task via hydrated form (${unique})`, 'created task did not appear')

await page.fill('[data-testid="search"]', unique)
const filtered = await waitFor(
  () =>
    taskTitles(page).then((titles) => titles.length >= 1 && titles.every((t) => t.includes(unique))),
  'search filter to narrow list',
)
check(filtered, 'search filter narrows the task list to the match', 'search filter did not narrow the list')

await page.fill('[data-testid="search"]', '')
const restored = await waitFor(
  () => taskTitles(page).then((titles) => titles.some((t) => t.includes('Write the launch blurb'))),
  'full list restored after clearing search',
)
check(restored, 'clearing search restores the full list', 'search clear did not restore list')

await page.selectOption('[data-testid="filter-status"]', 'done')
const doneFiltered = await waitFor(
  () =>
    taskTitles(page).then((titles) =>
      titles.length > 0 && titles.includes(unique) && !titles.some((t) => t.includes('Prepare rollback notes')),
    ),
  'status filter to show done only',
)
check(doneFiltered, 'status filter shows done tasks and hides todo tasks', 'status filter did not behave as expected')

await page.selectOption('[data-testid="filter-status"]', '')
await waitFor(
  () => taskTitles(page).then((titles) => titles.some((t) => t.includes('Prepare rollback notes'))),
  'status filter cleared',
)

const editTitle = `${unique}-edited`
await page.click(`li.task[data-task-title="${unique}"] button[data-testid="task-edit"]`)
await page.fill('[data-testid="edit-title"]', editTitle)
await page.selectOption('[data-testid="edit-status"]', 'in_progress')
await page.click('[data-testid="edit-save"]')
const editedShown = await waitFor(
  () => taskTitles(page).then((titles) => titles.some((t) => t.includes(editTitle))),
  'edited task title to appear',
)
check(editedShown, `edit task status/title via hydrated form (${editTitle})`, 'task edit was not reflected in the list')

await page.fill('[data-testid="task-title"]', '   ')
await page.click('[data-testid="task-submit"]')
const errShown = await waitFor(
  () =>
    page
      .$eval('[data-testid="task-form-error"]', (el) => (el.textContent || '').length > 0)
      .catch(() => false),
  'validation error message',
  10000,
)
check(errShown, 'server validation error displayed for blank task', 'validation error not displayed for blank task')

await page.click(`li.task[data-task-title="${editTitle}"] button[data-testid="task-delete"]`)
const deleted = await waitFor(
  () => taskTitles(page).then((titles) => !titles.some((t) => t.includes(editTitle))),
  'deleted task to disappear',
)
check(deleted, 'delete task via hydrated form', 'task delete did not remove the row')

check(clientErrors.length === 0, 'no client page errors', `client page errors: ${clientErrors.slice(0, 3).join(' | ')}`)

await browser.close()

console.log(`browser-smoke summary: ${pass} ok, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)