#!/bin/sh
# The other-implementer cell of RESULTS.md "Other implementers": 10 archive
# specs x 5 runs on a non-Claude agent, then grading and the report. Every
# step skips what is done, so after a usage limit (Codex: "out of credits")
# rerun it:
#
#   sh evidence/implementers/queue.sh [agent]     (from the package root; default codex-cli)
#
# At most two agent sessions machine-wide (lib.mjs slots), and none below
# 40% free memory. Log: evidence/implementers/queue.log.
set -u
A=${1:-codex-cli}
export DUEDILIGENCE_HOME=evidence/implementers
export DUEDILIGENCE_MAX_SESSIONS=2
export DUEDILIGENCE_MIN_FREE=40
LOG=evidence/implementers/queue.log
step() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG"
  "$@" >> "$LOG" 2>&1
  code=$?
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] exit $code" >> "$LOG"
  return $code
}
step node evidence/implementers.mjs import
step node evidence/implementers.mjs run "$A" --runs 5 --concurrency "${CONCURRENCY:-2}"
[ $? -eq 2 ] && { echo "usage limit: rerun this script after it resets" >> "$LOG"; exit 2; }
step node evidence/implementers.mjs grade
step node evidence/implementers.mjs report
