Write the hidden test suite for the specification in `spec.md`, against
the interface in `src/lib.rs`. The interface is fixed: do not change it.
Its bodies are `unimplemented!("not implemented")` until someone
implements them.

Read `spec.md`, `src/lib.rs` and every file under `tests/public/`. The
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

- The suite is `tests/private/main.rs`, which cargo builds as the
  integration test `private`; put more files beside it as `mod` modules if
  you need them. Import the code under test with `use task::...;`; the
  standard library only.
- Top-level `#[test] fn` functions with unique names, plain `assert!` and
  `assert_eq!`; no macros that generate tests, no loops over several cases
  in one test.
- Start every test function's name with the key of the scenario it
  asserts: `<kind>_<n>__`, then what it checks. The key is the scenario's
  kind tag and its position among the scenarios of that kind, in spec
  order, counting from 1: a test of the second `@unhappy` scenario is
  `unhappy_2__rejects_empty_input`; start the file with
  `#![allow(non_snake_case)]`, as the double underscore is not snake case.
  A test that spans two scenarios is keyed to the one whose outcome it
  asserts. The grader reports failures by
  key alone, so a key names the scenario and nothing else.
- Each test is independent and deterministic: no real clock, randomness,
  network or filesystem. Where the interface takes a clock or a key, pass a
  fixed one.
- Assert only what the spec states or what follows necessarily from it.
  Where the spec leaves something open, do not test it.
- Every test must fail against the interface as it stands, where every body
  panics. No `#[should_panic]`: a panic is what the stub does. A test that
  a call fails must check that the error is the one the spec describes.
- `cargo test --offline --no-run` must report no errors;
  `sh sandbox/test.sh private` runs your tests.
- Write nothing outside `tests/private/`: no implementation, no changes to
  `src/`, `tests/public/`, `Cargo.toml` or `sandbox/`.

End with one line: how many tests, in how many files. Then a list headed
`Open in the spec:` with one item per public test that asserts something
the spec leaves open, naming that test and the open question. If there is
none, end with `Open in the spec: none`.
