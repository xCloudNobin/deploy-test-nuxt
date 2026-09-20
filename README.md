# deploy-test-nuxt

A meaningful **Nuxt** application for the xCloud app-compatibility suite: a
project/task board written in idiomatic **Nuxt 3 SSR**, served on the
**Node.js** runtime through Nuxt's Nitro **node-server** production preset.
Persistence is **SQLite** via `better-sqlite3`.

It is a production-process fixture, not a success-page shell: the taskboard
page performs **server-side database reads** for its initial render and
hydrates into an interactive client, every mutation goes through validated
server routes backed by parameterized SQLite queries, and
`scripts/verify.sh` exercises the real compiled production build end to end —
including a real headless-browser interaction check.

## Feature summary

- **Nuxt 3 SSR with client hydration**: `pages/index.vue` loads the board from
  the server during SSR; Vue components (forms, task rows, toolbar) hydrate
  into the client and mutate through the same JSON API.
- Projects and tasks with status/priority, search (`q`) and status/priority
  filters — filter state lives in the URL so views are deep-linkable and
  server-rendered.
- Validated CRUD: blank/over-long/mistyped fields, invalid status/priority,
  malformed JSON, missing references and not-found resources all return
  meaningful JSON errors (400/404).
- Parameterized SQL everywhere (LIKE wildcards escaped); output is escaped by
  Vue's text interpolation (`{{ }}`) with no `v-html` of user data.
- Idempotent schema setup (`CREATE TABLE IF NOT EXISTS`) and repeatable seed
  data guarded by a one-time seed flag, so re-opens never duplicate rows.
- Persistence: explicit SQLite file (`DATA_DIR`/`DATABASE_PATH`); the app
  never stores permanent state in an ephemeral release directory.
- `/api/health/live` (process alive) and `/api/health/ready` (fresh database
  open + real write probe; **503** while the database is unavailable).
- Non-sensitive release marker: `scripts/build.sh` writes `VERSION` (git SHA
  by default) and bakes it into the built server; it is served by `/api/meta`
  and shown in the UI.
- Clean SIGTERM/SIGINT shutdown (Nuxt server + SQLite close plugin); logs to
  stdout/stderr.
- `scripts/verify.sh` runs install, build, strict typecheck, and a production
  smoke test that covers CRUD, errors, search/filter, graceful-stop restart
  persistence, database-unavailable readiness **and** a real browser pass.

## Runtime and dependencies

- Node.js **v22.23.2** validated (Node >= 20 supported).
- Nuxt **3.21.11** (Vue 3.5) with the **node-server** Nitro preset.
- **better-sqlite3 13.0.3** for SQLite persistence.
- Dev-only: `typescript`, `vue-tsc` (strict `nuxt typecheck`),
  `@types/node`, `@types/better-sqlite3`, `playwright-core` (browser check).
- Lockfile `package-lock.json` pins the toolchain; `npm ci` reproduces it.

Runtime versions (this verification):

| Component | Version |
|-----------|---------|
| Node.js   | 22.23.2 |
| Nuxt      | 3.21.11 |
| Vue       | 3.5.x   |
| SQLite    | via `better-sqlite3` |
| Browser (check) | system Chrome/Chromium |
| Playwright-core | 1.62.x |

## Quick start (development)

```bash
npm ci
cp .env.example .env       # review and adjust
npm run dev                # http://localhost:3000
```

The seeder creates two demo projects and a few tasks on first boot.

## Production start

```bash
npm ci
npm run build              # scripts/build.sh: writes VERSION + `nuxt build`
npm start                  # node .output/server/index.mjs
```

- Binds to `HOST:PORT` (defaults **0.0.0.0:3000**).
- Run from the repository root; the built server reads `process.cwd()` for the
  default `data/` directory and `VERSION` marker.
- The `.env.example` documents variables; set them in the real environment
  when running the compiled server. Logs go to stdout/stderr.

## Health and readiness

| Endpoint | Meaning |
|----------|---------|
| `GET /api/health/live`  | Process is alive (always 200 while serving). |
| `GET /api/health/ready` | Fresh SQLite open + write probe; **503** with `status: "unavailable"` and the underlying reason when the database is unavailable. |

Readiness is a genuine dependency probe, not a static marker.
`scripts/smoke.sh` proves it: it starts the production process against a
database path that cannot be created (parent is a regular file), observes
readiness drop to 503 while liveness stays 200.

## Environment variables

See `.env.example` for the full commented list.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | no | `3000` | bind port |
| `HOST` | no | `0.0.0.0` | bind address |
| `DATA_DIR` | no | `<repo>/data` | base data directory |
| `DATABASE_PATH` | no | `<DATA_DIR>/taskboard.db` | **persistent SQLite path** |
| `BUILD_MARKER` | no | git SHA | release marker in `/api/meta` & the UI |

No credentials or secrets are committed or required. There are no
cookie-authenticated mutations (the board is guest-facing), so there is no
CSRF surface to protect.

## Persistence

Data lives in the SQLite file at `DATABASE_PATH`, which defaults under
`DATA_DIR` (gitignored). For redeploys that reuse or replace the release
directory, mount a persistent volume at `DATA_DIR`/`DATABASE_PATH` so the
file survives. `scripts/smoke.sh` proves restart persistence: it creates a
survivor task over HTTP, gracefully stops the production process (SIGTERM),
restarts it on the **same database path**, and verifies the record is still
served with stable counts.

## Schema

Created by `server/utils/db.ts` (`CREATE TABLE IF NOT EXISTS`, idempotent):

- `project` — id, name, description, status (`active|archived`), timestamps.
- `task` — id, `project_id` FK (`ON DELETE CASCADE`), title, description,
  status (`todo|in_progress|done`), priority (`low|medium|high`), timestamps.
- `seed_flag` — marks the one-time seed as applied.
- `heartbeat` — backing table for the readiness write probe.

Seeding is repeatable: the second and subsequent opens never add rows
(asserted by the smoke test's `q=launch` count check).

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health/live` | liveness |
| GET | `/api/health/ready` | readiness (DB probe) |
| GET | `/api/meta` | release marker + runtime/database info |
| GET | `/api/board` | SSR board payload: projects + filtered tasks + query + release |
| GET/POST | `/api/projects` | list / create projects |
| GET/PATCH/DELETE | `/api/projects/:id` | read (with tasks) / update / delete |
| GET/POST | `/api/tasks` | list (filters `q`, `status`, `priority`, `project_id`) / create |
| GET/PATCH/DELETE | `/api/tasks/:id` | read / update / delete |

The UI at `/` consumes the same JSON API, server-rendered on first load.

## Automated verification

```bash
scripts/verify.sh
```

Runs, in order:

1. Clean install — `rm -rf node_modules && npm ci` (frozen lockfile).
2. `scripts/build.sh` — writes `VERSION` marker and compiles `.output/`
   (`nuxt build`, node-server preset).
3. Strict typecheck — `nuxt typecheck` (vue-tsc over the project).
4. Syntax check — `node --check scripts/browser-smoke.js`.
5. `scripts/smoke.sh` — real production process (`node .output/server/index.mjs`):
   - liveness/readiness, release marker in `/api/meta`, `api/board` and the
     SSR page, SSR-served database tasks, client assets;
   - project/task CRUD over HTTP, read-back, delete;
   - search and status/priority filters;
   - negative/validation cases (400) and not-found/unknown-method (404);
   - SQLite file written to disk;
   - real headless-browser pass (playwright-core + system Chrome): hydration,
     create/edit/delete via the forms, search/status filter, server validation
     error display, release/ready badges;
   - persistence survivor survives graceful stop → restart on the **same**
     SQLite path with stable counts, seed not duplicated;
   - database-unavailable readiness: `503` with `status: "unavailable"` while
     liveness stays `200` and API routes degrade to 503.

Exit 0 only when every check passes. `CHROME_BIN` can point at a Chrome
executable if it is not discoverable on `PATH`.

## Repository layout

```
app.vue, pages/          SSR page shell + taskboard page
components/              HealthBadge, ProjectPanel, TaskPanel, TaskForm, TaskItem
composables/useBoard.ts  shared SSR board data + mutation API
server/api/              Nitro route handlers (health/meta/board/projects/tasks)
server/utils/            db.ts (schema/seed/probe/CRUD), validation.ts, config.ts
server/plugins/          clean shutdown (SQLite close on 'close' hook)
scripts/                 build.sh (marker + nuxt build), browser-smoke.js,
                         smoke.sh (production check), verify.sh (full check)
assets/css/main.css      styles
package.json, package-lock.json
```

## License

MIT — see [LICENSE](LICENSE). This fixture is part of the MIT-licensed
[xCloud app-compatibility suite](https://github.com/xCloudNobin/app-compatibility).