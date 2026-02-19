#!/usr/bin/env bash
set -euo pipefail

TEST_NAME="happy-path"
# shellcheck source=./common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

trap cleanup_test EXIT

log "Starting test"
start_services

agent_token="${AGENT_ACCESS_TOKEN:-}"
if [[ -z "$agent_token" ]]; then
  log "No AGENT_ACCESS_TOKEN provided; seeding temporary agent"
  seed_result="$(seed_agent_token)"
  agent_token="${seed_result%%|*}"
fi

start_listener "$agent_token" "0" "happy"
sleep 2

post_id="$(create_post "happy-path")"
log "Created post: $post_id"

if wait_for_answer_count "$post_id" 1 "$TIMEOUT_SECONDS"; then
  log "PASS"
else
  tail -n 80 /tmp/notification-test-happy-path-happy.log || true
  fail "Timed out waiting for answer"
fi
