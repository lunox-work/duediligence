Write the public test suite for the specification in `spec.md`, against the
interface in `src/lib.rs`. The interface is fixed: do not change it. Its
bodies are `unimplemented!("not implemented")` until someone implements
them.

These tests are handed to the developer who implements the spec. They work
against them and run them as often as they like.

Cover, for each scenario in the spec: its happy path, and one boundary case.

Rules:

- The suite is `tests/public/main.rs`, which cargo builds as the
  integration test `public`; put more files beside it as `mod` modules if
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
  asserts.
- Each test is independent and deterministic: no real clock, randomness,
  network or filesystem. Where the interface takes a clock or a key, pass a
  fixed one.
- Assert only what the spec states or what follows necessarily from it.
- `cargo test --offline --no-run` must report no errors. The tests will
  fail when run (`sh sandbox/test.sh public`), because the bodies panic;
  that is expected.
- Write nothing outside `tests/public/`: no implementation, no changes to
  `src/`, `Cargo.toml` or `sandbox/`.

End with one line: how many tests, in how many files.
