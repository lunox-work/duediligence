Write the public test suite for the specification in `spec.md`, against the
interface in `src/task.go`. The interface is fixed: do not change it. Its
bodies `panic("not implemented")` until someone implements them.

These tests are handed to the developer who implements the spec. They work
against them and run them as often as they like.

Cover, for each scenario in the spec: its happy path, and one boundary case.

Rules:

- Files go in `tests/public/` and end in `_test.go`, `package public`.
  Import the code under test as `task "task/src"`; use the standard
  `testing` package only.
- Top-level `func Test...(t *testing.T)` functions with unique names; no
  `t.Run` subtests, no table loops over several cases in one test.
- Start every test function's name with the key of the scenario it
  asserts: `Test_<kind>_<n>__`, then what it checks. The key is the
  scenario's kind tag and its position among the scenarios of that kind,
  in spec order, counting from 1: a test of the second `@unhappy` scenario
  is `Test_unhappy_2__RejectsEmptyInput`. A test that spans two scenarios
  is keyed to the one whose outcome it asserts.
- Each test is independent and deterministic: no real clock, randomness,
  network or filesystem. Where the interface takes a clock or a key, pass a
  fixed one.
- Assert only what the spec states or what follows necessarily from it.
- `go vet ./...` must report no errors. The tests will fail when run
  (`sh sandbox/test.sh public`), because the bodies panic; that is
  expected.
- Write nothing outside `tests/public/`: no implementation, no changes to
  `src/`, `go.mod` or `sandbox/`.

End with one line: how many tests, in how many files.
