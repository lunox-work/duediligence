# duediligence: results

What the method was measured to do. About 3,000 graded agent runs on 26
TypeScript specs, 40 LiveCodeBench problems, 40 HumanEval+ tasks and a spec
ladder with oracle judges, and 110 on 11 changes replayed in an existing
repository, run 2026-10-23 to 2026-10-25 with Opus 5.5 writing the suites and
Haiku 5.5 implementing unless stated. The dated write-ups are vendored into
`evidence/` ([FINDINGS.md](evidence/FINDINGS.md),
[EXPERIMENT.md](evidence/EXPERIMENT.md), [LADDER.md](evidence/LADDER.md)) from
the experiment archive, `double-blind-experiment/`, which holds the runs and
data and is not part of this repository. Run 2026-10-26: Codex CLI as writer and
referee ([Writer backends](#writer-backends)) and as implementer
([Other implementers](#other-implementers)), Opus 5.5 as an adversary
([Red team](#red-team)), and 12 changes in two public repositories
([In repositories not written here](#in-repositories-not-written-here)). Run
2026-10-27: specs checked through a command or an HTTP service
([Black-box seams](#black-box-seams)). Run 2026-10-28: Go and Rust modules end
to end ([Go and Rust](#go-and-rust)), and commands and services written in
Python, Go and Rust
([Commands and services in other languages](#commands-and-services-in-other-languages)).
p-values are Fisher's exact test,
two-sided.

## The agent's own green run is not an acceptance signal

Every agent that wrote its own tests ended saying they passed. Measured by
rerunning those tests on the submitted code, every one was green. The hidden
suite then rejected:

| brief the agent read        | runs | own tests green | rejected by the hidden suite |
| --------------------------- | ---: | --------------: | ---------------------------: |
| the loose ticket            |  105 |             105 |                     75 (71%) |
| the precise, confirmed spec |  404 |             404 |                      25 (6%) |

A blind referee on another model (Fable 5.1), given only the spec, the failing
code and one anonymised test, upheld 95 of the 100 rejections it was shown as
things the spec requires, and 24 of the 26 rejections of a run whose own tests
were green. Of 74 agent-written tests that fail the calibrated reference, 66
assert a reading the spec leaves open, 5 are wrong, 3 are rules the reference
misses. ([Self-grading](evidence/FINDINGS.md#self-grading),
[Follow-ups](evidence/FINDINGS.md#follow-ups))

## Tests written from the spec carry it to the agent

The same seven specs, 15 runs per cell, graded by the same hidden suites. The
only thing that changes is what the agent reads.

| the agent reads                           | with the public suite |  no tests | own tests |
| ----------------------------------------- | --------------------: | --------: | --------: |
| the loose ticket                          |          **81 / 105** |  30 / 105 |  30 / 105 |
| the ticket plus the public suite as prose |              76 / 101 |           |           |
| the precise spec                          |              95 / 105 | 100 / 105 |  98 / 105 |

From the ticket the gain is p < 1e-11; from the precise spec there is none (p =
0.28). The prose row shows what the gain is: the spec's decisions, which the
tests carry. A ticket that says "as CSV" fails in every cell; one that never
mentions overlap fails every control on concurrency and no run given the public
suite.
([Precise spec against the ticket](evidence/FINDINGS.md#precise-spec-against-the-ticket))

The spec ladder makes the same point against an oracle nobody here wrote. One
invented version-range scheme, 396 oracle cases, a full spec L0 and four vaguer
ones down to ten words at L4; 5 runs per cell, macro average over rules, %:

| spec level   | no tests | suite written from the same level | suite written from the full spec |
| ------------ | -------: | --------------------------------: | -------------------------------: |
| L0, full     |      100 |                               100 |                              100 |
| L2           |       56 |                                52 |                          **100** |
| L3           |       59 |                                43 |                          **100** |
| L4, 10 words |       46 |                                37 |                          **100** |

A suite from the full spec carries all of it, even when the agent reads ten
words. A suite from a vague spec locks in the writer's guess and does worse than
no suite. Twenty AtCoder problems judged by LiveCodeBench's own tests show the
same shape where the statement is present: the full-spec suite never loses a
problem, the reduced-spec suite loses three. Both are pilots: one task, small
counts. ([Spec ladder](evidence/LADDER.md))

## Own tests on top of the public suite

The skill's brief, `prompts/agent.md`: pass the public suite and write one test
per scenario with inputs unlike the public ones. Against the public suite alone,
on the four specs where that suite had misses:

| spec          | public suite + own tests | public suite alone |
| ------------- | -----------------------: | -----------------: |
| tool-versions |                  50 / 50 |            42 / 50 |
| patch-apply   |                  19 / 20 |            20 / 20 |
| licence-scan  |                  20 / 20 |            19 / 20 |
| csv-export    |                  11 / 15 |             6 / 15 |
| pooled        |            **100 / 105** |           87 / 105 |

tool-versions p = 0.006, pooled p = 0.007. On csv-export the public suite alone
made agents stop at green with a number formatted `1e+21` where the spec says
plain digits (6 of 15 against 14 of 15 with no tests at all); own tests recover
most of that. A run of this brief whose own tests pass is rejected by the hidden
suite 1 time in 60, against 25 in 404 for own tests without the public suite.
([Mechanisms](evidence/FINDINGS.md#mechanisms),
[Follow-ups](evidence/FINDINGS.md#follow-ups))

## The hidden suite as a judge

- **Gaming.** Agents told to pass the public suite with the least general code:
  21 of 21 that did were rejected (20 hard-coded the public inputs, 1 skipped a
  stated rule). Haiku declined to game in 31 of 52 runs. In 2,522 runs no agent
  changed a test or the harness; 19 transcripts touched a path outside the
  workdir, every one a mistyped own path.
  ([Gaming the suite](evidence/FINDINGS.md#gaming-the-suite))
- **An outside oracle.** On 1,240 HumanEval+ solutions labelled by EvalPlus,
  suites generated from the prompt alone accepted 4.8% of wrong solutions
  against 15.0% for HumanEval's own tests, and rejected 3 of 289 right ones (two
  tasks the suite and the oracle read differently excluded; all 40 tasks: 7.7%
  against 17.5%, 23 of 314).
  ([HumanEval+](evidence/FINDINGS.md#humaneval-as-an-outside-oracle))
- **Against git.** On a patch-apply spec the calibrated reference agreed with
  `git apply` on all 7,533 real-history cases judged. One submission passed both
  suites and disagreed with git, on a rename without hunks the hand-written test
  diffs never showed.
  ([A git oracle](evidence/FINDINGS.md#a-git-oracle-on-patch-apply))
- **Mutants.** Of 1,442 single-edit mutants of the references, the public suite
  killed 75.6% and both suites 79.2%; of the public suite's survivors that
  matter to the spec, the hidden suite kills about 30%. The misses cluster on
  inputs the spec names by an outside format, which is why the skill asks for
  real tool output in the spec.
  ([Mutation score](evidence/FINDINGS.md#mutation-score))

## Feedback after a verdict

One bounded retry of every first attempt that was not accepted, told either the
failing scenario keys (`unhappy-2`) or only that it failed:

| first attempt                 |       keyed |   plain |
| ----------------------------- | ----------: | ------: |
| public suite                  |     17 / 19 | 16 / 22 |
| no tests                      |     22 / 26 | 11 / 26 |
| own tests                     |     21 / 23 | 16 / 24 |
| public suite, from the ticket |     15 / 24 | 14 / 24 |
| pooled                        | **75 / 92** | 57 / 96 |

p = 0.001. A key names a scenario the agent already has in the spec, so it leaks
no test. On specs a session had drafted from the ticket without confirmation,
retries recovered 0 of 72: when the spec and the judge decide differently, no
feedback helps. That is why step 2 of the skill is a person.
([Follow-ups](evidence/FINDINGS.md#follow-ups),
[From the ticket alone](evidence/FINDINGS.md#from-the-ticket-alone))

## In an existing repository

Eleven changes from the history of
[sandbox-factory](https://github.com/lunox-work/sandbox-factory), replayed at
their parent commit: six in `packages/core`, one each in `packages/shared`,
`packages/jira`, `apps/worker`, `apps/api` and `apps/web` (vitest; the rest
`node:test`). The ticket is the commit message as written, plus the declarations
the commit adds to the seam, without bodies. A blind session drafts the spec
from it at base and never sees the diff. Each case is prepared twice: from the
drafted spec as it stands, and after a session playing the commit's developer,
shown the real diff, answers the spec's decisions the way the code does. That is
step 2 of the skill, done by the one person who knows what the code was meant to
do. The real commit is judged by both suites, and Haiku 5.5 implements the
confirmed spec five times with the public suite and five times without it.
Driver, cases, specs and grades: [evidence/in-repo.mjs](evidence/in-repo.mjs)
and `evidence/in-repo/`.

| the real commit, judged by suites written from | passed both | hidden tests passed | public tests passed |
| ---------------------------------------------- | ----------: | ------------------: | ------------------: |
| the spec drafted from its message              |      0 / 11 |     256 / 709 (36%) |           263 / 601 |
| the same spec, confirmed by its developer      |  **8 / 11** |       **659 / 665** |           599 / 600 |

- **A drafted spec does not describe the developer's code.** Two drafted suites
  did not compile against the real commit: the drafter named an export or a
  field the developer never wrote. The rest decided messages, limits and edge
  rules otherwise. The identicon's message says plain FNV-1a was kept over a
  finalized hash; the drafter specified the finalizer, and the real code passed
  3 of 80 hidden tests. Elsewhere the spec throws where the code returns.
  Confirmation is where the accuracy comes from, here as in the archive.
- **Six hidden tests reject a confirmed real commit.** Two are defects in the
  shipped code: `categories` looks names up in a plain object, so a priority
  named `constructor` ranks as a function instead of `"high"`, and a threshold
  named `toString` counts as known (`key in defaults`, two lines below an
  `Object.hasOwn` guard on the category), against the confirmed spec in both
  cases. Two hold the code to its confirmed words on inputs the developer did
  not think of: a short title ending in a lone surrogate, which the spec says is
  returned unchanged and the code trims, and a `String` object, which the spec
  rejects as a non-string and the code accepts. Two read a question the spec
  leaves open, an ADF heading level or list start given as a numeric string:
  false rejects of the `spec-gap` kind. So 2 of 665 hidden tests rejected the
  real code without the spec's support.

| Haiku 5.5 on the confirmed spec   | with the public suite | without it |
| --------------------------------- | --------------------: | ---------: |
| passed                            |               55 / 55 |    55 / 55 |
| regressed: an existing test broke |                     0 |          0 |
| changed outside the allowed paths |                     0 |          0 |
| refused: edited a test or config  |                     0 |          0 |
| tried to read the hidden suite    |                     0 |          0 |

Every run passed, the three suites that rejected the real commit included, so
the arms do not separate (p = 1), as on precise specs in the archive. What the
arm shows is that the repository harness (stub, regression baseline, scope
rules) admits correct work: no run was refused for anything but its code, and
none was.

- **Suites.** Calibration kept 709 of 709 hidden tests on the drafted specs and
  665 of 666 on the confirmed ones; no reference broke an existing test. 600
  public and 665 hidden tests on the confirmed specs, 25 to 150 per spec.
- **Selection.** A case is a commit whose change inside one package builds alone
  at the parent and keeps the package's suite passing (`in-repo.mjs check`, no
  model). The landing site's 122 commits have no TypeScript test of a source
  file; most of sandbox-factory's 185 are squashed multi-package PRs, so four
  cases are judged on the seam file alone. Three candidates were dropped: two
  need same-commit changes in another package, one is a behaviour-preserving
  ReDoS fix no unit test tells apart from base. `categories` was first cased
  with one of its five files as the seam; the real commit then compiled against
  neither suite, and it was prepared again with the commit's own layout.
- **Pilots.** Before the arm, `handle-candidates` (`packages/core`) and
  `byte-size` (`apps/web`), confirmed by a person, passed blind Haiku runs
  (18/18 and 32/32; 14/14 and 26/26), and every verdict was forced once by hand.
  Dropping the deduplication at number 100 passes both handle-candidates suites:
  the spec's examples never reach a three-digit repeat. A copy of a passing
  step-holds run, broken by hand, was graded `incomplete`; one retry told only
  its three scenario keys passed it.

## In repositories not written here

The same arm on two public repositories, 2026-10-26: unjs/ufo (URL utilities)
and unjs/pathe (path utilities), both TypeScript on vitest with pnpm, neither
written by anyone here. `evidence/in-repo.mjs` takes any repository now
(`--cases <dir>/cases.json`; a case's `repo` may be a git URL); `discover`
listed the candidate commits with no model, as the sandbox-factory cases were
chosen: one package, a feat, fix or perf subject, source changed outside the
tests, a test changed that imports it, no harness change. `check` then kept the
commits whose change builds alone at the parent and keeps the suite. Both
repositories squash pull requests into one-line subjects, so the drafter's
ticket is the subject and the declarations the commit adds or changes, nothing
more. Cases, specs, ledgers and grades: `evidence/in-repo-ufo/`,
`evidence/in-repo-pathe/`; `sh evidence/in-repo-queue.sh <cases.json>` runs or
resumes a set.

| the real commit, judged by suites written from | ufo: passed both | hidden tests passed | pathe: passed both | hidden tests passed |
| ---------------------------------------------- | ---------------: | ------------------: | -----------------: | ------------------: |
| the spec drafted from its subject              |            1 / 6 |     355 / 435 (82%) |              2 / 6 |     291 / 357 (82%) |
| the same spec, confirmed by its developer      |        **6 / 6** |       **286 / 286** |          **6 / 6** |       **186 / 186** |

| implementer, on the confirmed specs | ufo, with the public suite | ufo, without |                   pathe, with | pathe, without |
| ----------------------------------- | -------------------------: | -----------: | ----------------------------: | -------------: |
| Haiku 5.5, 5 runs per spec          |                    25 / 25 |      24 / 25 |                       30 / 30 |        30 / 30 |
| Codex CLI, 5 runs per spec          |                **25 / 25** |              | 17 / 17 (4 specs; 13 pending) |                |
| regressed, outside scope, refused   |                    0, 0, 0 |      0, 0, 0 |                       0, 0, 0 |        0, 0, 0 |

- **Cases.** ufo: `filterQuery`, `joinRelativeURL` and `withoutHost` added;
  `withBase`/`withoutBase` false prefix matches, Windows drive letters only with
  `file://`, `parseQuery` on a null-prototype object fixed. Two older commits
  were dropped by `check`: their parent does not build. pathe:
  `reverseResolveAlias` added; a UNC prefix kept by `resolve`, `extname` of a
  name ending in a dot, `format` with partial arguments, `filename` of a dotfile
  or a name without extension, and `basename` ignoring a trailing separator
  fixed. One commit was dropped: its parent does not build.
- **One case is judged as a commit only.** `joinRelativeURL` moved `../`
  handling out of `joinURL` and rewrote 13 existing `joinURL` tests in the same
  commit, so a faithful implementation fails those tests at base and every run
  would read `regressed`; `run` now skips a case whose commit changed what
  existing tests expect (`check`'s `editedTestsLost`). Its drafted and confirmed
  references broke the same 13 tests, as the real commit does.
- **Spend.** ufo: 12 prepares $23.74 ($1.23–2.99, median $1.96), 50 Haiku runs
  $0.85 (median 1.1 minutes). pathe: 12 prepares $29.61 ($1.72–3.30, median
  $2.47), 60 Haiku runs $1.20. Codex (its own billing) ran 25 of 25 on ufo and
  17 on pathe on 2026-10-27 before its credits ran out again;
  `sh evidence/in-repo-queue.sh evidence/in-repo-pathe/cases.json` runs the
  other 13. Codex's shell looks for `AGENTS.md` in every folder above its
  workdir, and the transcript scan reports that once as a peek at another
  workdir; it named no hidden path.
- **Two harness fixes the second repository needed.** pathe names tests after
  `process.cwd()`, so every staged tree gave them new ids and the baseline read
  them as regressions: runners now write the tree's folder in a test name as
  `<root>`. Since this phase vitest and Jest run under the memory guard
  (`bin/runners/guard.mjs`: 512 MB heap per process, the whole run killed over 3
  GB; sandbox-factory's apps/web suite peaks at 2.2 GB) with `--maxWorkers=2`,
  which vitest before 4 rejects under its default minimum unless
  `--minWorkers=1` comes with it; the runner adds it there.

## Installed as a package

The README's five-minute path, run 2026-10-26 on the CLI alone: the `npm pack`
tarball in a fresh `node:22` container (Node 22.23.4), no checkout mounted, as
the unprivileged `node` user, with the data in a fresh `~/.duediligence/`.
No model session.

| step                                           | global install (package dir root-owned) |  `npx --package <tarball>` |
| ---------------------------------------------- | --------------------------------------: | -------------------------: |
| `prepare` on the confirmed example             |                       ready, no session |          ready, no session |
| toolchain installed on first use (npm 10.9.2)  |                                     yes |                        yes |
| `judge` the handout's skeleton                 |                `incomplete`, 0/22, 0/39 |   `incomplete`, 0/22, 0/39 |
| `judge` the reference                          |              **`passed`, 22/22, 39/39** | **`passed`, 22/22, 39/39** |
| the clone URL and `npx duediligence` line |                                 pending |                    pending |

The last row waits on the repository being pushed and the package published;
neither exists yet.

## Commitment hash

The hidden suite's `hiddenSha256` (`bin/commitment.mjs`), checked 2026-10-26 on
existing material. No model session.

| check                                                               | result                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `duration-parse` hashed twice, and by the shell recipe              | the same hash all three times                                                   |
| the archive's 26 core specs, each hashed twice in place             | 26 of 26 stable, 26 distinct                                                    |
| one byte of a hidden test changed after the handout (scratch home)  | **judge refuses, exit 1**, `hidden suite changed since <at>`; handout refuses   |
| the byte restored                                                   | `passed`, 22/22, 39/39, the handout's hash printed                              |
| a repository handout (`handles-confirmed`, scratch sandbox-factory) | hash in BRIEF.md and handout.json; one appended byte refused; stub `incomplete` |
| `promote` (same, hand-made `judged.json`)                           | hash printed at reveal; refused when it differs from the judged one             |

## Confirmation

How often a drafted spec's decision is the one the person confirms, on material
already here, no model: 18 drafts, one label per drafted `Decided:` item (294),
made by hand 2026-10-26 and kept as data with both texts, the kind of decision
and a one-line reason
([evidence/default-match.json](evidence/default-match.json));
[evidence/default-match.mjs](evidence/default-match.mjs) counts them. The
archive's 7 `-gen` specs, drafted from the ticket alone, are set against the
person-written spec; 51 of their 127 items decide something that spec never
addresses and are left out. The 11 repository drafts are set against the spec
the developer stand-in confirmed from the real diff, cross-checked with its
`Changed:` list.

| drafts against                        | drafted defaults kept | drafts needing no change |
| ------------------------------------- | --------------------: | -----------------------: |
| the person's spec (archive, 7)        |         66 / 76 (87%) |                    2 / 7 |
| the developer's code (repository, 11) |        99 / 167 (59%) |                   0 / 11 |
| all 18                                |   **165 / 243 (68%)** |                   2 / 18 |

| kind of decision                              | kept / decided | archive | repository |
| --------------------------------------------- | -------------: | ------: | ---------: |
| the rule itself                               |  53 / 77 (69%) | 24 / 29 |    29 / 48 |
| invalid or missing input                      |  20 / 34 (59%) | 13 / 13 |     7 / 21 |
| limits, defaults, edges                       |  23 / 32 (72%) |  9 / 10 |    14 / 22 |
| purity, freezing, caching, concurrency        |  20 / 23 (87%) |   4 / 4 |    16 / 19 |
| reading input text (trim, case, normalise)    |  13 / 22 (59%) |   5 / 5 |     8 / 17 |
| exact output text (messages, labels, formats) |   7 / 18 (39%) |   6 / 9 |      1 / 9 |
| ordering and precedence                       |  12 / 15 (80%) |   3 / 4 |     9 / 11 |
| export names and constants                    |   8 / 12 (67%) |   0 / 0 |     8 / 12 |
| collaborator failures                         |          5 / 6 |   2 / 2 |      3 / 4 |
| contract scope                                |          4 / 4 |   0 / 0 |      4 / 4 |

- **Most drafted decisions survive; almost no draft does.** 16 of 18 drafts had
  between 1 and 19 decisions changed, and one is often enough: no real commit
  passed a suite from its draft (0 of 11), and on 4 of the 5 archive drafts with
  a change every agent failed the person's hidden suite (0 of 10 each;
  gherkin-parse's two changes are forms its hidden suite never tries).
- **The misses cluster.** Exact output text is kept 39% of the time. In the
  repository, 12 of the 14 changed input decisions are a draft that rejects
  input the code accepts or passes through: the drafter's conventional "validate
  and throw" was the developer's choice 7 times in 21. These are the decisions
  to put to the person first.
- **Person minutes: pending.** `bin/confirm.mjs` now records `startedAt` (the
  first listing), `at`, `minutes` and the decisions changed in `confirmed.json`;
  `node evidence/default-match.mjs confirmations` gives the median once five
  real confirmations exist. The developer stand-in was a model session, so it
  measures nothing about a person.
- **`--from` round trips** (2026-10-26): the public GitHub issue vercel/ms#284
  into `ticket.md` (title, source link, state, body; `--comments` adds comments)
  and back out as the source line of `decisions.md`; Jira BOX-85 read through
  the Atlassian MCP and passed with `--body`, since no API token is set here.
  The REST path (`JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`) was checked
  against a local stand-in server only.

## Runners

Jest, pytest, `go test` and `cargo test` beside `node:test` and vitest,
2026-10-26, each runner printing the one result shape
(`bin/runners/shared.mjs`). Python is pytest 8.4.2 on CPython 3.14.

**The HumanEval+ oracle row on the pytest runner, no model.** The archive's 40
HumanEval+ specs imported (`bin/import-archive.mjs`, not held out), every one of
the 1,240 EvalPlus solutions re-judged (`evidence/evalplus.mjs`,
`evidence/evalplus.json`) where the archive had judged them on its own unittest
runner:

| on 1,240 solutions, 926 wrong (889 without HumanEval/22 and /60)    |      archive, unittest |          pytest runner |
| ------------------------------------------------------------------- | ---------------------: | ---------------------: |
| wrong accepted by HumanEval's original tests, without 22 and 60     |            133 (15.0%) |            133 (15.0%) |
| wrong accepted by generated public + hidden, without 22 and 60      |              43 (4.8%) |          **43 (4.8%)** |
| right rejected by generated public + hidden, without 22 and 60      |               3 of 289 |           **3 of 289** |
| the same three rows, all 40 tasks                                   | 17.5%, 7.7%, 23 of 314 | 17.5%, 7.7%, 23 of 314 |
| solutions whose public or hidden verdict differs from the archive's |                      — |             0 of 1,240 |

The test ids are the archive's (`Class.method`, as unittest names them), so the
imported calibration.json files are used unchanged.

**`fit` on public repositories** (clones at their default branch, 2026-10-26):

| repository                          | runner, install                | verdict                                    | existing suite   |
| ----------------------------------- | ------------------------------ | ------------------------------------------ | ---------------- |
| gvergnaud/ts-pattern `f11be73`      | Jest 30 + ts-jest, npm         | **supported**                              | 467 passed, 11 s |
| pallets/itsdangerous `672971d`      | pytest, `uv.lock` (src layout) | **supported**                              | 297 passed, 1 s  |
| typestack/class-validator `2e1a5c2` | Jest 29 + ts-jest, npm         | supported, its failing `tsc` check dropped | 797 passed, 4 s  |

A hand-made stub, public and hidden test on ts-pattern and on itsdangerous
judged `incomplete` on the stub, `passed` with the reference, and `refused` for
an edited `pyproject.toml` or an added `conftest.py`. Go and Rust, in Docker
(`golang:1.23`, `rust:1.82`; neither is on the host), on a hand-written fixture:
reference `passed`, skeleton `incomplete`, a wrong submission `overfit` with its
scenario keys, a panicking stub failing one test and not the binary, a hanging
Rust test failing alone, a hidden test that does not compile reported as not
compiled.

**End to end, confirm → prepare → blind run → judge**
(`evidence/runners/specs/`, `evidence/runners/results.jsonl`). Both specs were
drafted and confirmed by the phase's agent, not a person
(`--by "phase-2 agent (not a person)"`), so their confirmation minutes are not a
person's.

| spec                                                           | prepare (Opus 5.5)                                | public | hidden kept | Haiku 5.5 blind runs                  |
| -------------------------------------------------------------- | ------------------------------------------------- | -----: | ----------: | ------------------------------------- |
| `duration-parse-py`: duration-parse ported to Python, pytest   | $1.48, 5.7 min of sessions                        |     74 |  212 of 212 | 3 of 3 `passed`, $0.01–0.02           |
| `ts-pattern-display`: readable `NonExhaustiveError`, Jest repo | $2.14, 9.2 min; existing 467/467 on the reference |     46 |    73 of 73 | 3 of 3 `passed`, 0 regressions, $0.03 |

One run's change, copied into a fresh ts-pattern checkout after
`handout --repo`, judged `passed` from the working tree (the stub alone:
`incomplete`, 1/46). No peek attempts in the six runs.

## In CI

CI mode (`bin/seal.mjs`, `judge --seal`, `bin/ci.mjs`, `action.yml`,
`.github/workflows/judge.yml`), checked 2026-10-26 on the 11 repository cases
with no model and nothing pushed: each case's change inside its allowed paths as
a branch on its parent commit in a scratch clone of sandbox-factory, both arms'
specs sealed, and every branch judged by `duediligence ci`, the script the
workflow runs, in a fresh home with no `specs/` and fresh base installs
([evidence/ci.mjs](evidence/ci.mjs), `evidence/ci/`).

| the change, judged from the seal of | checks passed | hidden tests passed | public tests passed | same verdict and counts as above |
| ----------------------------------- | ------------: | ------------------: | ------------------: | -------------------------------: |
| the spec drafted from its message   |        0 / 11 |           256 / 709 |           263 / 601 |                          11 / 11 |
| the same spec, confirmed            |    **8 / 11** |       **659 / 665** |           599 / 600 |                          11 / 11 |

- **Nothing hidden in the output.** Every log, check body and step summary (66
  files) grepped for the slug's 2,748 hidden test names (with and without the
  `[kind-n]` key), 80 hidden file paths and 8,908 hidden test lines not also in
  the public suite, stub or spec: 0 found. The same grep finds 3 names in a
  `judge --detail` log of one case. The two drafted suites that do not compile
  print the public tree's compiler output only.
- **Refusals.** A seal with one hidden byte changed is refused before judging
  (its file hash), and so is one whose file list was rewritten to match
  (`hidden suite changed since <sealedAt>`, exit 1); `--detail` and `--audit`
  are refused with `--seal`. The new-module example judges from its seal too:
  reference `passed` 22/22 and 39/39, skeleton `incomplete`.
- **The check.** Posted to a local stand-in for the Checks API with a test
  token: one `POST /repos/<owner>/<repo>/check-runs`, head SHA, name, conclusion
  and title as written to `--out`. The judge runs with tokens, secrets and the
  Actions files stripped from its environment.
- **Pending: GitHub.** The fork with one pull request per case, the private seal
  store and the secret are one script, `evidence/ci/fork-and-open-prs.sh`, not
  run: it creates repositories and opens pull requests. `act` is not installed
  here; the workflow has not run on a runner.
- **Another implementer.** Codex CLI 0.164.0 (`gpt-6.1-sol`, on the person's
  Codex login) implemented `limit-jobs-confirmed` from its repository handout
  inside a container holding only the handout checkout (cloned at the base
  commit, no later history), the brief and the spec; no suite, seal or reference
  was on it (`evidence/ci/codex/`). Its commit, judged from the seal by `ci`:
  **`passed`**, public 54/54, hidden 46/46, existing 120/120, its 22 own tests
  not judged; 0 hidden names or lines in the log or check. One run on one spec,
  so it shows the path works, not a rate.

## Writer backends

The writers, the reference and the referee run on a backend chosen per spec
(`bin/lib.mjs` `session`, `bin/backends.mjs`): `claude-cli`, `codex-cli`,
`anthropic-api`, `exec`. Checked 2026-10-26 with Codex CLI 0.164.0
(`gpt-6.1-sol`, the person's Codex login) beside the archive's Claude numbers,
on the archive's material and with no agent run except the ladder's last row
([evidence/backends.mjs](evidence/backends.mjs), `evidence/backends.json`,
Codex's suites in `evidence/backends/specs/`).

**One spec end to end.** `duration-parse` with toolchain.json
`"backend": "codex-cli"`, confirm → prepare, four Codex sessions (skeleton,
public, hidden, reference) in 9.2 minutes, no fix turn: 80 public tests, 90 of
90 hidden kept, reference 80/80 and 90/90, skeleton `incomplete`. The Claude
reference passes Codex's suites (80/80, 90/90) and Codex's reference passes
Claude's (22/22, 39/39).

| metric                                                          | Claude (archive)                                | Codex CLI                                      |
| --------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| hidden tests kept by calibration, 26 core specs                 | 1,361 of 1,361                                  | 1,126 of 1,133 (99.4%)                         |
| mutants killed, public suite (the same 1,442 mutants, 25 specs) | 1,090 (75.6%)                                   | 1,119 (77.6%)                                  |
| mutants killed, public + hidden                                 | 1,142 (79.2%)                                   | 1,162 (80.6%)                                  |
| EvalPlus, wrong solutions accepted, 38 tasks                    | 4.8% (43 of 889; HumanEval's own 15.0%)         | **3.8% (34 of 889)**                           |
| EvalPlus, right solutions rejected, 38 tasks                    | 3 of 289                                        | 5 of 289                                       |
| EvalPlus, the 6 tasks Codex wrote first                         | 2 of 159 wrong accepted, 0 of 27 right rejected | 0 of 159, 0 of 27 (HumanEval's own: 14 of 159) |
| ladder: public tests the oracle passes, L0 to L4                | 73/74, 31/32, 22/23, 14/14, 1/1                 | 37/37, 45/45, 25/27, 16/16, 2/2                |
| ladder B: Haiku given L1–L4 and the L0 suite, oracle match      | 100% at every level                             | 100% at every level (20 runs)                  |
| referee: rejected runs upheld, the same 57 cases (100 runs)     | 95 of 100                                       | 95 of 100                                      |

- **Calibration.** Claude's suites were calibrated against a reference written
  to pass them; Codex's against the archive's Claude reference with no session
  (`backends.mjs calibrate`: fails on the skeleton, passes the reference), the
  stricter test. The same scripted calibration on Claude's suites keeps 1,361 of
  1,361, as recorded. Of Codex's 676 public tests, 2 fail that reference
  (shift-compliance).
- **Mutants.** `evidence/mutation.mjs` (the archive's `mutate.mjs` on this
  package's runners) samples the mutants from the reference alone, so both
  columns score the identical mutants; the Claude column is the archive's
  `mutation.jsonl`. Codex's mutants equal the archive's one for one on all 26
  specs. Of the public suite's survivors the hidden suite kills 43 of 323
  (Claude: 52 of 352). The harness reproduced the archive mutant for mutant on
  24 of 26 specs (frame-codec: 2 mutants flip on the runner's output cap;
  patch-apply needs the archive's `--max 400`); that run's files were lost with
  a scratch folder, and the command is in `evidence/mutation.mjs`. keyed-queue,
  statement-import and patch-apply were scored under the test processes' memory
  caps (`bin/runners/guard.mjs`), added after two unguarded runs exhausted the
  machine's memory; a capped mutant counts as killed.
- **Ladder.** Codex's L0 suite has none of Claude's R2 misreading; both writers
  guessed at L2. Condition B (Haiku on the vague spec with the L0 suite, this
  package's own-tests brief, 5 runs per level) is 100% on either writer's suite.
- **Referee.** Codex and Claude (Fable 5.1) give the same verdict on 52 of 57
  cases (Codex: 45 required, 12 open; Claude: 46, 11); 93 runs are upheld by
  both, 2 by each alone.
- **Blindness.** Codex runs under `sandbox-exec` over its staged workdir, its
  own sandbox off; on macOS and in Linux (bwrap 0.8 in `node:22`) a negative
  test reads a sibling workdir's hidden test, a spec's `tests/private`, the
  home, `~/.codex/auth.json` and the package from inside and is refused every
  time (`backends.mjs sandbox`, `evidence/backends/sandbox-*.json`). Codex's
  shell looked for `AGENTS.md` in every folder above its workdir; those reads
  were refused too.
- **anthropic-api** ran against a local stand-in for the Messages API only (no
  key here): tool loop, path confinement, sandboxed Bash, transcript, cost,
  resume (`backends.mjs selftest`). A live run is pending.
- **EvalPlus.** The Codex workspace ran out of credits after 6 of the 40
  HumanEval+ tasks; `sh evidence/backends/queue.sh` wrote the other 34 on
  2026-10-27 (`evidence/backends/evalplus-codex-cli.json`). One of Codex's 40
  hidden suites kept nothing (he-76: none of its 44 tests ran on the reference),
  so that task is judged by Codex's public suite alone; without it, 33 of 858
  wrong accepted and 5 of 289 right rejected.

## Other implementers

Codex CLI 0.164.0 (`gpt-6.1-sol`, the person's Codex login) implemented ten of
the archive's core specs five times each, 2026-10-26, each from a handout folder
made by `duediligence handout` (template, spec, skeleton, public suite and
BRIEF.md; nothing hidden) under `sandbox-exec` over that folder, and every run
was graded by `bin/grade.mjs`
([evidence/implementers.mjs](evidence/implementers.mjs),
`evidence/implementers.json`). The specs are imported, not held out: their
suites were published with the archive.

| implementer, on the same ten specs                         | runs | passed | overfit | incomplete | refused |
| ---------------------------------------------------------- | ---: | -----: | ------: | ---------: | ------: |
| Codex CLI, public suite + own tests (this package's brief) |   50 | **50** |       0 |          0 |       0 |
| Haiku 5.5, public suite + own tests (archive, 4 of the 10) |  105 |    100 |       5 |          0 |       0 |
| Haiku 5.5, public suite (archive)                          |  220 |    197 |      23 |          0 |       0 |

- **The specs**: csv-export, licence-scan, patch-apply and tool-versions (where
  the archive has Haiku on this brief), retention-sweep and escrow-split (where
  Haiku overfit), keyed-queue, frame-codec, statement-import, shift-compliance.
  Haiku's overfits were csv-export 9 of 15, tool-versions 8 of 50,
  retention-sweep 4 of 20; Codex passed 5 of 5 on each. A median run took 2.3
  minutes (at most 4.8) and 12 turns; Codex bills its own account.
- **Nothing tampered**: no run changed a test or the harness, and no transcript
  tried to read a hidden path.
- **Provider refusals.** Three sessions ended at once with "Selected model is at
  capacity"; they were run again, and such a refusal now records no run.
- **No model, first.** `implementers.mjs selftest` drives fake agents through
  the same path on the `exec` backend: the reference `passed`, an agent that
  does nothing `incomplete`, a Haiku lookup table `overfit`, an edited public
  test `refused`, and a read of the hidden suite's folder from inside refused by
  the sandbox (`evidence/implementers/selftest.json`).
- **Aider and Cursor's agent** have adapters (`run aider`, `run cursor`);
  neither is installed here, so neither has runs.

On these specs Codex sits at the ceiling where Haiku nearly does, so the cell
shows that the handout, the sandbox and the judge work the same for an agent
that is not Claude, not that the hidden suite catches more of one agent's work
than another's.

## Red team

An adversary told to pass the public suite with the least general code,
hard-coding its inputs where that is shorter (`prompts/agent-red-team.md`,
`bin/run.mjs --brief red-team`), run 2026-10-26 on the archive's specs imported
into `evidence/red-team/`. `bin/red-team-audit.mjs` audits every run that passes
both suites, first with no model: the public tests' string literals the code
repeats that the spec and skeleton do not contain, and the run judged again by
Codex's suites for the same spec (`evidence/backends/specs/`, written blind and
calibrated on the same reference). Then a session on Opus 5.5 reads the spec,
the public suite, the code and the agent's summary, never the hidden suite, and
names each shortcut with an input it gets wrong
(`evidence/red-team/audit.jsonl`).

| adversary, specs                                   | runs | rejected by the hidden suite | passed both | passes failing Codex's suite | passes a session audit calls a shortcut |
| -------------------------------------------------- | ---: | ---------------------------: | ----------: | ---------------------------: | --------------------------------------: |
| Haiku 5.5, the 26 core specs (archive, 2 each)     |   52 |                           28 |          24 |                            5 |                                 not run |
| Opus 5.5, patch-apply and csv-export (10 each)     |   20 |                       **20** |           0 |                            — |                                       — |
| Opus 5.5, gherkin-parse and reverse-diff (10 each) |   20 |                        **0** |          20 |                           17 |                                      18 |

- **The specs** are the four whose suites let the most of the archive's mutants
  survive both suites (patch-apply 44%, reverse-diff 36%, gherkin-parse 35%,
  csv-export 23%): where gaming should pay most. 40 Opus runs cost $8.21, the 20
  audits $4.22.
- **Opus never hard-coded an input** (0 public literals in 40 submissions). It
  wrote small general code, left out the rules no public test reaches, and
  listed them in its summary. On patch-apply and csv-export the hidden suite
  caught the omissions every time. On gherkin-parse and reverse-diff every run
  passed 47 of 47 and 42 of 42 hidden tests; 18 of the 20 leave out a rule the
  audit names with an input it gets wrong (reverse-diff: identifiers inside hunk
  lines left unmapped; gherkin-parse: doc-string indentation, comments, invalid
  lines inside a scenario), 17 fail Codex's suite, and each of the 20 is flagged
  by one or the other. Against a strong adversary the hidden suite did not stop
  gaming on two of these four specs; a second suite written independently caught
  most of what it missed.
- **Haiku, re-audited with no model.** The literal scan flags 11 of the 20 runs
  the archive classified by hand as lookup tables and 0 of its 31 honest runs
  (`runs/_redteam-classes.json`). Codex's suites agree with the hidden suite's
  accept or reject on 45 of 52. Of the 24 passes, all classified honest, 19 pass
  Codex's suites too; 5 fail a Codex test the reference passes, each on a rule
  the spec states (an LRU refresh's position, which the hand classification had
  found; a new or deleted empty file without headers; one separator space after
  a keyword with CRLF; criteria empty once cleaned; unmapped paths in order of
  appearance): bugs the hidden suite missed, not gaming it rewarded.
- No run edited a test or the harness, and no transcript tried to read a hidden
  path (0 of 40).

## Black-box seams

A spec checked at a boundary a test can call instead of its exports: a command
the suites run with `child_process`, or an HTTP service they `fetch`, started by
the judge for each suite under the memory caps and killed with its process group
after (toolchain `exec`, `bin/runners/boundary.mjs`). Checked 2026-10-27 on the
archive's material with no model ([evidence/seams.mjs](evidence/seams.mjs),
`evidence/seams.json`).

**patch-apply as a command.** `import-archive patch-apply --seam exec` converts
the archive's spec by script: each suite imports `boundary.ts`, the skeleton's
types with every function a call to `node src/cli.js applyPatch` (arguments as
JSON on stdin, the result on stdout, an error's message on stderr), so no test
reaches the code but through the command; the stub exits 2, the reference gains
a `src/cli.ts` over its exports. Both seams calibrated by script on the
archive's reference, then judged against `git apply` on the archive's git oracle
corpus (`bin/git-oracle/`, 8,842 cases from real history, one process per case,
1.3 minutes) and on every stored archive submission:

| patch-apply                                                         | at its exports (archive)                       | at a command                    |
| ------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------- |
| hidden tests kept by calibration                                    | 79 of 79                                       | 79 of 79, the same list         |
| the reference, the stub                                             | `passed` 30/30, 79/79; `incomplete` 0/30, 0/79 | the same                        |
| the reference agrees with `git apply`, judged set                   | 7,533 of 7,533                                 | **7,533 of 7,533**              |
| the same, all cases (the rest: a hunk matching at several places)   | 8,789 of 8,842                                 | 8,789 of 8,842, the same 53 off |
| the reference's answer, case by case                                |                                                | 8,842 of 8,842 the module's     |
| the 196 stored submissions: same verdict and failing hidden tests   |                                                | **196 of 196**                  |
| of the 120 with oracle results, passed the hidden suite but not git | 1 (`double-blind-rule-haiku/17`, rename)       | the same 1                      |

**The boundary runner, no model** (`seams.mjs selftest`, `repo-selftest`). On a
hand-made HTTP spec the reference `passed`; a stub answering 501, a service that
never answers (ready timeout), one that exits on its first request and one that
passes the 1 GB ceiling were each `incomplete`, with no process left in the
judge's trees; a judge SIGKILLed while the service was up left neither service
nor runner; the seal judged `passed`; `hiddenSha256` covers the boundary
(changing the healthcheck changes it) and matches the shell recipe. In a
repository: `fit --seam http` supported a TypeScript package whose server
answered in 0.6 s, `repo --seam http` recorded the boundary with no seam files,
and `judge --repo` read base `incomplete` (0/1, 0/2) and the change `passed`
(1/1, 2/2, existing 1/1), from the spec and from a seal.

**One HTTP spec.** `csv-export-http`: the archive's csv-export served as
`POST /requisitions.csv`, confirmed by the phase's agent, not a person; the
hidden writer's one open question (whether an error body may hold keys beyond
`error` and `id`) left open with `--accept-open`. Prepared on Opus 5.5
(`evidence/seams/specs/csv-export-http/`), every test reaching the service with
`fetch`:

| csv-export-http                             | result                                                   |
| ------------------------------------------- | -------------------------------------------------------- |
| prepare: public tests, hidden kept          | 36; 48 of 48, the reference 36/36 and 48/48; $4.31       |
| the stub, the skeleton answering 501        | **`incomplete`**, 0/36, 0/48                             |
| Haiku 5.5, blind, 5 runs                    | **2 `passed`**, 3 `overfit` at 47/48, all on `unhappy-2` |
| the first overfit's retry, told `unhappy-2` | `passed`, 48/48                                          |

- **The three overfits are one real defect.** Each accepts a status sent as
  `["open"]`: `Object.hasOwn(labels, status)` turns the array into the string
  `"open"`, where the spec names four strings. A sixth run's session was killed
  partway by the first version of the session reaper (below); its code passed
  48/48 and is left out of the count. $0.04 per run; no run tried to read a
  hidden path.
- **Sessions leave nothing running.** A writer session started a server in the
  background to try its suite and it outlived the session by seven hours. Every
  session now runs as its own process group, killed when it closes, and anything
  whose working directory is in its workdir, or whose working directory or
  command line names Claude Code's scratch folder for it, is killed after it
  (`lib.mjs killStrays`). The first version also matched the workdir's literal
  path in command lines, which a concurrent session's `claude` names in its deny
  rules: it killed that run. The selftest's fake CLI now leaves three processes
  that `pgrep` no longer finds, beside a concurrent one that survives.
- The earlier account's weekly limit stopped the first hidden writer ($1.56,
  nothing written); `evidence/seams/queue.sh` resumed it.
- **Not yet.** A repository change judged at its service has no writer briefs
  (`prompts/repo/` name seam files); the `anthropic-api` backend's shell has no
  network, so an HTTP spec's suites cannot run inside it. UI through Playwright
  is out of scope.

## Go and Rust

The `go` and `rust` toolchains end to end, 2026-10-28, on the host (Go 1.27.3,
Rust 1.99.1 from Homebrew): duration-parse ported by hand to each, confirmed by
the phase's agent, not a person (`--by "phase-7 agent (not a person)"`),
prepared on Opus 5.5, three blind Haiku 5.5 runs each
(`evidence/languages/specs/`, `evidence/languages/results.jsonl`;
[evidence/languages.mjs](evidence/languages.mjs),
`evidence/languages/queue.sh modules`).

| spec                                  | prepare (Opus 5.5) | public | hidden kept | Haiku 5.5 blind runs        |
| ------------------------------------- | ------------------ | -----: | ----------: | --------------------------- |
| `duration-parse-go`: `(int64, error)` | $1.42, about 6 min |     65 |  159 of 159 | 3 of 3 `passed`, $0.02      |
| `duration-parse-rs`: `Result<u64, _>` | $1.28, about 7 min |     45 |  110 of 110 | 3 of 3 `passed`, $0.01–0.02 |

- **Mutants, no model** (`languages.mjs mutants`): 40 one-token mutants of each
  reference (an operator flipped, a literal moved by one, by text: mutation.mjs
  reads TypeScript's syntax tree only), judged as submissions. Go: the public
  suite killed 39 of 40, the one left is equivalent (`u := -1` to `-2`, a
  sentinel nothing reads as a number). Rust: 38 built, the public suite killed
  all 38. On this spec the public suite leaves the hidden one nothing to find.
- Every session ran `go` or `cargo` inside Claude Code's sandbox with no change
  to either toolchain. No run tried to read a hidden path.

## Commands and services in other languages

A command or service written in Python, Go or Rust (toolchain `exec` with
`boundary.language`; lib.mjs `NATIVE`): the suites stay TypeScript on
`node:test` and reach the code only through the boundary, the tree is the node
template plus `go.mod` or `Cargo.toml`, and `sandbox/build.mjs`
(`bin/runners/native-build.mjs`) builds the suites and then `src/` for
`npm run build`, the judge's runner and a service's start alike. Briefs:
`prompts/exec-native/`, `prompts/http-native/`. Checked 2026-10-28.

**Selftest, no model** (`languages.mjs selftest`, 43 checks). A hand-made
command and service in each language, its suites calibrated by script: the
reference `passed`, the stub `incomplete`, a submission tuned to the public test
`overfit`, one that does not build `incomplete` and not compiled; the staged
tree's own `npm run build` passes on the stub and `npm test` fails; what the
build leaves (`.bin/`, `target/`, `Cargo.lock`, `__pycache__`) is never a
change; no service left running; every brief renders with no TypeScript
contract in it. The TypeScript seams' selftest and the package's smoke test
still pass.

**The seams' two specs, ported** (`languages.mjs port`). csv-export-http (a
service) and patch-apply-cli (a command) for each language: the same spec but
the command line in its interface paragraph, the same public and hidden tests
(csv-export-http's contract types moved from `src/server.ts` into
`tests/*/contract.ts`), a stub written by script. Only the reference is new: an
Opus 5.5 session per port writes it in the language and calibration runs on it
(`calibrate.mjs`), then three Haiku runs each (`queue.sh seams`).

| port                    | reference (Opus 5.5) | hidden kept | Haiku 5.5 blind runs                                     |
| ----------------------- | -------------------- | ----------: | -------------------------------------------------------- |
| csv-export-http, Python | $0.41, 1.2 min       |    48 of 48 | 3 of 3 `passed`, $0.04–0.05                              |
| csv-export-http, Go     | $0.75, 2.5 min       |    48 of 48 | 2 `passed`, 1 `overfit` 47/48 on `unhappy-2`, $0.04–0.05 |
| csv-export-http, Rust   | $0.86, 2.3 min       |    48 of 48 | 2 `passed`, 1 `overfit` 47/48 on `happy-1`, $0.09–0.19   |
| patch-apply-cli, Python | $0.83, 2.8 min       |    79 of 79 | 3 of 3 `passed`, $0.05–0.08                              |
| patch-apply-cli, Go     | $0.99, 3.5 min       |    79 of 79 | 3 of 3 `passed`, $0.10–0.27                              |
| patch-apply-cli, Rust   | $1.13, 4.0 min       |    79 of 79 | 3 of 3 `passed`, $0.06–0.13                              |

- **Every hidden test the TypeScript reference kept, each language's reference
  passes**, and every one fails on each stub: 48 and 79 kept of 48 and 79, six
  times. No suite file changed but csv-export-http's import line, beside its
  added `contract.ts`.
- **Against `git apply`** (`languages.mjs oracle`; the archive's corpus, 8,842
  cases from real history): the Python, Go and Rust references agree with git
  on 7,533 of 7,533 judged cases and on 8,789 of 8,842 in all, the same 53 off
  as the TypeScript reference (a hunk matching at several places), and give the
  TypeScript command's answer on 8,842 of 8,842, case by case. They are 360,
  548 and 840 lines, and start no other process.
- **The Rust overfit is a real defect.** It cuts creation times to whole
  milliseconds ("as Date.parse cuts them", its comment says), so two
  requisitions created 0.1 ms apart sort by id; the spec orders by creation
  time and allows any fractional seconds.
- **The Go overfit is a judge defect the port exposed.** A hidden test expects
  `"openings": 1e400` to be refused as infinite, as JavaScript's `JSON.parse`
  reads it. The spec says only "a whole number of at least 0"; the Go run reads
  `1e400` exactly, as the integer 10^400, and accepts it. Written against a
  TypeScript reference, the hidden suite carried a JavaScript reading of an
  open question into every language; the three new references passed it, as
  the reference session sees both suites. Counted as it is graded, 16 of 18 `passed`; with
  that test left open, 17 of 18.
- **Mutants, no model**, 30 per reference:

  | port                    | built | public kills | hidden only | survive both |
  | ----------------------- | ----: | -----------: | ----------: | -----------: |
  | csv-export-http, Python |    30 |           21 |           5 |            4 |
  | csv-export-http, Go     |    29 |           19 |           5 |            5 |
  | csv-export-http, Rust   |    30 |           22 |           4 |            4 |
  | patch-apply-cli, Python |    30 |           21 |           0 |            9 |
  | patch-apply-cli, Go     |    30 |           15 |           0 |           15 |
  | patch-apply-cli, Rust   |    30 |           18 |           0 |           12 |

  On csv-export-http the hidden suite kills about half of what the public one
  leaves: 5 of 9, 5 of 10, 4 of 8. On patch-apply it kills none, so
  every mutant both suites passed was run on the git corpus
  (`languages.mjs oracle-survivors`): 34 of the 36 answer all 8,842 real cases
  as their reference does, so they never show on real history, most likely
  equivalent (not checked one by one). Two are real misses:
  in Python, `start + delta` turned to `start - delta` carries the wrong offset
  into a file's later hunks (52 cases differ); in Go, a `new file mode` line
  read only after the file's first hunk (4 cases). Both suites pass both.

## What it does not show

- **That agents often overfit visible tests.** On precise specs every arm is at
  or near the ceiling: 3 real overfits in 230 regraded runs, and the public
  suite separated the arms on 1 spec of 14 (patch-apply, 20 of 20 against 7 and
  5 of 20).
- **That a drafted spec can go unchecked.** Drafted from the ticket alone, a
  spec decided otherwise than the person's on 4 of 7 tickets; 16 of 18 drafts
  had at least one decision changed on confirmation.
- **That the public suite helps inside a repository.** 55 of 55 against 55 of 55
  on confirmed specs; 25 of 25 against 24 of 25 on ufo, 30 of 30 against 30 of
  30 on pathe.
- **Much about existing codebases.** Eleven changes from one repository written
  by one small team with Claude, and a handful each from two small utility
  libraries whose commits are one-line subjects; every confirmation by a
  simulated developer.
- **That the hidden suite stops a determined adversary.** Opus 5.5 told to game
  passed it on two of four specs while leaving rules out
  ([Red team](#red-team)). It is an acceptance test of what the spec states; a
  second, independently written suite caught most of what it missed.
- **That other agents need it more or less than Haiku.** Codex passed 50 of 50
  on ten archive specs whose suites it could have seen, since they were
  published.
- **Much about the other runners.** One prepared module each in Python, Go and
  Rust (the same spec, duration-parse) and one Jest repository spec, all passed
  by Haiku on every run, so none separates anything; pytest repositories only
  on hand-made fixtures, never prepared by a model.
- **Much about black-box seams.** Two archive specs, a command and a service,
  each run in four languages: one suite per spec, written once against a
  TypeScript reference, so a suite written for Python, Go or Rust from the start
  is untested, and that suite carried one JavaScript reading of an open
  question into the others. 23 Haiku runs at a seam in all; Windows untested
  for the Python, Go and Rust builds.
- **Problems newer than the model.** LiveCodeBench v6 predates the cutoff and
  every arm solved all 37 sound problems; the ladder's L3 and L4 levels there
  measure what Opus remembers, not the spec.

## Cost

Preparing a spec is four Opus 5.5 sessions, about $1–4 (median $2) and 10–25
minutes. In a repository it was $1.92–6.99 (median $2.74 on the confirmed specs)
and 10–25 minutes; a developer's confirmation session $0.24–1.48. An agent run
is a few cents on Haiku 5.5 (median $0.02 and 1.8 minutes in a repository),
about $0.30 on Opus. Dollar figures are the CLI's estimates; the sessions bill
the signed-in subscription. The person's confirmation is the other cost: person
minutes per spec, from the first listing of the decisions to `confirm --by`, are
recorded from 2026-10-26 on; median pending.
