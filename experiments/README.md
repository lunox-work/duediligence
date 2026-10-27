# double-blind: the experiment

The runs, data and write-ups behind the `independent-tests` skill, which
lives in [../independent-tests](../independent-tests/) and was called
double-blind while this experiment ran. This folder is the archive: 26
TypeScript specs, the LiveCodeBench and HumanEval+ pilots, the spec ladder,
every arm, brief and mechanism tried, and the scripts that ran them.
Nothing here is needed to run the skill.

- [EXPERIMENT.md](EXPERIMENT.md): the method, the parties, the verdicts,
  the arms and the tools.
- [FINDINGS.md](FINDINGS.md): dated results, newest conclusions in the
  Summary on top.
- [ladder/README.md](ladder/README.md): the spec-ladder pilot, judged by
  oracles no model wrote.
- [../independent-tests/RESULTS.md](../independent-tests/RESULTS.md): the skill's
  summary of these results.

## Reading the data

- `results.jsonl`: one line per graded run, verdict and counts only. 708
  of its 3,230 rows are sessions that never ran: the `claude` CLI lost its
  login on 2026-10-24 about 16:50 and every later session returned "Not
  logged in" in 0.1 s. They have `agent.ok === false` and `turns: 1`;
  filter them before counting ([Follow-ups](FINDINGS.md#follow-ups)).
- `results-blind.jsonl`: the first 230 runs graded by the blind hidden
  suites (`specs/*/tests/private-blind/`), kept for comparison.
- `classifications.json`: every overfit classed by hand, `real`,
  `spec-gap` or `judge-defect`.
- `acceptance.jsonl`, `referee.jsonl`: agents' own tests rerun on their
  code and on the reference; a blind referee's ruling on each disagreement.
- `mutation.jsonl`, `evalplus-results.json`: mutants judged by both suites;
  HumanEval+ solutions judged by generated suites.
- `ladder/results.jsonl`: the spec-ladder runs, scored against the oracles.
- `runs/` is gitignored: transcripts, diffs, submissions and grade.json
  per run.

## Running it again

```sh
cd template && npx -y npm@10.9.2 ci && cd ..
node bin/generate.mjs <slug> && node bin/calibrate.mjs <slug>
node bin/run.mjs <slug> --arm double-blind --model haiku --runs 3
node bin/grade.mjs <slug> && node bin/report.mjs
```

Arms, briefs, the Python toolchain and the other tools are in
[EXPERIMENT.md](EXPERIMENT.md). The scripts share `bin/lib.mjs`; the
skill's scripts are a trimmed copy of the same code.
