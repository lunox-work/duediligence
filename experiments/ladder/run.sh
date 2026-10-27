#!/bin/zsh
# The spec-ladder pilot (ladder/README.md), one step after another. A step
# that stops on the account's usage limit exits 2 and is rerun after 20
# minutes; every step skips work whose output exists, so rerunning this
# whole file resumes it.
cd "${0:A:h}/.."
LOG=ladder/run.log
say() { print -r -- "[$(date +%H:%M:%S)] $*" | tee -a $LOG; }
step() {
  say "START $*"
  while true; do
    node "$@" >>ladder/steps.log 2>&1
    code=$?
    [[ $code -eq 2 ]] || break
    say "usage limit; waiting 20 min: $*"
    sleep 1200
  done
  say "END ($code) $*"
  return $code
}

TASKS=(gitignore kestrel)
RUN=(--model haiku --concurrency 2 --min-free 30)
slugs() { local t n; for t in "$@"; do for n in 0 1 2 3 4; do print ladder-$t-l$n; done; done }
bslugs() { local t n; for t in "$@"; do for n in 1 2 3 4; do print ladder-$t-l$n-b; done; done }
A=($(slugs $TASKS)); B=($(bslugs $TASKS))

step bin/ladder/build.mjs $TASKS || exit 1
step bin/generate.mjs $A || exit 1
step bin/calibrate.mjs $A || exit 1
step bin/ladder/derive-b.mjs $TASKS || exit 1
step bin/calibrate.mjs $B || exit 1

# The gate: a task spec-only solves from its name alone measures what the
# model remembers, not what the spec says.
step bin/run.mjs ${(M)A:#*-l4} --arm spec-only --runs 3 $RUN
step bin/ladder/score.mjs
KEPT=()
for t in $TASKS; do
  node bin/ladder/report.mjs $t --gate | tee -a $LOG
  [[ ${pipestatus[1]} -eq 0 ]] && KEPT+=$t
done
say "tasks kept: $KEPT"
(( ${#KEPT} )) || exit 0
AK=($(slugs $KEPT)); BK=($(bslugs $KEPT))

for arm in spec-only self-tested double-blind double-blind-own; do
  step bin/run.mjs $AK --arm $arm --runs 5 $RUN
done
for arm in double-blind double-blind-own; do
  step bin/run.mjs $BK --arm $arm --runs 5 $RUN
done
step bin/ladder/score.mjs
node bin/ladder/report.mjs $KEPT | tee -a $LOG
say "ALL DONE"
