#!/bin/sh
# Phase 7's model steps, resumable (RESULTS.md "Go and Rust", "Commands and
# services in other languages"). Run from the package root:
#   sh evidence/languages/queue.sh [modules|seams]
# modules: duration-parse ported to Go and Rust (confirmed by the phase's
# agent, not a person), prepared on Opus, three Haiku blind runs each.
# seams: the language ports of csv-export-http and patch-apply-cli, each a
# reference session and calibration (calibrate.mjs), three Haiku runs each.
# Then grade, and evidence/languages.mjs report. Logs in evidence/languages/logs/.
set -e
cd "$(dirname "$0")/../.."
export DUEDILIGENCE_HOME=evidence/languages
export DUEDILIGENCE_MAX_SESSIONS=2
export DUEDILIGENCE_MIN_FREE=40
LOGS=evidence/languages/logs
runs() {
  if [ ! -f "evidence/languages/runs/$1/haiku/3/run.json" ]; then
    node bin/run.mjs "$1" --model haiku --runs 3 --concurrency 2 >> "$LOGS/run-$1.log" 2>&1
  fi
}
case "${1:-modules}" in
  modules)
    for SLUG in duration-parse-go duration-parse-rs; do
      node bin/prepare.mjs "$SLUG" >> "$LOGS/prepare-$SLUG.log" 2>&1
      runs "$SLUG"
    done
    ;;
  seams)
    for SLUG in $(node evidence/languages.mjs ports); do
      [ -f "evidence/languages/specs/$SLUG/calibration.json" ] ||
        node bin/calibrate.mjs "$SLUG" >> "$LOGS/calibrate-$SLUG.log" 2>&1
      runs "$SLUG"
    done
    ;;
esac
node bin/grade.mjs >> "$LOGS/grade.log" 2>&1
node evidence/languages.mjs report
