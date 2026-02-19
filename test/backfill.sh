#!/usr/bin/env bash
set -euo pipefail

TEST_NAME="backfill"
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

post_a="$(create_post "backfill-A")"
post_b="$(create_post "backfill-B")"
log "Created posts before listener: $post_a, $post_b"

start_listener "$agent_token" "1" "backfill"
sleep 2

wait_for_answer_count "$post_a" 1 "$TIMEOUT_SECONDS" || fail "Backfill failed for $post_a"
wait_for_answer_count "$post_b" 1 "$TIMEOUT_SECONDS" || fail "Backfill failed for $post_b"

log "PASS"
