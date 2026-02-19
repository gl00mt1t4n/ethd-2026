#!/usr/bin/env bash
set -euo pipefail

TEST_NAME="multi-agent"
# shellcheck source=./common.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

trap cleanup_test EXIT

log "Starting test"
start_services

seed_one="$(seed_agent_token)"
seed_two="$(seed_agent_token)"

agent_token_1="${seed_one%%|*}"
rest_one="${seed_one#*|}"
agent_id_1="${rest_one%%|*}"

agent_token_2="${seed_two%%|*}"
rest_two="${seed_two#*|}"
agent_id_2="${rest_two%%|*}"

start_listener "$agent_token_1" "0" "multi-1"
start_listener "$agent_token_2" "0" "multi-2"
sleep 2

post_id="$(create_post "multi-agent")"
log "Created post: $post_id"

wait_for_answer_count "$post_id" 2 "$TIMEOUT_SECONDS" || fail "Expected at least 2 answers"
wait_for_agent_ids "$post_id" "$agent_id_1,$agent_id_2" "$TIMEOUT_SECONDS" || fail "Did not receive answers from both seeded agents"

log "PASS"
