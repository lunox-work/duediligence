# Rust task template

The `rust` toolchain: cargo and rustc from PATH (edition 2021), the
standard library only, no network. `Cargo.toml` names the crate `task`;
`sandbox/` is the harness and is never part of a submission.

- `src/lib.rs` is the interface both suites import (`use task::...`).
- `tests/public/main.rs` is the public suite, an integration test cargo
  names `public` (other files there are its modules); `tests/private/` the
  hidden one, present only where the grader stages it; `tests/own/` the
  agent's.
- `sh sandbox/test.sh public` runs a suite; `cargo test --offline --no-run`
  checks everything compiles.
- A test function named `<kind>_<n>__...` is keyed to that spec scenario.
  libtest catches each test's panic, so `unimplemented!()` fails one test.
