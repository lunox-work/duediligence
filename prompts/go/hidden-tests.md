Write the hidden test suite for the specification in `spec.md`, against
the interface in `src/task.go`. The interface is fixed: do not change it.
Its bodies `panic("not implemented")` until someone implements them.

Read `spec.md`, `src/task.go` and every test under `tests/public/`. The
public suite is what the developer who implements the spec iterates
against; they run it as often as they like and never see this suite. This
suite exists to fail an implementation that passes the public suite
without satisfying the spec.

Cover:

- every scenario in the spec, and every scenario kind it uses (happy,
  boundary, unhappy, and any others it tags);
- for each public test, at least one test the public test does not
  exercise: other values, larger sizes, other orders, other combinations,
  longer inputs, more items. Name the public test it extends in the test
  name or in a comment above it;
- every boundary and unhappy scenario the public suite skips;
- the test an implementation tuned to the public suite would fail. For
  each public test, ask what shortcut passes the visible cases, and write
  the case that shortcut gets wrong.

Where the public suite asserts something the spec leaves open, do not test
it either way. Note it for the list at the end.

Rules:

- Files go in `tests/private/` and end in `_test.go`, `package private`.
  Import the code under test as `task "task/src"`; use the standard
  `testing` package only.
- Top-level `func Test...(t *testing.T)` functions with unique names; no
  `t.Run` subtests, no table loops over several cases in one test.
- Start every test function's name with the key of the scenario it
  asserts: `Test_<kind>_<n>__`, then what it checks. The key is the
  scenario's kind tag and its position among the scenarios of that kind,
  in spec order, counting from 1: a test of the second `@unhappy` scenario
  is `Test_unhappy_2__RejectsEmptyInput`. A test that spans two scenarios
  is keyed to the one whose outcome it asserts. The grader reports failures
  by key alone, so a key names the scenario and nothing else.
- Each test is independent and deterministic: no real clock, randomness,
  network or filesystem. Where the interface takes a clock or a key, pass a
  fixed one. You may compute expected values with the standard library (for
  example `crypto/sha256`) when the spec defines a result that way.
- Assert only what the spec states or what follows necessarily from it.
  Where the spec leaves something open, do not test it.
- Every test must fail against the interface as it stands, where every body
  panics. A test that a call fails must check that the error is the one the
  spec describes (its message, or what it names), not just that one was
  returned.
- `go vet ./...` must report no errors; `sh sandbox/test.sh private` runs
  your files.
- Write nothing outside `tests/private/`: no implementation, no changes to
  `src/`, `tests/public/`, `go.mod` or `sandbox/`.

End with one line: how many tests, in how many files. Then a list headed
`Open in the spec:` with one item per public test that asserts something
the spec leaves open, naming that test and the open question. If there is
none, end with `Open in the spec: none`.
