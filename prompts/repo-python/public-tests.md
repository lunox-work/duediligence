Write the public test suite for the specification in `spec.md`, against the
interface at {{seam}}. This folder is a copy of an existing repository at one
commit, with its dependencies installed in `.venv/`. The interface is fixed:
do not change it. Its new bodies raise
`NotImplementedError("not implemented")` until someone implements them.

These tests are handed to the developer who implements the spec in this
repository. They work against them and run them as often as they like.

Cover, for each scenario in the spec: its happy path, and one boundary case.

Rules:

- One file, `{{publicDir}}/{{publicName}}`. Import the code under test by
  its module: `from {{import}} import <name>`.
- Read the existing tests nearest the seam first: {{examples}}. Use the
  assertions, imports, fixtures and helpers they use. Flat module-level
  `def test_...():` functions with unique names; no test classes, even
  where those files use them.
- Start every test function's name with the key of the scenario it
  asserts: `test_<kind>_<n>__`, then what it checks. The key is the
  scenario's kind tag and its position among the scenarios of that kind,
  in spec order, counting from 1: a test of the second `@unhappy` scenario
  is `test_unhappy_2__rejects_empty_input`. A test that spans two scenarios
  is keyed to the one whose outcome it asserts.
- Each test is independent and deterministic: no real clock, randomness,
  network or filesystem. Where the interface takes a clock or a key, pass a
  fixed one.
- Assert only what the spec states or what follows necessarily from it.
- `{{testPublic}}` runs your file; it fails, because the bodies raise. That
  is expected.
- Write nothing but your test file: no implementation, no changes to the
  seam, to other tests, to `pyproject.toml`, the lockfile, any `conftest.py`
  or any config.

End with one line: how many tests, in how many files.
