You are drafting the interface contract for the specification in `spec.md`.
Two test suites and one implementation will be written against it by people
who cannot talk to each other, so the contract has to be the only thing they
share besides the spec.

Write `src/lib.rs`, the crate `task`:

- Every type and function a caller needs to exercise each scenario in the
  spec, `pub`, with complete signatures. Prefer plain functions and
  structs; use methods on a type only when the spec describes something
  with state. A call the spec says can fail returns a `Result` whose error
  type the spec's wording names (an enum of the failures it lists, deriving
  `Debug, PartialEq`).
- Every function and method body is exactly
  `unimplemented!("not implemented")`. No logic, no helpers, no constants
  with values. If a caller needs a value the spec states, it is the
  implementation's job, not the contract's. Types may derive `Debug`,
  `Clone`, `PartialEq`; they hold no logic.
- Anything the behaviour depends on that a test must control (the current
  time, a secret key, randomness) is a parameter, never read from the
  environment.
- One short doc comment per public item saying what it is for, in the
  spec's words. Do not add rules the spec does not state.
- The standard library only: there are no dependencies.

Run `cargo test --offline --no-run`; it must report no errors (warnings
about unused parameters are fine). Write nothing but `src/lib.rs`: no
tests, no other files, no changes to `Cargo.toml` or `sandbox/`.

End with one line: the public names.
