# double-blind: the experiment

How the skill's claims were tested: the parties, verdicts, pipeline, arms
and tools behind [FINDINGS.md](FINDINGS.md). The skill itself is in
[../independent-tests](../independent-tests/).

From one spec, generate two test suites: a **public** suite the
implementing agent works against, and a **hidden** suite that judges the
result. If agents pass the public suite and fail the hidden one, the hidden
suite measures something the public one does not. The headline number:

> X of Y agent submissions passed the public suite and failed the hidden
> one. Z were refused for touching tests or the harness.

## Three parties

| Party              | Reads                                               | Writes                    | Never sees                   |
| ------------------ | --------------------------------------------------- | ------------------------- | ---------------------------- |
| Public-test writer | `spec.md`, `src/index.ts` skeleton                  | `tests/public/*.test.ts`  | hidden tests, any submission |
| Hidden-test writer | `spec.md`, `src/index.ts` skeleton, `tests/public/` | `tests/private/*.test.ts` | any submission               |
| Implementing agent | `spec.md`, skeleton, **public** tests               | `src/**` only             | hidden tests                 |

The skeleton is the interface contract: exported names and signatures
drafted once from the spec, each body throwing `not implemented`, so both
suites import the same names. It mirrors `hiddenTestScaffold` in
sandbox-factory.

The hidden writer reads the public suite and targets what it leaves out
(since 2026-10-24). Where the public suite asserts something the spec
leaves open, it tests neither way and lists it under `Open in the spec:`,
stored as `private.open` in `generation.json`. The earlier blind suites are
kept in `tests/private-blind/` for comparison.

## Verdicts

| Verdict      | Meaning                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `passed`     | Public and hidden suites both pass, hidden suite ran at least one test                              |
| `overfit`    | Public passes, hidden fails. **The headline count.**                                                |
| `refused`    | The diff touches anything outside `src/`: tests, harness, `package.json`, `tsconfig.json`, lockfile |
| `incomplete` | Public fails. Excluded from Y                                                                       |

Every `overfit` is classified by hand in `classifications.json`: `real`
(the agent satisfied the visible tests, not the spec) or `spec-gap` (the
hidden test asserts a reading the spec left open). The rules follow
`submissionVerdict` and `gradingTree` in
`public/sandbox-factory/packages/core/src/sandbox/`, reimplemented here
with a hash manifest.

## After the verdict

- **Every test is keyed to a spec scenario.** A test name starts with
  `[kind-n]`, the scenario's kind and its position among that kind in spec
  order (`[unhappy-2]`). The grader reports the failing hidden scenarios as
  `failedScenarios` and nothing else: no test names, inputs or assertions.
  Suites generated before 2026-10-24 are unkeyed.
- **`real` overfit: bounded retry.** `bin/retry.mjs` gives one fresh session
  on the submitted `src/`, with `--feedback keyed` (the failing scenario
  keys) or `plain` (only that it failed). Retries are filed as
  `<variant>-retry-<feedback>`, so the first-attempt rate stays the
  headline. The bound stops an agent searching the hidden suite scenario
  by scenario.
- **`spec-gap` overfit: tighten the spec, regenerate both suites,
  recalibrate.** Information moves hidden → spec → public, never hidden →
  public.
- **`refused`: no retry.** The grader returns the reasons (`refused` in
  `results.jsonl`) and the contributor resubmits as a new run.

## Blindness

Enforced in `bin/lib.mjs`. Every session runs in its own temp workdir; the
OS sandbox denies Bash reads of this folder, the other workdirs and
`~/.claude/projects`, and permission rules deny the file tools the same
paths. `--safe-mode` and `--strict-mcp-config` load no CLAUDE.md, skills or
MCP servers. Hidden tests at rest live only in `specs/`. Transcripts are
still scanned for attempts (`peekAttempts` in `results.jsonl`).

## Pipeline

Preconditions: `claude` from `CLAUDE_BIN`, PATH or the newest VS Code
extension bundle, signed in; Node ≥ 22.12. No Docker. The toolchain is
`SANDBOX_TOOLCHAIN` (Node 22, npm 10.9.2, TypeScript 5.9, `node:test`, ES
modules, no network), the same as a sandbox-factory starter.

```sh
cd template && npx -y npm@10.9.2 ci && cd ..   # once
node bin/generate.mjs [slug...]
node bin/calibrate.mjs [slug...]
node bin/run.mjs [slug...] [--arm double-blind] [--model haiku] [--brief ticket|ticket-notes] [--runs 3] [--concurrency 2] [--min-free 30]
node bin/grade.mjs [slug...] [--force] && node bin/report.mjs
```

1. **Spec.** `specs/<slug>/spec.md`, Gherkin, workspace vocabulary
   scrubbed. Implementable in one module in under an hour, no external
   service, at least one `boundary` or `unhappy` scenario. `ticket.md` is
   the bounty's own loose text, when there is one.
2. **Generate.** Three `claude -p` sessions: skeleton, public suite (happy
   path and one boundary per scenario), hidden suite (every scenario kind;
   for each public test one it does not exercise; every boundary and
   unhappy scenario the public suite skips; the case a shortcut tuned to
   the visible tests gets wrong). Both suites type-check against the
   skeleton. Regenerating the public suite deletes the hidden one.
3. **Calibrate.** Every hidden test must fail on the skeleton by assertion,
   and a reference written by a fourth session that sees both suites must
   pass both. A hidden test the reference cannot satisfy is dropped and
   logged in `calibration.json`; a spec with none left is dropped.
4. **Run.** A fresh copy of template, skeleton and the arm's inputs per
   run; the agent's transcript and diff go to `runs/<slug>/<variant>/<n>/`.
5. **Grade.** Copies only the submission's `src/` onto a fresh template,
   checks every other file against the manifest, runs the public suite,
   then the hidden suite, and writes one line per run to `results.jsonl`.
6. **Classify and report.** Class each `overfit` in `classifications.json`;
   `report.mjs` prints the sentence and the per-spec tables.

Operating rules:

- Each script skips work whose output exists. To regenerate only the
  hidden suite, delete `tests/private/`; `--force` on `generate.mjs` also
  redoes the skeleton and public suite and invalidates stored submissions.
- Grade only after every run of that spec has finished, and with no other
  `grade.mjs` running: it rewrites all of `results.jsonl`.
- `--min-free` gates each session on free memory; about 8 concurrent
  sessions ran the machine out. `run.mjs` and `retry.mjs` stop on
  `usage_limit_reached` without recording a run; rerun to resume.
- `DOUBLE_BLIND_MODEL` picks the model for every session,
  `DOUBLE_BLIND_HIDDEN_MODEL` the hidden writer's alone; `--model` on
  `run.mjs` the agent's alone, filing runs as `<arm>-<model>`.

## Arms and briefs

`ARMS` in `bin/lib.mjs`, prompts in `prompts/agent-*.md`.

| arm                  | the agent gets                                                       |
| -------------------- | -------------------------------------------------------------------- |
| `double-blind`       | spec, skeleton, public tests                                         |
| `spec-only`          | spec and skeleton, writes no tests                                   |
| `self-tested`        | spec and skeleton, writes its own under `tests/own/`                 |
| `double-blind-own`   | public tests plus own tests per scenario. **The skill's brief**      |
| `double-blind-rule`  | public tests plus the hidden writer's coverage rule and a self-check |
| `spec-only-rule`     | the rule and self-check, no public tests                             |
| `red-team`           | public tests, told to pass them with the least general code          |
| `ci-gate`            | 8-turn cap, acceptance stated as "`npm test` passes in CI"           |
| `double-blind-turns` | 8-turn cap, hidden acceptance; the control for `ci-gate`             |

`--brief` replaces `spec.md` in the agent's workdir: `ticket` gives
`ticket.md`, `ticket-notes` adds `notes.md` (`BRIEFS` in `bin/lib.mjs`).
Variants end `-<brief>`. Derived specs keep the original's hidden suite or
skeleton: `<slug>-gen/` has a spec written from the ticket
(`bin/tighten.mjs`), `<slug>-change/` a change request on the reference
(`bin/change.mjs`).

## Other tools

| script                                             | what it does                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bin/retry.mjs`                                    | one more session for a run that was not accepted, `--feedback keyed\|plain`                    |
| `bin/mutate.mjs`, `bin/mutate-own.mjs`             | single-edit mutants of each reference, judged by both suites / by agents' own tests            |
| `bin/acceptance.mjs`                               | runs each run's own tests on its `src/` and on the reference → `acceptance.jsonl`              |
| `bin/referee.mjs`                                  | a blind referee on another model for each disagreement in `acceptance.jsonl` → `referee.jsonl` |
| `bin/red-team-audit.mjs`                           | labels each red-team run that passed both suites `general` or `shortcut`                       |
| `bin/notes.mjs`                                    | the public suite's assertions as prose, `specs/<slug>/notes.md`, for `--brief ticket-notes`    |
| `bin/tighten.mjs`                                  | a spec written from `ticket.md` → `specs/<slug>-gen/`                                          |
| `bin/change.mjs`, `bin/change-report.mjs`          | change requests → `specs/<slug>-change/`; hidden failures split into regressions and misses    |
| `bin/evalplus-import.py`, `bin/evalplus-score.mjs` | HumanEval+ tasks → `specs/he-*/`; EvalPlus's labelled solutions judged by the generated suites |
| `bin/git-oracle/`                                  | patch-apply cases from real git history, judged by `git apply` (commands below)                |

```sh
node bin/git-oracle/corpus.mjs runs/git-oracle/cases.jsonl <repo>[:maxCommits] ...
node bin/git-oracle/git-oracle.mjs runs/git-oracle/cases.jsonl runs/git-oracle/git.jsonl
node bin/git-oracle/build.mjs && node bin/git-oracle/run-all.mjs
node bin/git-oracle/flags.mjs && node bin/git-oracle/compare.mjs --strict
```

## LiveCodeBench

The same arms judged by the benchmark's own tests and checker.

```sh
python3 -I bin/lcb-import.py --difficulty hard --newest 40   # specs/lcb-*/, dataset cached in ~/.cache/double-blind/lcb
node bin/generate.mjs lcb-*    # public suite only; skeleton and hidden suite come with the import
node bin/calibrate.mjs lcb-*   # hidden must fail on the skeleton; no reference session
node bin/run.mjs lcb-* --arm double-blind --model haiku --runs 1
```

| double-blind     | LiveCodeBench                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `spec.md`        | the statement and the benchmark's own format line, samples included                              |
| skeleton         | `src/main.py` raising `not implemented`, or the starter `class Solution` whose method raises     |
| public suite     | written from the statement (`prompts/python/public-tests.md`)                                    |
| hidden suite     | the benchmark's private cases (`tests/private/cases.json`, gitignored and re-importable)         |
| judge            | `sandbox/lcb/testing_util.py`, the benchmark's checker byte for byte (`UPSTREAM` has the commit) |
| `toolchain.json` | `{"name": "python", "reference": false, "generate": ["public"]}`                                 |

`sandbox/check.py` is the one path to the checker: public tests, hidden
tests and the agent's `sandbox/exec.py` run the program as the benchmark
does (stdin mocked, 6 s per case, lines compared stripped, a fresh process
per call). The hidden suite stops at the first failing case, as the
benchmark does, so a run's verdict equals the benchmark's pass/fail. Every
arm's brief states these semantics. An `incomplete` run whose submission
passes the hidden suite is a public-suite defect.

## Layout

```
public/double-blind-experiment/
  README.md, EXPERIMENT.md, FINDINGS.md
  specs/<slug>/
    spec.md, ticket.md      the precise spec; the bounty's loose text
    skeleton/src/index.ts   the interface contract
    tests/public/           what the agent works against
    tests/private/          the hidden suite, written against the public one
    tests/private-blind/    the earlier hidden suite, blind to the public one
    reference/src/          the fourth session's implementation
    generation.json         sessions and cost per party; private.open
    calibration.json        hidden tests kept and dropped (-blind: the same for private-blind)
    notes.md                the public suite in prose (bin/notes.mjs)
  prompts/                  one brief per party and arm; python/ and pyfunc/ for Python specs,
                            change/ for change requests
  template/                 Node toolchain: package.json, lockfile, tsconfig, sandbox/run.mjs
  template-python/          Python toolchain: sandbox/run.py, sandbox/lcb/ (the benchmark's checker)
  bin/                      lib.mjs (sessions, staging, hashing, ARMS, BRIEFS) and the scripts above
  runs/                     gitignored: transcripts, diffs, submissions, grade.json
  results.jsonl             one line per run, verdict and counts only
  results-blind.jsonl       the same runs graded by tests/private-blind/
  classifications.json      hand class of each overfit: real | spec-gap | judge-defect
  mutation.jsonl, acceptance.jsonl, referee.jsonl, evalplus-results.json
```

## Not in scope

Sliced repositories, mocks and `sandbox/mock.js`, pseudonyms, the worker,
the database. The experiment is the starter path only. If it works, the
skill is what sandbox-factory's `sandbox_starter` run already does, made
available on any spec from the command line.
