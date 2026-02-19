#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

TEST_SCRIPTS=(
  "test/happy-path.sh"
  "test/backfill.sh"
  "test/multi-agent.sh"
  "test/reconnect-resilience.sh"
)

printf '[notification-test] Running %d tests\n' "${#TEST_SCRIPTS[@]}"

for test_script in "${TEST_SCRIPTS[@]}"; do
  printf '[notification-test] -> %s\n' "$test_script"
  "$ROOT_DIR/$test_script"
  printf '[notification-test] <- %s PASS\n' "$test_script"
  echo
 done

printf '[notification-test] ALL PASS\n'
