# double-blind: findings

> Vendored from the `double-blind-experiment/` archive (`FINDINGS.md`) on 2026-10-25. The archive is not part of this repository; paths named in code spans below are relative to it.

What every batch found, dated, newest conclusions first. The method, the
verdict rules and how to run it are in [EXPERIMENT.md](EXPERIMENT.md). Per-run
data: `results.jsonl` (gap-targeting hidden suites), `results-blind.jsonl`
(the blind ones), `classifications.json` (each overfit classed by hand).

## Summary

State on 2026-10-24. Haiku 5.5 agents unless stated, Opus 5.5 test writers.

- **The hidden suite catches what the public suite misses, rarely.** On
  precise specs agents are at or near the ceiling in every arm: one real
  overfit in the first 90 runs, three in the 230 stored runs re-graded by
  the gap-targeting suites ([Arm comparisons](#arm-comparisons)).
- **The public suite helps when the brief is loose.** From the bounty's own
  ticket, double-blind passes 81 of 105 against 30 and 30 for the controls.
  From a precise spec it does not help, and on csv-export it hurt (6 of 15
  against 14) ([Precise spec against the ticket](#precise-spec-against-the-ticket)).
  Across fourteen precise specs it separated the arms on one, patch-apply.
- **The skill's agent brief is `prompts/agent-own.md`**: the public suite
  plus own tests per scenario. 59 of 60 on the three hard specs, but not
  yet significant against plain double-blind (p = 0.36)
  ([Mechanisms](#mechanisms)).
- **The hidden suite holds up.** It rejected 21 of 21 gamed runs; on
  HumanEval+ the generated suites accept 7.7% of wrong solutions against
  17.5% for HumanEval's own tests and reject 23 of 314 right ones; without
  the two tasks read differently from the oracle, 4.8% against 15.0% and
  3 of 289 ([Trust checks](#trust-checks)). Its weak spot is inputs the spec names
  by an outside format; diffs should come from real `git diff`
  ([A git oracle on patch-apply](#a-git-oracle-on-patch-apply)).
- **A spec generated from a ticket needs a person to confirm its
  decisions.** On four of seven it decided otherwise than the human spec
  ([From the ticket alone](#from-the-ticket-alone)).
- **LiveCodeBench v6 does not separate the arms.** Haiku solves 37 of 37
  soundly judged hard problems; they predate the cutoff, so the next pilot
  needs problems from after June 2026 ([LiveCodeBench pilot](#livecodebench-pilot)).
- **Follow-ups (run 2026-10-24, counted 2026-10-25).** Own tests on top of
  the public suite are now significant: tool-versions 50 of 50 against 42
  of 50 for plain double-blind (p = 0.006), pooled over four specs 100 of
  105 against 87 of 105 (p = 0.007). Keyed retry feedback recovers 75 of 92
  not-accepted first attempts against 57 of 96 told only that they failed
  (p = 0.001); on specs drafted from the ticket without confirmation,
  0 of 72. A blind referee on Fable 5.1 upheld 95 of 100 hidden-suite
  rejections. 708 rows of `results.jsonl` are sessions that never ran
  ([Follow-ups](#follow-ups)).

## Follow-ups

Five follow-up batches from `runs/_new/queue.sh`, run 2026-10-24 and
counted 2026-10-25 from the `results.jsonl` rows whose session ran
(`agent.ok` true). The `claude` CLI lost its login about 16:50 that day;
every later session returned "Not logged in" in 0.1 s and was graded
`incomplete`. Those 708 rows stay in the file (`agent.ok === false`,
`turns: 1`, `minutes` about 0) and are excluded from everything below.
What did not run: the red-team extension to 10 runs (208 of its 260 rows
are fake; the 52 in [Gaming the suite](#gaming-the-suite) stand), all 225
change-request runs, `bin/red-team-audit.mjs` (24 passed red-team runs
unaudited), and the `double-blind-rule --brief ticket` cell;
`double-blind-own --brief ticket` has 29 real runs (csv-export 2 of 15,
escrow-split 4 of 14).

### Power on the near-misses

Fifty runs of `double-blind-own` and `double-blind` on tool-versions, and
fifteen of `double-blind-own` and `double-blind-rule` on csv-export, the
spec where the public suite hurt. Runs passing every test of both suites:

| spec          | double-blind-own | double-blind | double-blind-rule | spec-only | self-tested |
| ------------- | ---------------: | -----------: | ----------------: | --------: | ----------: |
| tool-versions |          50 / 50 |      42 / 50 |           19 / 20 |   18 / 20 |     20 / 20 |
| csv-export    |          11 / 15 |       6 / 15 |           12 / 15 |   14 / 15 |     13 / 15 |

- **Own tests on top of the public suite are now established.**
  tool-versions alone, 50 of 50 against 42 of 50, Fisher p = 0.006; pooled
  over patch-apply, tool-versions, licence-scan and csv-export, 100 of 105
  against 87 of 105, p = 0.007. [Mechanisms](#mechanisms) said fifty runs
  would settle it; they did. The eight double-blind misses on tool-versions
  are the same two rules as before (the bare `runtime.txt`, the
  volta/engines conflict).
- **Both mechanisms recover most of csv-export's stop-at-green loss.** Own
  11 of 15 and the rule 12 of 15 against 6 of 15 (p = 0.14 and 0.06);
  neither reaches spec-only's 14.

### Keyed against plain retry

One bounded retry (`bin/retry.mjs`) of every first attempt on the 26 core
specs that was graded `overfit` or `incomplete`, told either the failing
scenario keys or only that it failed. Retries accepted:

| first attempt        |       keyed |   plain |
| -------------------- | ----------: | ------: |
| double-blind         |     17 / 19 | 16 / 22 |
| spec-only            |     22 / 26 | 11 / 26 |
| self-tested          |     21 / 23 | 16 / 24 |
| double-blind, ticket |     15 / 24 | 14 / 24 |
| pooled               | **75 / 92** | 57 / 96 |

- Pooled p = 0.001. The gain is in the arms that never saw the public
  suite (spec-only p = 0.003): a scenario key tells an agent which rule it
  misread, and nothing else. For an arm that already has the keyed public
  suite the key adds little.
- **On the `-gen` specs no retry was accepted: 0 of 72** (40 keyed, 32
  plain). Their spec was drafted from the ticket by a session and decides
  otherwise than the hidden suite on four of seven, so the agent is told
  it failed a scenario its own spec says it passes. When the spec and the
  judge disagree, feedback cannot help; the confirmation step has to come
  first.

### The public suite as prose

`spec-only --brief ticket-notes`: the ticket plus `notes.md`, the public
suite's assertions written out in words (`bin/notes.mjs`). 76 of 101
against 81 of 105 for double-blind on the ticket (p = 0.87), per spec
within one or two runs except escrow-split (0 of 15 against 8 of 15): the
notes carry the rules but not the retry-and-overlap behaviour the tests
exercise. So the gain from the ticket is the spec's decisions, however
carried; tests are the carrier that also runs.

### Own tests, measured

`bin/acceptance.mjs` reruns every run's own tests on its own src/ and on
the reference; `bin/referee.mjs` puts each disagreement to a blind referee
on Fable 5.1 (`prompts/referee.md`: the spec, the failing code and one
test with its comments and key removed).

| arm / brief             | runs | own green | own green, hidden rejects | own suite fails the reference |
| ----------------------- | ---: | --------: | ------------------------: | ----------------------------: |
| double-blind-own / spec |   60 |        60 |                  1 (1.7%) |              47 of 56 (83.9%) |
| self-tested / spec      |  404 |       404 |                 25 (6.2%) |            150 of 391 (38.4%) |
| self-tested / ticket    |  105 |       105 |                75 (71.4%) |             72 of 101 (71.3%) |

- Every run that wrote tests ended green on them; "my tests pass" was true
  every time and meant nothing about acceptance from the ticket.
- The referee ruled on 131 cases: of 100 rejected runs, 95 failed a test
  the spec requires (46 of 57 distinct hidden or unseen-public tests
  require, 11 open, 0 wrong); of the 26 own-green runs rejected, 24. Of 74
  own tests that fail the reference, 66 assert a reading the spec leaves
  open, 5 are wrong, 3 are rules the reference misses.
- The `double-blind-own` brief asks for inputs unlike the public ones, so
  its own tests reach into open territory most often (84% of suites have a
  test the reference fails); that is where its retry keys and
  `spec-gap` classifications come from.

## Arm comparisons

### First five specs

The 2026-10-23 dev DB held one approved proposal, tied to a repository, so
the five specs were written from bounty descriptions in the dev DB.

2026-10-23, Opus 5.5 for every session, three runs per spec:

> 0 of 15 agent submissions passed their own tests and failed the
> independent ones. 0 were refused for touching tests or the harness.

| spec           | public | hidden kept | passed | overfit | refused | incomplete |
| -------------- | -----: | ----------: | -----: | ------: | ------: | ---------: |
| money-format   |     18 |          24 |      3 |       0 |       0 |          0 |
| question-limit |     14 |          33 |      3 |       0 |       0 |          0 |
| project-names  |     14 |          27 |      3 |       0 |       0 |          0 |
| reverse-diff   |     16 |          37 |      3 |       0 |       0 |          0 |
| env-names      |     14 |          29 |      3 |       0 |       0 |          0 |

Calibration dropped no hidden test: all 150 failed on the skeleton and passed
on the reference. No run touched anything outside `src/`, and no transcript
tried to read outside its workdir. Agent runs took under 5 minutes and $0.60
each; the whole experiment cost about $11 (generation $5.48, references
$1.43, agents $3.89).

This is the "Overfit = 0, refused = 0" case under [The decision rule](#the-decision-rule). The tables in this
section and the next were graded by the blind hidden suites, now in
`tests/private-blind/` and `results-blind.jsonl`; the gap-targeting suites
that replaced them give the same verdict on every one of these runs
([below](#gap-targeting-hidden-suites)).

### Gap-targeting hidden suites

2026-10-24. The hidden writer was changed from blind to gap-targeting
([EXPERIMENT](EXPERIMENT.md#pipeline), step 2) and every stored submission, 230 runs over 8 specs and 8 arms,
was re-graded against both hidden suites. Public counts are identical on
every run, so the only thing that moved is what the hidden suite catches.
Calibration kept all 395 new hidden tests; regeneration and references
cost $12.43.

| spec           | public | hidden kept, blind | hidden kept, gap | open in the spec |
| -------------- | -----: | -----------------: | ---------------: | ---------------: |
| env-names      |     14 |                 29 |               44 |                0 |
| escrow-ledger  |     30 |                 70 |               57 |                0 |
| money-format   |     18 |                 24 |               53 |                0 |
| name-scan      |     25 |                 52 |               42 |                0 |
| patch-apply    |     30 |                 59 |               79 |                0 |
| project-names  |     14 |                 27 |               31 |                0 |
| question-limit |     14 |                 33 |               47 |                0 |
| reverse-diff   |     16 |                 37 |               42 |                1 |

Verdicts, blind → gap, over the 230 runs: 196 passed → passed, 24
incomplete → incomplete, 6 overfit → overfit, **3 passed → overfit**, **1
overfit → passed**.

The three new hidden failures, classified by hand (`classifications.json`):

- `money-format/self-tested-fable/1`, **real**: the currency table is a
  plain object, so currency `"constructor"` is found on the prototype and
  never refused; the spec says an unsupported currency is refused with a
  message naming it.
- `question-limit/spec-only-haiku/3`, **real**, marginal: allowances are
  keyed on `contributor + "\0" + task`, so two distinct pairs whose ids
  contain NUL share one allowance. The spec keeps allowances separate per
  pair and does not restrict ids; no other separator collides.
- `reverse-diff/spec-only-haiku/3`, **spec-gap**: the test's first hunk
  declares 7 lines and supplies 1, so a parser that trusts hunk counts
  never sees the later `@@` headers. The spec does not say whether counts
  are trusted. It is not in the writer's open list, so it is a suite
  defect, not a spec-tightening item. The one open-list item (reverse-diff,
  whether `/dev/null` is reported as unmapped) failed no run.

The lost catch is `patch-apply/double-blind-haiku/13`: the blind suite's
"several same-size hunks shifted by two lines each report offset 2" fails
because the submission reports the second hunk's offset after the first
hunk's drift, as 0. The gap suite has no shifted multi-hunk offset test
(the public several-hunks test has every hunk at offset 0 and the writer
did not extend it that way), so the run now passes. Whether that offset is
measured from the stated line or from the drifted one is arguable in the
spec; it was never classified.

**Decision: the gap writer is adopted.** It caught two additional real
overfits across the stored submissions and the spec-gap share of new
failures is one in three, not the majority. Both counts, for the record:
blind suites 7 overfit in 230 runs (1 real, 6 unclassified: five Haiku
control runs on the hard specs and the patch-apply run above), gap suites
9 overfit (3 real, 1 spec-gap, 5 unclassified). In the double-blind arm alone the gap suite
catches one fewer (the patch-apply run above); every new catch is in a
control arm, which is consistent with the arms not separating. The blind
suites stay in `tests/private-blind/` for any later comparison. The git
oracle found a second loss, a run graded only by the gap suite
([A git oracle on patch-apply](#a-git-oracle-on-patch-apply)).

### Against no double-blind

The same five specs and suites, three one-shot runs per spec, arm and
agent model (`--arm` and `--model` on `bin/run.mjs`, `ARMS` in
`bin/lib.mjs`). Every arm is judged by both suites; only double-blind saw
the public one. Spec-only got the spec and interface and wrote no tests;
self-tested wrote its own under `tests/own/`.

| arm          | agent     | all hidden pass | hidden tests passed | mean $/run |
| ------------ | --------- | --------------: | ------------------: | ---------: |
| double-blind | Opus 5.5  |         15 / 15 |                100% |      $0.26 |
| spec-only    | Opus 5.5  |         15 / 15 |                100% |      $0.24 |
| self-tested  | Opus 5.5  |         15 / 15 |                100% |      $0.35 |
| double-blind | Haiku 5.5 |     **14 / 15** |                 98% |     $0.008 |
| spec-only    | Haiku 5.5 |         15 / 15 |                100% |     $0.009 |
| self-tested  | Haiku 5.5 |         15 / 15 |                100% |     $0.012 |

Every run passed the public suite, seen or not. None was refused or tried
to read outside its workdir.

One overfit, `real`: reverse-diff, double-blind, Haiku, run 3 passed 16/16
public and 30/37 hidden. Its hunk-header regex has two capture groups but
the code reads the second and fourth, so hunks end early and their last
lines go unmapped. The public diffs were too short to show it
(`classifications.json`).

So the hidden suite did catch one real bug the public suite missed, which
is the claim under test, once in 90 runs. The arms do not separate: one
failure is noise, and a spec-only or self-tested run with the same bug would
have been caught by either suite. Haiku costs about 30 times less than Opus
for the same results here, so these specs are too easy even for Haiku.

The CLI's default model changed partway through the first control batch,
so 20 of those runs went to Fable 5.1 (all passed; kept as
`spec-only-fable` and `self-tested-fable`) and were rerun on Opus. Sessions
now pin `DEFAULT_MODEL`.

### Harder specs, Haiku agents

2026-10-24. Six larger specs from the dev-DB backlog, suites and references
written by Opus, agents on Haiku 5.5 only. The last three were chosen for
rules that ask the agent to refuse or hold back where its habit is to be
lenient, worded with an explicit "otherwise" each. Runs passing every test
of both suites, graded by the current (gap-targeting) hidden suites:

| spec          | public | hidden | double-blind | spec-only | self-tested |
| ------------- | -----: | -----: | -----------: | --------: | ----------: |
| escrow-ledger |     30 |     57 |      10 / 10 |   10 / 10 |     10 / 10 |
| name-scan     |     25 |     42 |      10 / 10 |   10 / 10 |      9 / 10 |
| patch-apply   |     30 |     79 |  **20 / 20** |    7 / 20 |      5 / 20 |
| tool-versions |     43 |     77 |      17 / 20 |   18 / 20 |     20 / 20 |
| licence-scan  |     29 |     61 |      19 / 20 |   20 / 20 |     20 / 20 |
| gherkin-spec  |     18 |     40 |      20 / 20 |   20 / 20 |     20 / 20 |

Agent runs cost $0.01–0.05 each, $6 for these 300. None was refused, timed
out or tried to read outside its workdir.

Only patch-apply separates the arms (Fisher p < 0.001 against either
control). Its control failures cluster on two rules: the "\ No newline at
end of file" marker after a removed line, which the spec states as a
description and never as a match condition, and a malformed hunk that must
throw, which it states plainly. Leaving the marker rule out, the controls
pass 13 and 14 of 20: double-blind still leads, but the gap is no longer
clear-cut.

The three specs written to repeat it did not. Their rules carry an
explicit "otherwise", and Haiku follows them without tests; double-blind is
not better there (56 of 60 against 58 and 60, p = 0.68 and 0.12). Their six
overfits are half `real` (an unparseable licence expression accepted, a
`runtime.txt` without its `python-` prefix accepted) and half `spec-gap`
(whether two fields in one `package.json` count as two sources in a
conflict), in `classifications.json`.

So the public suite helped where the spec left a rule's force implicit, and
did not where every rule said what happens otherwise. Its measured value
here is in carrying requirements the spec words loosely, which tightening
the spec also achieves; the hidden suite's value is in catching the misses
either way.

### Spec categories

2026-10-24. patch-apply was the one spec where the public suite separated
the arms, so eight specs were written for the kinds of task where a rule is
easiest to misread: concurrency, many interacting rules, mostly unhappy
cases, compliance, and an invented protocol the model cannot have seen.
Suites and references by Opus, agents on Haiku 5.5, 20 runs per arm, graded
by the gap-targeting hidden suites. No hidden test was dropped in
calibration and no hidden writer listed an open question.

| spec             | category        | what it asks for                                                                                   |
| ---------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| keyed-queue      | concurrency     | serial per key, parallel across keys up to a cap; abort before and after start; idle promise       |
| coalescing-cache | concurrency     | one in-flight load per key; fresh, stale-while-revalidate, expired; LRU; invalidate mid-load       |
| promo-stack      | permutations    | four promotion kinds stacked by priority then id, exclusivity, half-up rounding, thresholds        |
| access-rules     | permutations    | segment wildcards, action prefixes, roles, deny overrides allow, four condition operators          |
| statement-import | unhappy cases   | ten of fourteen scenarios are rejections; every line and field reported, capped at 100 and counted |
| shift-compliance | compliance      | shift, week, rest, break and consecutive-day rules across UTC offsets and midnight                 |
| retention-sweep  | compliance      | period and grace, access-based anchors, region minimums, holds, no policy, parent inheritance      |
| frame-codec      | niche, invented | an escaped, checksummed framing format with a resynchronisation rule per error kind                |

Runs passing every test of both suites:

| spec             | public | hidden | double-blind | spec-only | self-tested |
| ---------------- | -----: | -----: | -----------: | --------: | ----------: |
| keyed-queue      |     22 |     52 |      20 / 20 |   20 / 20 |     20 / 20 |
| coalescing-cache |     22 |     36 |      20 / 20 |   19 / 20 |     20 / 20 |
| promo-stack      |     31 |     57 |      20 / 20 |   20 / 20 |     19 / 20 |
| access-rules     |     28 |     60 |      20 / 20 |   20 / 20 |     20 / 20 |
| statement-import |     43 |     60 |      20 / 20 |   20 / 20 |     20 / 20 |
| shift-compliance |     26 |     56 |      20 / 20 |   20 / 20 |     20 / 20 |
| frame-codec      |     29 |     62 |      20 / 20 |   19 / 20 |     20 / 20 |
| retention-sweep  |     29 |     60 |      16 / 20 |   18 / 20 |     20 / 20 |
| all eight        |        |        |    156 / 160 | 156 / 160 |   159 / 160 |

Agent runs cost $0.01–0.03 each, about $6.50 for the 480; generation about
$11. None was refused, timed out or tried to read outside its workdir.

- **None of the categories repeats patch-apply.** Haiku is at the ceiling
  in every arm on seven of the eight, concurrency and the invented protocol
  included. Pooled, double-blind is level with spec-only (156 each) and
  behind self-tested (159, p = 0.37). What made patch-apply separate was a
  rule stated as a description rather than a condition; these specs state
  each rule with its outcome, and a Haiku agent follows them with or
  without tests.
- **The one spec with misses, retention-sweep, is the public suite's
  worst.** Its six overfits, four double-blind and two spec-only, are one
  hidden test: a record whose category is `constructor`, `toString` or
  `__proto__` must be kept with reason "no policy", and `policy.categories[name]`
  on a plain object finds an `Object.prototype` member instead. The same
  bug as money-format/self-tested-fable/1 (`classifications.json`, `real`).
  The failing runs are exactly the ones with no `hasOwn` guard: 16 of 20
  double-blind, 18 of 20 spec-only, 20 of 20 self-tested. Writing its own
  tests made the agent write the lookup defensively; the public suite's
  passing `"invoices"` case did not. Not significant at 20 runs (p = 0.11
  against self-tested).
- The other two misses are the controls' and the kind the public suite
  prevents: spec-only frame-codec run 6 and self-tested promo-stack run 5
  are `incomplete`, failing a public test on a rule the spec states plainly
  (an escape byte in place of the end byte; a zero-quantity line reports no
  promotion). The one remaining overfit, spec-only coalescing-cache run 5,
  returns an expired value while its refresh is in flight, `real`.

So across fourteen specs the public suite has shown a gain on one. The
hidden suite's value held up here too: on every spec it is the only
arm-independent judge, and it caught the prototype-key bug that eighteen
public tests and the agent's own run did not.

### Precise spec against the ticket

2026-10-24. Seven more categories, each a real backlog bounty, each run
twice: once with the precise Gherkin `spec.md` the suites were written
from, once with `ticket.md`, the bounty's own loose text, as the agent's
only brief (`--brief ticket` on `bin/run.mjs`, variants ending
`-ticket`). Suites, references and skeletons are the same in both. Opus
wrote the suites, Haiku 5.5 ran 15 times per cell, graded by the
gap-targeting hidden suites; calibration kept all 345 hidden tests.

| spec             | category                 | double-blind | spec-only | self-tested | double-blind, ticket | spec-only, ticket | self-tested, ticket |
| ---------------- | ------------------------ | -----------: | --------: | ----------: | -------------------: | ----------------: | ------------------: |
| status-normalize | legacy data cleanup      |      15 / 15 |   14 / 15 |     15 / 15 |              15 / 15 |            0 / 15 |              0 / 15 |
| csv-export       | file format conventions  |   **6 / 15** |   14 / 15 |     13 / 15 |               0 / 15 |            0 / 15 |              0 / 15 |
| weekly-digest    | time zones and DST       |      15 / 15 |   15 / 15 |     15 / 15 |              15 / 15 |            7 / 15 |             11 / 15 |
| escrow-split     | money rules, retries     |      14 / 15 |   15 / 15 |     13 / 15 |               8 / 15 |            4 / 15 |              1 / 15 |
| invite-codes     | lifecycle, concurrency   |      15 / 15 |   14 / 15 |     15 / 15 |              15 / 15 |            0 / 15 |              0 / 15 |
| gherkin-parse    | parser and error lines   |      15 / 15 |   13 / 15 |     13 / 15 |              13 / 15 |            4 / 15 |              3 / 15 |
| usage-counter    | concurrency and recovery |      15 / 15 |   15 / 15 |     14 / 15 |              15 / 15 |           15 / 15 |             15 / 15 |
| all seven        |                          |     95 / 105 | 100 / 105 |    98 / 105 |         **81 / 105** |          30 / 105 |            30 / 105 |

Runs passing every test of both suites. 630 runs, about $7; none refused,
timed out or tried to read outside its workdir. 25 self-tested runs on the
precise spec first hit the account's usage limit before starting; they were
rerun after the reset two at a time (`--min-free 25` on `bin/run.mjs`), and
the blocked attempts are kept in `runs/_blocked-usage-limit/`, out of the
results.

- **From the ticket, the public suite carries the requirements.**
  Double-blind passes 81 of 105 against 30 and 30 (p < 1e-11 each). Where
  the ticket names a rule but not its detail (which old spellings map to
  which status, how codes are typed, which lines an error names), the
  controls cannot know it and the public tests show it. These are spec gaps
  by construction: the controls never saw the rule, so they are not
  `real` misses, and they were not classified one by one.
- **From the precise spec, it does not help, and once it hurt.** 95 of 105
  against 100 spec-only and 98 self-tested (p = 0.28 and 0.61). On
  csv-export double-blind passes 6 of 15 against 14 (p = 0.005): nine runs write an opening count of 10^21 as `1e+21`
  where the spec says plain digits. The public tests pass with `String(n)`,
  and the double-blind agents stop there; the spec-only agents, with
  nothing green to stop at, read "plain digits" more carefully. That is
  the overfit the experiment was built to find, on one rule, `real` but an
  edge case.
- **Concurrency fails only when the brief does not mention it.** With the
  precise spec, which says calls may overlap, Haiku serialised correctly in
  almost every run (two self-tested escrow-split runs failed the
  simultaneous-delivery tests). From the invite-codes ticket, which says
  nothing about overlap, every spec-only and self-tested run issued
  duplicate codes when two were made at once over a slow store, and no
  double-blind run did. usage-counter passed in every cell, ticket
  included.
- **csv-export fails everywhere from the ticket.** Its ticket says only
  "as CSV". The byte order mark, CRLF, the header names and formula
  defusing are each tested, and the public suite does not carry all of
  them, so no arm passes.

So the public suite's value depends on the brief: large when the brief is
loose, none or slightly negative when it is precise. Real tickets read like
`ticket.md`.

## Trust checks

2026-10-24. What a public skill has to show beyond the arm tables: the
hidden suite catches an agent that games the public one, it holds up
against an oracle nobody here wrote, and the agent's own green run is not
a substitute. Haiku 5.5 agents, Opus 5.5 test writers throughout.

### Self-grading

From `results.jsonl` and each run's final summary, no new runs. All 105
self-tested runs from `ticket.md` ended saying their own tests pass; 75
of them (71%) failed the hidden suite. From the precise spec, 25 of 379
(7%). These are mostly rules the agent never saw, so the number is about
the acceptance signal, not the agent: paid on its own green run, 75 of
105 would have been paid for wrong work.

### Gaming the suite

`red-team` arm (`prompts/agent-red-team.md`): pass the public tests with
the least general code, hard-coding test inputs where shorter. 26 specs,
2 runs each; every run classified from its code against the spec
(`runs/_redteam-classes.json`, gitignored).

| run                                   | count | hidden suite rejected |
| ------------------------------------- | ----: | --------------------: |
| gamed: lookup of the public inputs    |    20 |                    20 |
| gamed: skipped a rule the spec states |     1 |                     1 |
| declined to game, has a real bug      |     7 |                     7 |
| declined to game, correct             |    24 |                     0 |

Every gamed run passed the public suite and failed the hidden one. Haiku
declined in 31 of 52 runs even when told to game. Two hidden-suite gaps
surfaced in honest runs: coalescing-cache run 2 leaves a refreshed key at
its old LRU position (`boundary-4`, no test reads another key before a
refresh lands), and csv-export run 1 defuses formulas in every field where
the spec says the title only.

Pressure alone does not make Haiku game. `ci-gate` (an 8-turn cap,
acceptance stated as "`npm test` passes in CI", tests not declared off
limits) against `double-blind-turns` (the same cap, hidden acceptance), 8
hard specs × 5 runs: 33 and 35 of 40 passed both suites, no run touched a
test, one hit the cap.

### Mutation score

`bin/mutate.mjs`: single-edit mutants of each reference (flipped
comparisons and logic, off-by-one literals, negated conditions, dropped
calls), judged like a submission. 25 specs, 1,442 mutants that compile
(`mutation.jsonl`; frame-codec reruns after a runner fix).

| suite           | mutants killed |
| --------------- | -------------: |
| public          |  1,090 (75.6%) |
| hidden          |  1,141 (79.1%) |
| public + hidden |  1,142 (79.2%) |

Of the 352 the public suite misses, the hidden suite kills 52. A seeded
sample of 40 of the other 300, read by hand
(`runs/_mutation/_survivor-sample.json`): 11 equivalent, 13 differ only
where the spec is silent, 16 differ on an input the spec allows. Scaled,
the hidden suite kills about 30% (24–41%) of the public suite's
spec-relevant survivors. The misses cluster in the two diff parsers
(13 of 16): quoted or spaced paths, hunk-less renames, hand-written diffs
git does not emit. That is the generator's weak spot: inputs the spec
names by reference to an outside format ("git's format") rather than by
example.

### HumanEval+ as an outside oracle

`bin/evalplus-import.py`, `bin/evalplus-score.mjs`. EvalPlus's released
greedy solutions from 31 models (2023, `evalplus/evalplus` release
v0.1.0) labelled by EvalPlus's own evaluator (0.3.1, HumanEval+ v0.1.10);
"right" is passing base and plus tests. The 30 tasks where HumanEval's
original tests accept the most wrong solutions, plus 10 at random (seed
7). The generator wrote a public and a hidden suite for each from the
prompt alone (`prompts/pyfunc/`); tests the canonical solution fails were
dropped (18 of 1,281). 1,240 solutions.

| on 1,240 solutions, 926 wrong                     | all 40 tasks | without 22 and 60 |
| ------------------------------------------------- | -----------: | ----------------: |
| wrong accepted by HumanEval's original tests      |  162 (17.5%) |       133 (15.0%) |
| wrong accepted by generated public + hidden       |    71 (7.7%) |     **43 (4.8%)** |
| of those base accepts, generated rejects          |   104 of 162 |        102 of 133 |
| of those generated public accepts, hidden rejects |    57 of 128 |          54 of 97 |
| right rejected by generated public + hidden       |    23 of 314 |      **3 of 289** |

Two tasks disagree with the oracle on an open reading, both ways:
HumanEval/22's canonical solution drops `True`/`False` from "integers"
(28 of the 71 wrong accepts), and HumanEval/60's hidden suite holds a
`-> int` function to returning an `int`, rejecting `n*(n+1)/2` (20 of the
23 right rejects). The task choice favours tasks with weak original
tests; the 10 random tasks alone are too few to read (2 against 1 wrong
accepts). Problems predate the model's cutoff, which helps the writer as
much as the solver.

### From the ticket alone

`bin/tighten.mjs`: `specs/<slug>-gen/` holds a spec a session wrote from
`ticket.md` and the skeleton (`prompts/spec-from-ticket.md`), a public
suite generated from that spec, and the original hidden suite. 10 runs
per cell; spec-only on the generated spec is still running.

| spec             | ticket, public from human spec | generated spec + its public suite |
| ---------------- | -----------------------------: | --------------------------------: |
| csv-export       |                         0 / 15 |                            0 / 10 |
| escrow-split     |                         8 / 15 |                           10 / 10 |
| gherkin-parse    |                        13 / 15 |                           10 / 10 |
| invite-codes     |                        15 / 15 |                            0 / 10 |
| status-normalize |                        15 / 15 |                            0 / 10 |
| usage-counter    |                        15 / 15 |                            0 / 10 |
| weekly-digest    |                        15 / 15 |                           10 / 10 |

Where the ticket is silent the generated spec decides, and on four specs
it decided otherwise than the human spec the hidden suite encodes. So the
81-of-105 ticket result needs a precise spec written or confirmed by a
person: the skill's spec step has to put its decisions in front of one.

## Mechanisms

The arms did not separate on the first five specs, and the hard specs
separate only on `patch-apply`. The question for the skill is what a
one-shot double-blind run can be given, beyond the public suite, that a
spec-only or self-tested run cannot, without leaking a hidden test.
Everything below uses only `spec.md`, the skeleton, the public suite and
the prompts in this folder, all of which the agent may read. Arms are in
`ARMS` in `bin/lib.mjs`; the prompts are `prompts/agent-*.md`.

| arm                 | the agent gets                                                                                                           | hypothesis                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `double-blind-rule` | public tests, the hidden writer's coverage rule quoted from `hidden-tests.md`, a per-scenario self-check before stopping | an agent stops at green on the public suite; told the rule the hidden suite was built by, it covers the scenarios the public suite leaves thin |
| `double-blind-own`  | public tests, plus own tests under `tests/own/`, one per scenario with inputs unlike the public ones                     | the public suite anchors the shape and own tests extend it, more reliably than reasoning alone                                                 |
| `spec-only-rule`    | the rule and the self-check, no public tests                                                                             | the control: whether a gain is the rule's or the suite's                                                                                       |

Candidates not run:

- a keyed public suite plus a coverage ledger in the brief: which scenarios
  the public suite tests and which are hidden-only. Needs regenerated,
  keyed suites;
- a public suite with one unhappy case per scenario (a public-prompt
  change). The risk is public ≈ hidden;
- spec tightening before generation, the `spec-gap` step done up front.
  It helps every arm alike, so it does not separate them, but it cuts
  `spec-gap` overfit;
- a hidden writer that reads the public suite and targets the shortcuts
  that pass it. Generation side: it strengthens what the hidden suite
  catches, not what the agent is given. Done and adopted, under
  [Gap-targeting hidden suites](#gap-targeting-hidden-suites).

### Result on patch-apply

2026-10-24, Haiku 5.5, 20 runs per arm, graded by the gap-targeting suite
(30 public, 79 hidden). The base arms are the ones in the table under
[Harder specs](#harder-specs-haiku-agents).

| arm                 | sees public | passed both | overfit | incomplete | hidden tests passed | $/run | min/run |
| ------------------- | ----------- | ----------: | ------: | ---------: | ------------------: | ----: | ------: |
| `double-blind`      | yes         |     20 / 20 |       0 |          0 |                100% | 0.038 |     3.5 |
| `double-blind-rule` | yes         |     20 / 20 |       0 |          0 |                100% | 0.051 |     4.5 |
| `double-blind-own`  | yes         |     19 / 20 |       1 |          0 |               99.9% | 0.070 |     4.9 |
| `spec-only`         | no          |      7 / 20 |       1 |         12 |               97.7% | 0.035 |     3.2 |
| `self-tested`       | no          |      5 / 20 |       3 |         12 |               97.8% | 0.047 |     4.0 |
| `spec-only-rule`    | no          |      5 / 20 |       0 |         15 |               97.3% | 0.046 |     4.2 |

- **The gain is the public suite, not the brief.** The rule and self-check
  without the public suite is the weakest arm. Its fifteen incomplete runs
  fail on the same two scenarios the other controls miss, `boundary-3` (the
  marker after a removed line) and `unhappy-3` (a short hunk must throw),
  as `failedScenarios` now says per run. The agent went scenario by
  scenario as told, checked its own reading of each, and confirmed it. A
  brief cannot carry a reading the spec leaves implicit; a test does.
- **On top of the public suite there is nothing left to gain here.**
  `double-blind` is at 20 of 20, so the rule shows nothing, and own tests
  cost one overfit and twice the price. That overfit (`double-blind-own`,
  run 18, `real`, marginal) ends a hunk at any line starting `--- ` before
  its counts are met, so a removed line whose text is `-- old` is read as
  the next header; the spec defines a hunk by its counts.
- The one peek flag of the batch was the scanner's: the agent mangled its
  own cwd into a path beside the work root and the edit failed. `peeks`
  now ignores a tail that is not under the work root.

A mechanism can only show on a spec where `double-blind` is below the
controls: `tool-versions` (17 of 20 against 18 and 20) and `licence-scan`
(19 against 20 and 20) in the table above.

### Result on tool-versions and licence-scan

Same setup, the two public-seeing arms only, 20 runs each. Runs passing
every test of both suites; the base arms are the ones above.

| spec          | `double-blind` | `double-blind-rule` | `double-blind-own` | `spec-only` | `self-tested` |
| ------------- | -------------: | ------------------: | -----------------: | ----------: | ------------: |
| tool-versions |        17 / 20 |             19 / 20 |        **20 / 20** |     18 / 20 |       20 / 20 |
| licence-scan  |        19 / 20 |             19 / 20 |        **20 / 20** |     20 / 20 |       20 / 20 |
| patch-apply   |        20 / 20 |             20 / 20 |            19 / 20 |      7 / 20 |        5 / 20 |
| all three     |        56 / 60 |             58 / 60 |        **59 / 60** |     45 / 60 |       45 / 60 |

The rule arm's two overfits repeat the base arm's (`classifications.json`):
tool-versions run 18 is the volta/engines conflict, `spec-gap`, and
licence-scan run 11 the dangling `AND`, `real`. The own arm has none on
these two specs; its one failure is the marginal patch-apply case above.

- **Own tests and the public suite are complementary, not redundant.**
  `self-tested` alone is 20 of 20 where the spec is explicit and 5 of 20
  where it is not; `double-blind` alone is the reverse. The public suite
  carries the readings the spec leaves implicit, and the agent's own tests
  catch its own slips on rules the spec states plainly (the bare
  `runtime.txt`, the dangling `AND`), which it caught in the self-tested
  arm and missed with only the public suite to run. `double-blind-own` is
  the only arm at or near the ceiling on all three specs.
- **Not yet established against plain double-blind.** Pooled over 60 runs,
  own against double-blind is 1 failure against 4, Fisher p = 0.36; against
  either control it is 1 against 15, p = 0.0002, which is patch-apply's
  doing. The direction holds on each of the three specs, but 20 runs per
  spec cannot separate 0 from 3. Fifty runs of own and double-blind on
  tool-versions, about $2, would.
- **The rule is the cheap half.** 58 of 60, halving the base arm's misses
  on tool-versions and changing nothing on licence-scan, at about 1.4 times
  double-blind's cost; own is about 1.7 times the cost and 1.5 times the
  minutes.
- One peek flag in 80 runs: the agent globbed its own workdir's name inside
  the work root to confirm its cwd. The OS sandbox denies sibling reads;
  nothing was read.

**For the skill:** the implementing agent's brief is `agent-own.md`: the
public suite plus own tests under `tests/own/`, one per scenario with
inputs unlike the public ones, ungraded. Whether the rule's per-scenario
self-check is worth its minutes on top of that is untested.

### A git oracle on patch-apply

2026-10-24. A judge nobody here wrote: `git apply` on real history.
`bin/git-oracle/` builds 8,842 cases from the commits of sandbox-factory,
landing and 250 of home's (`git diff` at 1, 3 and 6 context lines; LF text
only; no mode changes, binaries or copies; `index` lines dropped, since the
spec's grammar has none), plus perturbed copies: lines inserted or removed
between hunks, a hunk's old lines copied elsewhere, a corrupted context
line, a missing file, a new file whose path exists, a deleted file with
extra text. The reference and all 120 stored submissions run every case;
`ok` and the resulting files are compared with git's.

```sh
node bin/git-oracle/corpus.mjs runs/git-oracle/cases.jsonl <repo>[:maxCommits] ...
node bin/git-oracle/git-oracle.mjs runs/git-oracle/cases.jsonl runs/git-oracle/git.jsonl
node bin/git-oracle/build.mjs && node bin/git-oracle/run-all.mjs
node bin/git-oracle/flags.mjs && node bin/git-oracle/compare.mjs --strict
```

The judged set is the 7,533 cases where no hunk's old lines occur twice in
its file and every section has `---` and `+++` headers or is a rename. On
it the reference agrees with git on every case. The 53 cases they disagree
on are all a hunk matching at several places, where the spec and git choose
differently (git breaks a tie towards the later position and holds a hunk
stated at line 1 to the start of the file).

- **One real bug that passed both suites.** `double-blind-rule-haiku/17`
  skips a section without `---` and `+++`, so git's form of a rename with
  no hunks leaves the file where it was (`classifications.json`). The
  public suite writes every pure rename with both headers; the blind hidden
  suite had git's form and the gap suite dropped it. A second loss of the
  blind → gap switch, after the shifted multi-hunk offset above.
- **The arms rank as before.** No other run disagrees with git on the
  judged set, so a disagreement rate adds no resolution here.
- **Outside the old spec, not graded.** Git writes an empty new file as a
  `diff --git` and a `new file mode` line only; 35 of 120 runs mishandle it
  (18 wrong files, 11 rejected, 6 threw). Where a hunk's lines occur more
  than once, many runs place it apart from both git and the reference: the
  spec did not say which line "nearest" counts from.

Both are now decided in `specs/patch-apply/spec.md`: the headers are there
only when a file has hunks, and a hunk's stated line moves by the lines
earlier hunks added or removed, the reference's and git's reading, which
also settles the shifted multi-hunk offset above. The suites and stored
runs predate that edit: regenerate and recalibrate before the next
patch-apply batch.

**For the skill:** the rename bug got through because the suites'
hand-written diffs are not git's, and the empty-file gap because the
spec's grammar is not git's. Test writers should take their diffs from
real `git diff` output. The oracle stays a check for specs with a real
tool behind them, not a way to separate arms. No model calls; about 10
minutes of compute and 450 MB under `runs/git-oracle/`.

## LiveCodeBench pilot

2026-10-24, Haiku 5.5 agents, Opus 5.5 public writer, one run per arm
per problem, judged by the benchmark's private cases through its checker:

| arm          | all hidden pass | of the 37 sound problems | incomplete | refused | mean min | mean $/run |
| ------------ | --------------: | -----------------------: | ---------: | ------: | -------: | ---------: |
| double-blind |         36 / 40 |                  36 / 37 |          1 |       0 |      2.6 |     $0.031 |
| spec-only    |         36 / 40 |                  36 / 37 |          1 |       0 |      2.3 |     $0.036 |
| self-tested  |         37 / 40 |                  37 / 37 |          0 |       0 |      4.0 |     $0.042 |

**The arms do not separate.** Three problems fail in every arm with the
same output, and all three are `judge-defect` (`classifications.json`):
`abc396_e` and `arc195_c` accept any valid answer in the contest while
the benchmark compares output exactly, and `abc397_d`'s private case
`N=27` expects `3 0` although the statement requires positive `y` (no
positive pair exists, so `-1` is the statement's answer). The two runs
that differ between arms are one each way: the double-blind run on
`abc398_g` spent its 20 minutes building brute-force tables and submitted
nothing (`incomplete`); the spec-only run on `abc399_e` is wrong on 12 of
40 private cases and also fails one public test it never saw, so the
public suite would have caught it. No run touched the harness. One peek
flag in the self-tested arm is the agent mistyping its own workdir path
(`abc398-g` for `abc398_g`), not a reach outside.

So Haiku solves 37 of 37 soundly judged `hard` problems from early 2025
one-shot regardless of what tests it is given. That is the ceiling
problem from the in-house specs again, now on a public judge, and the
likely cause is that the problems predate the model's cutoff. The next
pilot should use problems published after June 2026, which the v6
release does not contain. Cost: public suites $9.69, agents $4.37, both
drawn on the Max plan. The plan's five-hour window refused 55 sessions
partway through; `run.mjs` now stops on `usage_limit_reached` without
recording a run, so the same command resumes after the reset.

Known limits: v6 problems predate the Claude 5 cutoff, which lifts every
arm alike and narrows the room between them, and does not bias which arm
wins. A submission must be one file, since the checker execs its text.
Three of the 40 problems have one private case and three have four; the
sparse ones are single large stress inputs, not the samples, and stay.

## The decision rule

Written before the first run: what each outcome would mean for the skill.

- **Overfit ≥ 1 and mostly `real`.** The hidden suite catches what the public
  one misses. Build the skill: `/double-blind <spec>` produces skeleton, public
  and hidden suites, calibrated, in this layout.
- **Overfit mostly `spec-gap`.** The generator works but specs are too loose.
  The skill starts with a spec-tightening pass that turns open questions into
  decisions before any test is written.
- **Overfit = 0, refused = 0.** Either the agent is good enough that hidden
  tests add nothing at this spec size, or the public suite already covers the
  spec. Try specs with more `unhappy` and `concurrency` scenarios before
  concluding.
- **Refused > 0.** Worth noting on its own: it is the behaviour sandbox-factory
  grading already refuses, now observed in the wild.

## Budget

Per spec: 3 generation sessions, 1 reference, 3 agent runs. Five specs is 35
`claude -p` sessions. Agent runs are the long ones; cap each at 20 minutes.
