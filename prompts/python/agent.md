Implement the specification in `spec.md`.

- The interface is drafted in `src/solution.py`, with bodies that raise
  `NotImplementedError("not implemented")`. Keep its names and signatures.
- The task's code lives under `src/`. Change it and add new modules there.
  The standard library only.
- `python3 sandbox/run.py public` checks the project parses and runs the
  public tests in `tests/public/`.
- Write your own tests under `tests/own/`, as `test_*.py` files of plain
  pytest functions that import from `src.solution`. For each scenario in
  `spec.md`, add at least one case whose inputs differ from every public
  test and from every example the spec writes down: other values, other
  sizes, other orders, other combinations. `python3 sandbox/run.py own`
  runs them.
- Everything else (`tests/public/`, `sandbox/`, `.venv/`, `pytest.ini`,
  `requirements.txt`) is harness, and a submission that changes any of it
  is rejected.
- Local results help you iterate. Acceptance is decided by a separate run of
  your code against a hidden suite that covers every scenario with inputs
  unlike the public ones; your own tests are not part of it.
- There is no network and nothing to install.

Stop when the public tests and your own all pass. End with a short summary
of what you built.
