#!/bin/sh
# The other-backend arm of RESULTS.md "Writer backends", in priority order.
# Every step skips what is already done, so after a usage limit (Codex says
# "out of credits") rerun it:
#
#   sh evidence/backends/queue.sh [backend]      (from the package root; default codex-cli)
#
# Writers run through lib.mjs `session` and its slot limiter (three sessions
# machine-wide). Suites land in evidence/backends/specs/, transcripts in
# evidence/backends/runs/, the log in evidence/backends/queue.log. Then:
#   DUEDILIGENCE_HOME=<claude scratch home> node evidence/backends.mjs report --backend <backend>
set -u
B=${1:-codex-cli}
export DUEDILIGENCE_HOME=evidence/backends
# At most two model sessions machine-wide while this runs (lib.mjs slots).
export DUEDILIGENCE_MAX_SESSIONS=2
LOG=evidence/backends/queue.log
step() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG"
  "$@" >> "$LOG" 2>&1
  code=$?
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] exit $code" >> "$LOG"
  return $code
}
CORE=$(node -e 'console.log(require("fs").readFileSync("../double-blind-experiment/mutation.jsonl","utf8").trim().split("\n").map(l=>JSON.parse(l).spec).join(" "))')
HE=$(ls ../double-blind-experiment/runs/_evalplus | sed -n 's/^\(he-[0-9]*\)\.json$/\1/p' | tr '\n' ' ')
LADDER="ladder-kestrel-l0 ladder-kestrel-l1 ladder-kestrel-l2 ladder-kestrel-l3 ladder-kestrel-l4"

step node evidence/backends.mjs import "$B"
# 1. The referee on the archive's 57 suite cases (100 rejected runs).
step node bin/referee.mjs --cases ../double-blind-experiment/referee.jsonl --kinds suite --backend "$B" --out "evidence/backends/referee-$B.jsonl" --concurrency 2
[ $? -eq 2 ] && { echo "usage limit: rerun this script after it resets" >> "$LOG"; exit 2; }
# 2. Public and hidden suites for the 26 core specs, calibrated on the archive's references, then mutation.
step node bin/generate.mjs $CORE --concurrency 2
step node evidence/backends.mjs calibrate $CORE
step node evidence/mutation.mjs $CORE --concurrency 1 --max-from ../double-blind-experiment/runs/_mutation
# 3. The kestrel ladder's public suites (the hidden suite is the oracle's).
step node bin/generate.mjs $LADDER --only public --concurrency 2
step node evidence/backends.mjs ladder --json "evidence/backends/ladder-$B.json"
# 4. HumanEval+: suites from the prompt alone, then every released EvalPlus solution judged.
step node bin/generate.mjs $HE --concurrency 2
step node evidence/backends.mjs calibrate $HE
step node evidence/evalplus.mjs --out "evidence/backends/evalplus-$B.json" --concurrency 2
# 5. Condition B on this backend's L0 suite: 20 Haiku agent runs (claude-cli, cents), scored on the oracle.
step node evidence/backends.mjs ladder-b
step node bin/run.mjs ladder-kestrel-l1-b ladder-kestrel-l2-b ladder-kestrel-l3-b ladder-kestrel-l4-b --model haiku --runs 5 --concurrency 2
step node evidence/backends.mjs ladder --runs evidence/backends/runs --json "evidence/backends/ladder-$B.json"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] queue done" >> "$LOG"
