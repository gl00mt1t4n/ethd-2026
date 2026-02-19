#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

APP_HOST="${APP_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-3000}"
APP_BASE_URL="${APP_BASE_URL:-http://${APP_HOST}:${APP_PORT}}"
MOCK_AGENT_PORT="${MOCK_AGENT_PORT:-8787}"
MOCK_AGENT_URL="http://localhost:${MOCK_AGENT_PORT}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-45}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-2}"
APP_STARTUP_TIMEOUT_SECONDS="${APP_STARTUP_TIMEOUT_SECONDS:-90}"
MOCK_STARTUP_TIMEOUT_SECONDS="${MOCK_STARTUP_TIMEOUT_SECONDS:-30}"

TEST_NAME="${TEST_NAME:-unnamed}"
APP_PID=""
MOCK_PID=""
APP_STARTED_BY_TEST=0
MOCK_STARTED_BY_TEST=0
LISTENER_PIDS=()
CHECKPOINT_FILES=()
SEEDED_AGENT_IDS=()
CREATED_POST_IDS=()
SEEDED_AGENT_NAMES=()

log() {
  printf '[%s] %s\n' "$TEST_NAME" "$*"
}

fail() {
  printf '[%s] ERROR: %s\n' "$TEST_NAME" "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

wait_for_http() {
  local url="$1"
  local max_wait="$2"
  local elapsed=0

  while (( elapsed < max_wait )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

start_services() {
  require_cmd curl
  require_cmd node
  require_cmd openssl
  require_cmd npm

  if curl -fsS "$APP_BASE_URL/api/posts" >/dev/null 2>&1; then
    log "App already running at $APP_BASE_URL"
  else
    log "Starting app server"
    npm run dev -- --hostname "$APP_HOST" --port "$APP_PORT" >/tmp/notification-test-app.log 2>&1 &
    APP_PID="$!"
    APP_STARTED_BY_TEST=1
    if ! wait_for_http "$APP_BASE_URL/api/posts" "$APP_STARTUP_TIMEOUT_SECONDS"; then
      log "App log tail:"
      tail -n 120 /tmp/notification-test-app.log || true
      fail "App server did not become ready"
    fi
  fi

  if curl -fsS "$MOCK_AGENT_URL/health" >/dev/null 2>&1; then
    log "Mock agent already running at $MOCK_AGENT_URL"
  else
    log "Starting mock agent"
    MOCK_AGENT_PORT="$MOCK_AGENT_PORT" npm run agent:mock >/tmp/notification-test-mock.log 2>&1 &
    MOCK_PID="$!"
    MOCK_STARTED_BY_TEST=1
    if ! wait_for_http "$MOCK_AGENT_URL/health" "$MOCK_STARTUP_TIMEOUT_SECONDS"; then
      log "Mock log tail:"
      tail -n 120 /tmp/notification-test-mock.log || true
      fail "Mock agent did not become ready"
    fi
  fi
}

seed_agent_token() {
  local token hash now agent_id agent_name

  token="ag_test_$(openssl rand -hex 12)"
  hash="$(printf '%s' "$token" | openssl dgst -sha256 -hex | awk '{print $2}')"
  now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  agent_id="test-$(date +%s)-$RANDOM"
  agent_name="notification-test-agent-${RANDOM}"

  SEED_AGENT_ID="$agent_id" \
  SEED_TOKEN_HASH="$hash" \
  SEED_NOW="$now" \
  SEED_MOCK_AGENT_URL="$MOCK_AGENT_URL" \
  SEED_AGENT_NAME="$agent_name" \
  node -e '
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  await prisma.agent.create({
    data: {
      id: process.env.SEED_AGENT_ID,
      ownerWalletAddress: "0x1111111111111111111111111111111111111111",
      ownerUsername: "notification_test",
      name: process.env.SEED_AGENT_NAME,
      description: "Agent used by notification tests",
      mcpServerUrl: process.env.SEED_MOCK_AGENT_URL + "/mcp",
      transport: "http",
      entrypointCommand: null,
      tags: [],
      createdAt: new Date(process.env.SEED_NOW),
      updatedAt: new Date(process.env.SEED_NOW),
      status: "active",
      authTokenHash: process.env.SEED_TOKEN_HASH,
      verificationStatus: "verified",
      verificationError: null,
      verifiedAt: new Date(process.env.SEED_NOW),
      capabilities: ["tools"]
    }
  });
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
'

  SEEDED_AGENT_IDS+=("$agent_id")
  SEEDED_AGENT_NAMES+=("$agent_name")
  printf '%s|%s|%s\n' "$token" "$agent_id" "$agent_name"
}

start_listener() {
  local token="$1"
  local backfill="$2"
  local label="$3"
  local checkpoint_file="${4:-}"
  local logfile="/tmp/notification-test-${TEST_NAME}-${label}.log"
  if [[ -z "$checkpoint_file" ]]; then
    checkpoint_file="/tmp/notification-test-${TEST_NAME}-${label}-${RANDOM}.checkpoint.json"
  fi

  AGENT_ACCESS_TOKEN="$token" \
  ENABLE_STARTUP_BACKFILL="$backfill" \
  AGENT_CHECKPOINT_FILE="$checkpoint_file" \
  APP_BASE_URL="$APP_BASE_URL" \
  AGENT_MCP_URL="$MOCK_AGENT_URL/mcp" \
  npm run agent:listen >"$logfile" 2>&1 &

  local pid="$!"
  LISTENER_PIDS+=("$pid")
  CHECKPOINT_FILES+=("$checkpoint_file")
  echo "$pid"
}

stop_listener() {
  local pid="$1"
  if [[ -n "$pid" ]]; then
    kill "$pid" >/dev/null 2>&1 || true
  fi
}

create_post() {
  local label="$1"
  local uniq payload post_id

  uniq="${label}-$(date +%s)-$RANDOM"
  payload="{\"poster\":\"notification_tester\",\"header\":\"${label} ${uniq}\",\"content\":\"Please answer this test post ${uniq}.\"}"

  post_id="$( (curl -fsS -X POST "$APP_BASE_URL/api/posts" -H 'Content-Type: application/json' -d "$payload" || true) | node -e '
let d="";
process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(d);
    if (!j?.post?.id) process.exit(2);
    process.stdout.write(j.post.id);
  } catch {
    process.exit(2);
  }
});
')"

  if [[ -z "$post_id" ]]; then
    fail "Could not create post"
  fi

  CREATED_POST_IDS+=("$post_id")
  printf '%s' "$post_id"
}

get_answers_json() {
  local post_id="$1"
  curl -fsS "$APP_BASE_URL/api/posts/$post_id/answers"
}

wait_for_answer_count() {
  local post_id="$1"
  local min_count="$2"
  local max_wait="$3"
  local elapsed=0

  while (( elapsed < max_wait )); do
    local count
    count="$( (get_answers_json "$post_id" || true) | node -e '
let d="";
process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(d);
    const answers = Array.isArray(j?.answers) ? j.answers : [];
    process.stdout.write(String(answers.length));
  } catch {
    process.stdout.write("0");
  }
});
')"

    if [[ "$count" =~ ^[0-9]+$ ]] && (( count >= min_count )); then
      return 0
    fi

    sleep "$POLL_INTERVAL_SECONDS"
    elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
  done

  return 1
}

wait_for_agent_ids() {
  local post_id="$1"
  local expected_csv="$2"
  local max_wait="$3"
  local elapsed=0

  while (( elapsed < max_wait )); do
    local matched
    matched="$( (get_answers_json "$post_id" || true) | EXPECTED="$expected_csv" node -e '
let d = "";
const expected = (process.env.EXPECTED || "").split(",").filter(Boolean);
process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(d);
    const answers = Array.isArray(j?.answers) ? j.answers : [];
    const ids = new Set(answers.map(a => String(a.agentId || "")));
    const ok = expected.every(id => ids.has(id));
    process.stdout.write(ok ? "1" : "0");
  } catch {
    process.stdout.write("0");
  }
});
')"

    if [[ "$matched" == "1" ]]; then
      return 0
    fi

    sleep "$POLL_INTERVAL_SECONDS"
    elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
  done

  return 1
}

cleanup_db_artifacts() {
  local posts_csv agents_csv

  posts_csv="$(IFS=,; echo "${CREATED_POST_IDS[*]:-}")"
  agents_csv="$(IFS=,; echo "${SEEDED_AGENT_IDS[*]:-}")"

  POSTS_CSV="$posts_csv" AGENTS_CSV="$agents_csv" node -e '
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const posts = (process.env.POSTS_CSV || "").split(",").filter(Boolean);
  const agents = (process.env.AGENTS_CSV || "").split(",").filter(Boolean);

  if (posts.length > 0) {
    await prisma.post.deleteMany({ where: { id: { in: posts } } });
  }

  if (agents.length > 0) {
    await prisma.agent.deleteMany({ where: { id: { in: agents } } });
  }
}

main()
  .catch(() => {})
  .finally(async () => {
    await prisma.$disconnect();
  });
'
}

cleanup_test() {
  set +e

  for pid in "${LISTENER_PIDS[@]:-}"; do
    stop_listener "$pid"
  done

  for checkpoint_file in "${CHECKPOINT_FILES[@]:-}"; do
    rm -f "$checkpoint_file" >/dev/null 2>&1 || true
  done

  if (( MOCK_STARTED_BY_TEST == 1 )) && [[ -n "$MOCK_PID" ]]; then
    kill "$MOCK_PID" >/dev/null 2>&1 || true
  fi

  if (( APP_STARTED_BY_TEST == 1 )) && [[ -n "$APP_PID" ]]; then
    kill "$APP_PID" >/dev/null 2>&1 || true
  fi

  cleanup_db_artifacts

  set -e
}
