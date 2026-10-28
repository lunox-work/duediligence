#!/bin/sh
# Phase 6's model steps, resumable (the weekly limit stopped the hidden writer
# on 2026-10-27; it resets 2026-10-29 18:00 SGT). Run from the package root:
#   sh evidence/seams/queue.sh
# prepare.mjs keeps the skeleton and public suite already written and starts
# the hidden writer and the reference; run.mjs adds one Haiku run each time
# until one exists; seams.mjs http judges the 501 stub and records it all in
# evidence/seams.json. Logs in evidence/seams/logs/.
set -e
cd "$(dirname "$0")/../.."
export DUEDILIGENCE_HOME=evidence/seams
SLUG=csv-export-http
# --accept-open: the hidden writer listed one open question (whether an error
# body may hold keys beyond error and id; the public suite requires exactly
# those), left open by the phase's agent standing in for the person.
node bin/prepare.mjs "$SLUG" --accept-open >> evidence/seams/logs/prepare-$SLUG.log 2>&1
if [ ! -f "evidence/seams/runs/$SLUG/haiku/1/run.json" ]; then
  node bin/run.mjs "$SLUG" --model haiku --runs 1 >> evidence/seams/logs/run-$SLUG.log 2>&1
fi
node bin/grade.mjs "$SLUG" >> evidence/seams/logs/run-$SLUG.log 2>&1
node evidence/seams.mjs http "$SLUG"
