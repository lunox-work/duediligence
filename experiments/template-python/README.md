# Python task template

Toolchain for a LiveCodeBench problem: CPython 3 from PATH, `unittest`,
no packages, no network. `sandbox/` is the harness and is never part of
a submission.

- `src/main.py` (stdin problems) or `src/solution.py` (`class Solution`)
  is the one file acceptance runs.
- `tests/public/test_*.py` is the public suite; `tests/private/` the
  hidden one, present only where the grader stages it.
- `python3 sandbox/run.py public` runs a suite and prints JSON;
  `python3 sandbox/exec.py < input` runs the program as acceptance does;
  `python3 sandbox/compile_check.py` parses everything.
- `sandbox/lcb/` is the benchmark's checker, verbatim (`UPSTREAM`).
