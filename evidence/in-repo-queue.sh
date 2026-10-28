#!/bin/sh
# One case set of RESULTS.md "In other repositories", end to end, resumable:
# check (no model), prepare both arms, the real commits against the suites
# (no model), Haiku 5 + 5 runs on the confirmed specs, Codex 5 runs, report.
# Every step skips what is done; after a usage limit, rerun it.
#
#   sh evidence/in-repo-queue.sh evidence/in-repo-ufo/cases.json      (from the package root)
#
# At most two sessions machine-wide and none below 40% free memory (lib.mjs
# slots). Log: <set>/queue.log.
set -u
C=$1
SET=$(dirname "$C")
export DUEDILIGENCE_MAX_SESSIONS=2
export DUEDILIGENCE_MIN_FREE=40
LOG=$SET/queue.log
step() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG"
  "$@" >> "$LOG" 2>&1
  code=$?
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] exit $code" >> "$LOG"
  return $code
}
step node evidence/in-repo.mjs check --cases "$C"
step node evidence/in-repo.mjs prepare --cases "$C" --concurrency 2
step node evidence/in-repo.mjs commit --cases "$C"
step node evidence/in-repo.mjs run --cases "$C" --concurrency 2
[ $? -eq 2 ] && { echo "usage limit: rerun this script after it resets" >> "$LOG"; exit 2; }
step node evidence/in-repo.mjs run --cases "$C" --backend codex-cli --concurrency 2
step node evidence/in-repo.mjs report --cases "$C"
