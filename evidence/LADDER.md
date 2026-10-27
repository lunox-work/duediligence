# Spec ladder

> Vendored from the `double-blind-experiment/` archive (`ladder/README.md`) on 2026-10-25. The archive is not part of this repository; paths named in code spans below are relative to it.

Does a public suite let an agent recover what a vaguer spec leaves out?
Each task has one precise spec, L0, and four vaguer ones, L1 to L4, each
removing what `rules.json` says. Every level is judged by the same oracle
cases, never by a model-written suite, and each case is tagged with the
rule it exercises.

Written 2026-10-24, before any agent run. The pilot is descriptive; see
[Analysis](#analysis).

## Tasks

| task        | interface                    | oracle                                             | cases |
| ----------- | ---------------------------- | -------------------------------------------------- | ----: |
| `gitignore` | `isIgnored(gitignore, path)` | `git ls-files -o -i --exclude-standard` (git 2.54) |   458 |
| `kestrel`   | `satisfies(version, range)`  | `tasks/kestrel/reference.mjs`, an invented scheme  |   396 |

`tasks/<task>/` holds `L0.md`–`L4.md`, `rules.json` (each rule's status per
level: full, rule, partial or absent), `skeleton.ts` (the same at every
level), `task.mjs` (the seeded case generator and the oracle call),
`reference.mjs` and `cases.json`.

**Oracle checks.**

- **gitignore:** `bin/ladder/build.mjs` requires `reference.mjs`, written
  from L0, to agree with git on every case, so L0 states what git does.
  Every example in L0 was also checked against git.
- **kestrel:** nothing outside defines it, so the reference is the oracle.
  The cross-check comes from the L0 control runs: a case that 60% or more
  of them answer differently is reviewed by hand before results are read
  (`report.mjs --check`).

## Design

| condition | agent reads | public suite written from |
| --------- | ----------- | ------------------------- |
| A         | L*n*        | L*n*                      |
| B         | L*n*        | L0                        |

- **Arms** (prompts as in the experiment): `spec-only`, `self-tested`,
  `double-blind`, `double-blind-own`. Only arms that see the public suite
  differ between A and B, so B runs only those two.
- **Agent:** Haiku 5.5, 5 runs per cell. **Test writer:** Opus 5.5, one
  public suite per level. **Hidden suite:** the oracle's cases.
- **Gate:** 3 spec-only runs at L4 first. A task scoring 95% or more there
  is dropped, since it measures what the model remembers.

Specs live in `specs/ladder-<task>-l<n>/` (condition A) and
`specs/ladder-<task>-l<n>-b/` (condition B), runs in `runs/` as usual.

## Analysis

Fixed before the first run:

- **Score:** per run, the share of oracle cases matched per rule,
  averaged over rules (each rule weighs the same). A refused run scores 0.
- **Primary comparison:** `double-blind` against `spec-only` at each
  level, condition A. **Secondary:** condition B against A for
  `double-blind`; `double-blind-own` against both; per rule, by status.
- **Reading:** two tasks cannot support a test across tasks, so the pilot
  reports means and per-rule tables only. A gap is worth a confirmatory
  run when it has the same sign on both tasks and is at least 5 points at
  two or more levels. The confirmatory run fixes its own tasks and test
  (a signed-rank test across tasks) before it starts.

## Known before the runs

The public suites are used as generated, never filtered by the oracle,
which would leak it. How many public tests the oracle passes:

| level | gitignore | kestrel |
| ----- | --------: | ------: |
| L0    |     44/44 |   73/74 |
| L1    |     38/38 |   31/32 |
| L2    |     12/12 |   22/23 |
| L3    |     10/10 |   14/14 |
| L4    |     19/19 |     1/1 |

- kestrel L0 and L1: the writer expects `3.2.1:rc1` not to satisfy
  `<3.2.1`, against R2 (a tagged version is below the same untagged one).
  A writer's misreading of a stated rule, carried to every double-blind
  run at those levels and to condition B.
- kestrel L2: the writer reads `^0.2.3` as spanning major 0, as L2 says;
  L2 leaves out R5's major-0 exception. This is condition A's mechanism:
  a vague spec's guess, locked in by a test.
- gitignore agrees with git at every level, L4 included: the writer knows
  gitignore, which the gate checks for the agent too.

Public suites cost $4.16 (Opus 5.5).

## Results: kestrel pilot

2026-10-24, 140 runs, none refused, timed out or reaching outside its
workdir. `gitignore` was dropped by the gate (spec-only 100% at L4, 3 of
3). No kestrel case was disputed by the L0 controls (`--check`).

| level | spec-only | self-tested | double-blind A | double-blind-own A | double-blind B | double-blind-own B |
| ----- | --------: | ----------: | -------------: | -----------------: | -------------: | -----------------: |
| L0    |     100.0 |       100.0 |          100.0 |              100.0 |          100.0 |              100.0 |
| L1    |     100.0 |       100.0 |          100.0 |              100.0 |          100.0 |              100.0 |
| L2    |      56.3 |        56.8 |           52.3 |               52.1 |          100.0 |              100.0 |
| L3    |      59.2 |        59.0 |           42.7 |               47.7 |          100.0 |              100.0 |
| L4    |      45.8 |        47.2 |           37.3 |               37.2 |          100.0 |              100.0 |

Macro oracle match, %, 5 runs per cell.

- **A: a suite written from the vague spec hurts.** double-blind trails
  spec-only by 4, 17 and 9 points at L2–L4. The loss is in the rules the
  writer guessed wrong and the agent then followed: R7 at L2 (28% against
  60%), R6 at L3 (0% against 26%).
- **B: a suite written from the full spec carries all of it.** 100% at
  every level, L4's ten words included, while spec-only falls to 46%.
  The L0 suite's comments repeat each rule's title, so B's agent gets
  examples and rule headings, not examples alone.
- **B's agents keep the oracle's reading over the one wrong public test**
  (R2, under "Known before the runs"): at L0–L1 no double-blind run
  passes the public suite, yet every one matches the oracle.
- By the rule above this is one task, so it is descriptive: no
  confirmatory claim until a second task agrees.

## LiveCodeBench

Written 2026-10-24, after the kestrel gate and before any LiveCodeBench
ladder run. The standard counterpart to kestrel: a published benchmark
whose hidden tests nobody here wrote. No standard benchmark with official
tests from after the June 2026 cutoff was found (LiveCodeBench's last
release is v6, 2025-06; SWE-bench-Live ends 2025-09; AtCoder has suspended
publishing test data), so this uses the 37 sound v6 hard problems of the
LiveCodeBench pilot. Memory lifts both arms alike, so it narrows any gap
between them: a gain found here understates one.

- **Levels** (`bin/ladder/lcb-levels.mjs`), cut by the statement's own
  headings: L0 as imported; L1 no samples; L2 no constraints either; L3
  the title, a 2–3 sentence summary from one Opus session
  (`prompts/ladder-summary.md`) and the input/output format; L4 the title
  and the format. The format stays at every level, since it is the
  interface. AtCoder's `Output` section can name what to print, and
  LeetCode titles describe the task, so L4 is not empty of meaning.
- **Gate:** one spec-only run at L4 per problem; a problem it passes is
  dropped.
- **Arms:** `spec-only` and `double-blind` in condition A, `double-blind`
  in condition B; one run per problem and cell, Haiku 5.5. L0's public
  suite is the pilot's.
- **Score:** the benchmark's own pass/fail per run (the hidden suite stops
  at the first failing case).
- **Primary comparison:** per level, the problems where double-blind
  passes and spec-only fails against the reverse (a sign test across
  problems), condition A; then B against spec-only and B against A.
  AtCoder and LeetCode are reported apart, since LeetCode statements are
  short enough that L3 says nearly everything.

`ladder/run-lcb.sh` runs it; `node bin/ladder/report.mjs --pool lcb_`
reports it.

**Results (2026-10-25).** 359 runs, none refused; one double-blind L0
run timed out and scores 0. The gate kept 23 of 37 problems (20 AtCoder,
3 LeetCode, too few to read). AtCoder, % passed:

| level | spec-only | double-blind A | double-blind B | A vs spec-only | B vs spec-only |
| ----- | --------: | -------------: | -------------: | -------------: | -------------: |
| L0    |       100 |             95 |             95 |         0/1/19 |         0/1/19 |
| L1    |        95 |            100 |             95 |         1/0/19 |         0/0/20 |
| L2    |       100 |             85 |            100 |         0/3/17 |         0/0/20 |
| L3    |        80 |             85 |            100 |         3/2/15 |         4/0/16 |
| L4    |         0 |             70 |            100 |         14/0/6 |         20/0/0 |

Problems ahead / behind / tied. Spec-only L4 is the fresh run 2.

- **L3 and L4 measure memory, not the spec.** Given only the title and
  format, the public writer reproduced official samples exactly (abc395_f
  "Smooth Occlusion", arc194_c "Cost to Flip": input and expected output
  of Sample 1). So the A and B gains there carry what Opus remembers of a
  pre-cutoff problem; they say nothing about specs.
- **Where the statement is present (L0–L2), the shape matches kestrel:**
  a suite from the full statement never loses a problem (B 0 behind at
  every level), and a suite from a reduced one can (A 3 behind at L2).
  The counts are small; not significant.

**Deviation, made after the runs (2026-10-25).** As first run, spec-only's
L4 cell was the gate run itself, which by construction failed every kept
problem, so L4 comparisons against it were biased towards double-blind.
Spec-only's L4 now comes from a fresh second run per kept problem, and
the pooled view leaves the gate run and the dropped problems out.

## Run

```sh
ladder/run.sh                              # build, suites, gate, runs, score; resumable
node bin/ladder/report.mjs                 # the curve per task
node bin/ladder/report.mjs --rules         # per rule and level
node bin/ladder/report.mjs --check         # kestrel oracle cross-check
```

Logs: `ladder/run.log`, `ladder/steps.log`. Scores: `ladder/results.jsonl`.
