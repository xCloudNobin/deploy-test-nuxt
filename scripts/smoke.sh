#!/usr/bin/env bash
# Reproducible production smoke test for the Nuxt taskboard.
#
# 1. Starts the REAL production process: `node .output/server/index.mjs` (the
#    compiled Nuxt server, not the dev server).
# 2. Exercises liveness/readiness, release marker, SSR page/asset serving,
#    project/task CRUD, search/filter, and negative validation cases over HTTP.
# 3. Drives the real client in a headless browser (playwright-core + system
#    Chrome): hydration, form mutation, edit, validation error display, delete.
# 4. Gracefully stops the process, restarts it on the SAME SQLite path and
#    proves a survivor record persisted across the restart.
# 5. Makes the database unavailable (its parent path is a regular file) and
#    proves readiness goes 503 while liveness stays 200.
#
# Exit codes: 0 = all checks passed, nonzero = a check failed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
NODE="${NODE:-$(command -v node)}"
[ -x "$NODE" ] || { echo "node executable not found" >&2; exit 1; }
[ -f "$ROOT/.output/server/index.mjs" ] || { echo ".output/server/index.mjs missing; run scripts/build.sh first" >&2; exit 1; }

WORK="$(mktemp -d /tmp/nuxt-smoke.XXXXXX)"
PIDFILE="$WORK/server.pid"
DB="$WORK/data/taskboard.db"
LOG1="$WORK/server1.log"
LOG2="$WORK/server2.log"
LOG3="$WORK/server-fail.log"
BASE="http://127.0.0.1"
SURVIVOR_NAME="PERSIST-$(date +%s)-survivor"

PASS=0
FAIL=0

ok()  { PASS=$((PASS + 1)); echo "ok   $*"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL $*"; }

cleanup() {
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    sleep 0.2
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

pick_port() {
  "$NODE" -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});'
}

start_server() { # db_path port logfile -> 0 on success
  local db_path="$1" port="$2" logfile="$3"
  DATA_DIR="$(dirname "$db_path")" \
  DATABASE_PATH="$db_path" \
  PORT="$port" HOST="127.0.0.1" BUILD_MARKER="smoke-$port" \
    "$NODE" "$ROOT/.output/server/index.mjs" >"$logfile" 2>&1 &
  echo $! > "$PIDFILE"
  sleep 1
}

stop_server() { # graceful SIGTERM wait then SIGKILL fallback
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [ -n "$pid" ]; then
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 80); do
      if ! kill -0 "$pid" 2>/dev/null; then break; fi
      sleep 0.25
    done
    if kill -0 "$pid" 2>/dev/null; then
      bad "process did not exit gracefully, forcing"
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$PIDFILE"
}

wait_live() { # port label logfile
  local port="$1" label="$2" logfile="${3:-}"
  local code=000
  for _ in $(seq 1 80); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE:$port/api/health/live" || true)"
    [ "$code" = "200" ] && { ok "liveness HTTP 200 ($label)"; return 0; }
    sleep 0.3
  done
  bad "server never became live (last code $code, $label)"
  [ -n "$logfile" ] && [ -f "$logfile" ] && tail -20 "$logfile" || true
  return 1
}

expect_status() { # label url expected [method] [curl args...]
  local label="$1" url="$2" expected="$3"
  shift 3
  local method="GET"
  if [ "$#" -gt 0 ]; then method="$1"; shift; fi
  local curl_args=("$@")
  local code
  if [ "${#curl_args[@]}" -gt 0 ]; then
    code="$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "${curl_args[@]}" "$url" || true)"
  else
    code="$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$url" || true)"
  fi
  if [ "$code" = "$expected" ]; then ok "$label ($code)"; else bad "$label: expected $expected got $code"; fi
}

json_field() { # file dot.path -> value
  python3 - "$1" "$2" <<'PY'
import sys, json
with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
for key in sys.argv[2].split("."):
    data = data[key]
print(data)
PY
}

post_json() { # url payload_file out_file -> http code
  curl -s -o "$3" -w '%{http_code}' -X POST \
    -H 'content-type: application/json' --data-binary @"$2" "$1"
}

patch_json() { # url payload_file out_file -> http code
  curl -s -o "$3" -w '%{http_code}' -X PATCH \
    -H 'content-type: application/json' --data-binary @"$2" "$1"
}

body() { # url -> body
  curl -s "$1"
}

printf '=== Nuxt smoke start: %s ===\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

PORT1="$(pick_port)"
echo "phase 1: production server on 127.0.0.1:$PORT1 (node .output/server/index.mjs)"
[ -f "$ROOT/.output/server/index.mjs" ] && ok "production build exists (.output/server/index.mjs)" || bad "build missing"
start_server "$DB" "$PORT1" "$LOG1"
wait_live "$PORT1" "phase-1" "$LOG1"

MARKER="smoke-$PORT1"
meta="$(body "$BASE:$PORT1/api/meta")"
case "$meta" in
  *"$MARKER"*) ok "release marker in /api/meta ($MARKER)";;
  *) bad "release marker missing from /api/meta: $meta";;
esac
case "$meta" in
  *'"framework":"nuxt"'*) ok "runtime reports nuxt";;
  *) bad "framework not reported as nuxt";;
esac

ready="$(body "$BASE:$PORT1/api/health/ready")"
case "$ready" in
  *'"status":"ready"'*) ok "readiness reports ready";;
  *) bad "readiness payload: $ready";;
esac

board="$(body "$BASE:$PORT1/api/board")"
case "$board" in
  *"Launch checklist"*) ok "board exposes idempotent seed data";;
  *) bad "seed data missing from board: $board";;
esac
case "$board" in
  *"$MARKER"*) ok "release marker in /api/board payload";;
  *) bad "release marker missing from board";;
esac

index="$(body "$BASE:$PORT1/")"
case "$index" in
  *"Nuxt Taskboard"*) ok "SSR UI served at /";;
  *) bad "SSR index not served";;
esac
case "$index" in
  *"Write the launch blurb"*) ok "SSR: server rendered seeded task from database";;
  *) bad "SSR did not render database tasks";;
esac
case "$index" in
  *"$MARKER"*) ok "release marker rendered in SSR page";;
  *) bad "release marker missing from SSR page";;
esac

ASSET="$(printf '%s' "$index" | grep -oE '/_nuxt/[^"]+\.js' | head -1 || true)"
if [ -n "$ASSET" ]; then
  expect_status "nuxt client asset served" "$BASE:$PORT1$ASSET" 200
else
  bad "no /_nuxt client asset found in SSR html"
fi
expect_status "unknown API -> 404" "$BASE:$PORT1/api/unknown" 404

# ---- project creation
PROJ_CODE="$(post_json "$BASE:$PORT1/api/projects" <(printf '%s' '{"name":"Smoke Project","description":"created over HTTP","status":"active"}') "$WORK/project.json")"
[ "$PROJ_CODE" = "201" ] && ok "create project (201)" || bad "create project: $PROJ_CODE"
PROJ_ID="$(json_field "$WORK/project.json" project.id)"

# ---- task creation (one per status to feed filters later)
T1_OUT="$WORK/task1.json"; T2_OUT="$WORK/task2.json"; T3_OUT="$WORK/task3.json"
C1="$(post_json "$BASE:$PORT1/api/tasks" <(printf '{"project_id":%s,"title":"Smoke task done","description":"first","status":"done","priority":"high"}' "$PROJ_ID") "$T1_OUT")"
[ "$C1" = "201" ] && ok "create task done (201)" || bad "create task done: $C1"
C2="$(post_json "$BASE:$PORT1/api/tasks" <(printf '{"project_id":%s,"title":"Smoke task in progress","description":"second","status":"in_progress","priority":"medium"}' "$PROJ_ID") "$T2_OUT")"
[ "$C2" = "201" ] && ok "create task in_progress (201)" || bad "create task in_progress: $C2"
C3="$(post_json "$BASE:$PORT1/api/tasks" <(printf '{"project_id":%s,"title":"Smoke task todo","description":"third","status":"todo","priority":"low"}' "$PROJ_ID") "$T3_OUT")"
[ "$C3" = "201" ] && ok "create task todo (201)" || bad "create task todo: $C3"

T1_ID="$(json_field "$T1_OUT" task.id)"

# read back project detail
proj="$(body "$BASE:$PORT1/api/projects/$PROJ_ID")"
hits=0
case "$proj" in *"Smoke task done"*) hits=$((hits + 1));; esac
case "$proj" in *"Smoke task in progress"*) hits=$((hits + 1));; esac
case "$proj" in *"Smoke task todo"*) hits=$((hits + 1));; esac
[ "$hits" = "3" ] && ok "read: project exposes all three tasks" || bad "project task listing incomplete (hits=$hits)"

# search
search="$(body "$BASE:$PORT1/api/tasks?q=Smoke+task+done")"
case "$search" in *"Smoke task done"*) ok "search finds matching task";; *) bad "search missed task";; esac
case "$search" in *"Smoke task todo"*) bad "search leaked non-matching task";; *) ok "search excludes non-matching task";; esac

# status filter
filtered="$(body "$BASE:$PORT1/api/tasks?status=done&project_id=$PROJ_ID")"
case "$filtered" in
  *"Smoke task done"*) ok "status filter includes done task";;
  *) bad "status filter missed done task";;
esac
case "$filtered" in
  *"Smoke task todo"*) bad "status filter leaked todo task";;
  *) ok "status filter excludes todo task";;
esac

# priority filter
prio="$(body "$BASE:$PORT1/api/tasks?priority=high&project_id=$PROJ_ID")"
case "$prio" in
  *"Smoke task done"*) ok "priority filter includes high task";;
  *) bad "priority filter missed high task";;
esac
case "$prio" in
  *"Smoke task in progress"*) bad "priority filter leaked medium task";;
  *) ok "priority filter excludes medium task";;
esac

# update task
UP="$WORK/update.json"
U="$(patch_json "$BASE:$PORT1/api/tasks/$T1_ID" <(printf '%s' '{"title":"Smoke task done (updated)","status":"done","priority":"high"}') "$UP")"
[ "$U" = "200" ] && ok "update task (200)" || bad "update task: $U"
updated="$(body "$BASE:$PORT1/api/tasks/$T1_ID")"
case "$updated" in *"Smoke task done (updated)"*) ok "read-back confirms task update";; *) bad "task update not reflected";; esac

# update project
PU="$(patch_json "$BASE:$PORT1/api/projects/$PROJ_ID" <(printf '%s' '{"name":"Smoke Project (renamed)"}') "$WORK/project-updated.json")"
[ "$PU" = "200" ] && ok "update project (200)" || bad "update project: $PU"
proj2="$(body "$BASE:$PORT1/api/projects/$PROJ_ID")"
case "$proj2" in *"Smoke Project (renamed)"*) ok "read-back confirms project update";; *) bad "project update not reflected";; esac

# delete a throwaway task
TD_KEEP="$(post_json "$BASE:$PORT1/api/tasks" <(printf '{"project_id":%s,"title":"throwaway","status":"todo","priority":"low"}' "$PROJ_ID") "$WORK/throw.json")"
[ "$TD_KEEP" = "201" ] && ok "create throwaway task (201)" || bad "create throwaway: $TD_KEEP"
THROW_ID="$(json_field "$WORK/throw.json" task.id)"
D="$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE:$PORT1/api/tasks/$THROW_ID")"
[ "$D" = "204" ] && ok "delete task (204)" || bad "delete task: $D"
expect_status "deleted task -> 404" "$BASE:$PORT1/api/tasks/$THROW_ID" 404

# ---- negative / validation cases
expect_status "blank task title -> 400" "$BASE:$PORT1/api/tasks" 400 POST \
  -H 'content-type: application/json' --data-binary '{"project_id":1,"title":"   "}'
expect_status "missing project_id -> 400" "$BASE:$PORT1/api/tasks" 400 POST \
  -H 'content-type: application/json' --data-binary '{"title":"x"}'
expect_status "invalid task status -> 400" "$BASE:$PORT1/api/tasks" 400 POST \
  -H 'content-type: application/json' --data-binary '{"project_id":1,"title":"x","status":"warp"}'
expect_status "invalid priority -> 400" "$BASE:$PORT1/api/tasks" 400 POST \
  -H 'content-type: application/json' --data-binary '{"project_id":1,"title":"x","priority":"urgent"}'
expect_status "malformed json -> 400" "$BASE:$PORT1/api/tasks" 400 POST \
  -H 'content-type: application/json' --data-binary '{nope'
expect_status "blank project name -> 400" "$BASE:$PORT1/api/projects" 400 POST \
  -H 'content-type: application/json' --data-binary '{"name":"   "}'
expect_status "invalid project status -> 400" "$BASE:$PORT1/api/projects" 400 POST \
  -H 'content-type: application/json' --data-binary '{"name":"x","status":"warp"}'
expect_status "unknown project reference -> 400" "$BASE:$PORT1/api/tasks" 400 POST \
  -H 'content-type: application/json' --data-binary '{"project_id":999999,"title":"x"}'
expect_status "unknown task -> 404" "$BASE:$PORT1/api/tasks/999999" 404
expect_status "unknown project -> 404" "$BASE:$PORT1/api/projects/999999" 404
expect_status "empty patch -> 400" "$BASE:$PORT1/api/tasks/$T1_ID" 400 PATCH \
  -H 'content-type: application/json' --data-binary '{}'
expect_status "invalid status filter -> 400" "$BASE:$PORT1/api/tasks?status=nope" 400
expect_status "invalid priority filter -> 400" "$BASE:$PORT1/api/board?priority=ultra" 400
expect_status "unmatched method -> not 200/500" "$BASE:$PORT1/api/tasks" 404 PUT \
  -H 'content-type: application/json' --data-binary '{}'

errbody="$(curl -s -X POST -H 'content-type: application/json' --data-binary '{"project_id":1,"title":"   "}' "$BASE:$PORT1/api/tasks" || true)"
case "$errbody" in
  *"title"*"required"*) ok "meaningful validation error body";;
  *) bad "validation error body unexpected: $errbody";;
esac

metabody="$(body "$BASE:$PORT1/api/health/live")"
case "$metabody" in *'"status":"alive"'*) ok "liveness payload sane";; *) bad "liveness payload: $metabody";; esac

if [ -f "$DB" ]; then
  bytes=$(wc -c < "$DB")
  [ "$bytes" -gt 0 ] && ok "sqlite data stored on disk ($bytes bytes)" || bad "database file empty"
else
  bad "database file missing at configured path"
fi

# ---- persistence survivor
SRV="$WORK/survivor.json"
SC="$(post_json "$BASE:$PORT1/api/tasks" <(printf '{"project_id":%s,"title":"%s","description":"must survive restart","status":"in_progress","priority":"high"}' "$PROJ_ID" "$SURVIVOR_NAME") "$SRV")"
[ "$SC" = "201" ] && ok "persistence survivor created" || bad "survivor create: $SC"
SURV_ID="$(json_field "$SRV" task.id)"
COUNT_BEFORE="$(body "$BASE:$PORT1/api/tasks?project_id=$PROJ_ID" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["tasks"]))')"

echo "--- phase 2: graceful stop (SIGTERM)"
stop_server

echo "--- phase 3: restart on same sqlite path (persistence) + browser check"
PORT2="$(pick_port)"
start_server "$DB" "$PORT2" "$LOG2"
wait_live "$PORT2" "phase-3" "$LOG2"
surv="$(body "$BASE:$PORT2/api/tasks/$SURV_ID")"
case "$surv" in
  *"$SURVIVOR_NAME"*) ok "persistence: survivor task survived restart";;
  *) bad "persistence FAILED: survivor missing after restart";;
esac
COUNT_AFTER="$(body "$BASE:$PORT2/api/tasks?project_id=$PROJ_ID" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["tasks"]))')"
[ "$COUNT_BEFORE" = "$COUNT_AFTER" ] && ok "task counts stable across restart ($COUNT_AFTER)" || bad "count changed: $COUNT_BEFORE -> $COUNT_AFTER"

SEED_COUNT="$(body "$BASE:$PORT2/api/tasks?q=launch" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["tasks"]))')"
[ "$SEED_COUNT" = "1" ] && ok "idempotent schema init: seed not duplicated" || bad "seed duplicated/lost: q=launch count=$SEED_COUNT"

if [ -n "${CHROME_BIN:-}" ] || command -v google-chrome >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1; then
  echo "--- phase 3b: real browser check (playwright-core + system chrome)"
  if BASE="$BASE:$PORT2" MARKER="smoke-$PORT2" \
      "$NODE" "$ROOT/scripts/browser-smoke.js"; then
    ok "browser check passed"
  else
    bad "browser check failed"
  fi
else
  echo "no chromium/google-chrome found; skipping browser phase (CHROME_BIN can point to one)"
fi

echo "--- phase 4: database unavailable (readiness must fail while process stays alive)"
BLOCKED="$WORK/blocked.txt"
touch "$BLOCKED"
PORT3="$(pick_port)"
start_server "$BLOCKED/unreachable.db" "$PORT3" "$LOG3"
wait_live "$PORT3" "phase-4" "$LOG3"
expect_status "readiness /api/health/ready -> 503" "$BASE:$PORT3/api/health/ready" 503
expect_status "liveness /api/health/live -> 200" "$BASE:$PORT3/api/health/live" 200
ready_down="$(body "$BASE:$PORT3/api/health/ready" || true)"
case "$ready_down" in
  *'"status":"unavailable"'*) ok "readiness body reports unavailable";;
  *) bad "readiness down body: $ready_down";;
esac
expect_status "API list route degrades to 503" "$BASE:$PORT3/api/tasks" 503
expect_status "board endpoint degrades to 503" "$BASE:$PORT3/api/board" 503
page_code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE:$PORT3/" || true)"
[ "$page_code" = "200" ] && ok "SSR page still served while database down ($page_code)" || bad "page degraded unexpectedly: $page_code"
stop_server

echo
printf '=== Nuxt smoke summary: %s passed, %s failed ===\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]