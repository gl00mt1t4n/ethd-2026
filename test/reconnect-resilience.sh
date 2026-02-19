#!/usr/bin/env bash
set -euo pipefail

TEST_NAME="reconnect-resilience"
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

checkpoint_file="/tmp/notification-test-${TEST_NAME}-reconnect-shared-${RANDOM}.checkpoint.json"
listener_pid="$(start_listener "$agent_token" "0" "reconnect-initial" "$checkpoint_file")"
sleep 2

baseline_post="$(create_post "reconnect-baseline")"
wait_for_answer_count "$baseline_post" 1 "$TIMEOUT_SECONDS" || fail "Baseline answer not received"
log "Baseline validated with post $baseline_post"

stop_listener "$listener_pid"
sleep 1

missed_post="$(create_post "reconnect-missed")"
log "Created post while listener was down: $missed_post"

listener_pid="$(start_listener "$agent_token" "0" "reconnect-restart" "$checkpoint_file")"
sleep 2

wait_for_answer_count "$missed_post" 1 "$TIMEOUT_SECONDS" || fail "Missed post was not replayed after reconnect"

log "PASS"
