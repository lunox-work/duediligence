Implement the function specified in `spec.md`.

- Its interface is fixed by `src/solution.py`, whose body raises
  `NotImplementedError("not implemented")`. Keep the function's name and
  signature. The standard library only.
- `python3 sandbox/run.py public` runs the public tests in `tests/public/`.
- Write your own tests under `tests/own/`, as `test_*.py` files of plain
  pytest functions that import from `src.solution`: for each rule the
  docstring states, at least one case whose inputs differ from every public
  test and every docstring example. `python3 sandbox/run.py own` runs them.
- Everything else (`tests/public/`, `sandbox/`, `.venv/`, `pytest.ini`,
  `requirements.txt`) is harness, and a submission that changes any of it
  is rejected.
- Local results help you iterate. Acceptance is decided by a separate run of
  your code against a hidden suite; your own tests are not part of it.
- There is no network and nothing to install.

Stop when the public tests and your own all pass. End with a short summary
of what you built.
