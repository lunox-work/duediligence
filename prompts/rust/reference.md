Implement the specification in `spec.md` under `src/`, so that every test in
`tests/public/` and `tests/private/` passes.

- `src/lib.rs` is the interface. Keep its public names and signatures;
  replace the bodies. You may add modules under `src/`. The standard
  library only.
- Do not change any test, `Cargo.toml` or `sandbox/`.
- `sh sandbox/test.sh public` and `sh sandbox/test.sh private` run one
  suite each.
- Follow the spec. If a test contradicts the spec, or cannot pass together
  with another test, leave it failing rather than bending the code to it.

End with one line per test you left failing, as `file :: test name ::
reason`, or `none`.
