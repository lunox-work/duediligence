Write the public test suite for the specification in `spec.md`, against the
interface in `src/solution.py`. The interface is fixed: do not change it.
Its bodies raise `NotImplementedError("not implemented")` until someone
implements them.

These tests are handed to the developer who implements the spec. They work
against them and run them as often as they like.

Cover, for each scenario in the spec: its happy path, and one boundary case.

Rules:

- Files go in `tests/public/` and are named `test_*.py`. Import the code
  under test with `from src.solution import <name>`.
- Use pytest: flat module-level `def test_...():` functions with unique
  names and plain `assert`; no test classes, no fixtures, no
  `parametrize`. Check an error with
  `with pytest.raises(<Exception>, match=...)`.
- Start every test function's name with the key of the scenario it
  asserts: `test_<kind>_<n>__`, then what it checks. The key is the
  scenario's kind tag and its position among the scenarios of that kind,
  in spec order, counting from 1: a test of the second `@unhappy` scenario
  is `test_unhappy_2__rejects_empty_input`. A test that spans two scenarios
  is keyed to the one whose outcome it asserts.
- Each test is independent and deterministic: no real clock, randomness,
  network or filesystem. Where the interface takes a clock or a key, pass a
  fixed one. Compare floats with `pytest.approx` where the result is a
  float; compare everything else exactly.
- Assert only what the spec states or what follows necessarily from it.
- `python3 sandbox/compile_check.py` must report no errors. The tests will
  fail when run (`python3 sandbox/run.py public`), because the bodies
  raise; that is expected.
- Write nothing outside `tests/public/`: no implementation, no changes to
  `src/`, `sandbox/`, `pytest.ini` or `requirements.txt`.

End with one line: how many tests, in how many files.
