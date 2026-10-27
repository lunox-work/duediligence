#!/bin/zsh
# The spec ladder on LiveCodeBench v6 hard (ladder/README.md,
# "LiveCodeBench"), one step after another and resumable: every step
# skips work whose output exists. A run step that stops on the usage limit
# exits 2 and is rerun after 20 minutes; a generation step that fails is
# retried the same way, since a refused session is its likeliest cause.
cd "${0:A:h}/.."
LOG=ladder/run-lcb.log
say() { print -r -- "[$(date +%H:%M:%S)] $*" | tee -a $LOG; }
step() {
  local tries=0
  say "START $*"
  while true; do
    node "$@" >>ladder/steps-lcb.log 2>&1
    code=$?
    [[ $code -eq 0 ]] && break
    [[ $code -eq 2 || ( $1 == bin/generate.mjs && $tries -lt 6 ) ]] || break
    (( tries++ ))
    say "exit $code; waiting 20 min: $*"
    sleep 1200
  done
  say "END ($code) $*"
  return $code
}
levels() { local t n; for t in $TASKS; do for n in "$@"; do print ladder-$t-l$n; done; done }
bslugs() { local t n; for t in $TASKS; do for n in 1 2 3 4; do print ladder-$t-l$n-b; done; done }
RUN=(--model haiku --concurrency 2 --min-free 30)

# One heavy job at a time: the kestrel pilot's sessions started before the
# session cap in bin/lib.mjs and are not counted by it.
while pgrep -f "ladder/run.sh" >/dev/null; do say "kestrel pilot still running; waiting"; sleep 300; done

# Judge defects of the LiveCodeBench pilot (classifications.json): left out.
step bin/ladder/lcb-levels.mjs --exclude abc396_e,arc195_c,abc397_d || exit 1
TASKS=($(ls ladder/tasks | grep '^lcb_'))
say "${#TASKS} problems"

# The gate first, so no public suite is written for a problem it drops.
step bin/generate.mjs $(levels 4) --concurrency 2 || exit 1
step bin/calibrate.mjs $(levels 0 4) || exit 1
step bin/run.mjs $(levels 4) --arm spec-only --runs 1 $RUN
step bin/ladder/score.mjs
TASKS=($(node bin/ladder/report.mjs --gate-each lcb_ 2>>$LOG))
say "kept ${#TASKS}: $TASKS"
(( ${#TASKS} )) || exit 0

step bin/generate.mjs $(levels 1 2 3) --concurrency 2 || exit 1
step bin/calibrate.mjs $(levels 1 2 3) || exit 1
step bin/ladder/derive-b.mjs $TASKS || exit 1
step bin/calibrate.mjs $(bslugs) || exit 1

for arm in spec-only double-blind; do step bin/run.mjs $(levels 0 1 2 3 4) --arm $arm --runs 1 $RUN; done
step bin/run.mjs $(bslugs) --arm double-blind --runs 1 $RUN
step bin/ladder/score.mjs
node bin/ladder/report.mjs --pool lcb_ | tee -a $LOG
say "ALL DONE"
