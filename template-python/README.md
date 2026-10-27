# Python task template

The `python` toolchain: CPython 3 from PATH (`INDEPENDENT_TESTS_PYTHON`),
pytest pinned in `requirements.txt` and installed into `.venv/` on first
use, no other packages, no network. `sandbox/` is the harness and is never
part of a submission.

- `src/solution.py` is the interface both suites import
  (`from src.solution import ...`); a LiveCodeBench stdin problem uses
  `src/main.py`.
- `tests/public/test_*.py` is the public suite; `tests/private/` the hidden
  one, present only where the grader stages it; `tests/own/` the agent's.
- `python3 sandbox/run.py public` runs a suite and prints JSON;
  `python3 sandbox/compile_check.py` parses everything;
  `.venv/bin/python -m pytest tests/own` runs pytest directly.
- `sandbox/independent_tests_reporter.py` is the pytest plugin both
  `sandbox/run.py` and `bin/runners/pytest.mjs` read results from. A test
  named `test_<kind>_<n>__...` is keyed to that spec scenario.
- `sandbox/check.py`, `sandbox/exec.py`, `sandbox/lcb/` serve imported
  LiveCodeBench problems: the benchmark's checker, verbatim (`UPSTREAM`).
