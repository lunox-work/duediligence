Implement the specification in `spec.md` under `src/`, as the command
`node src/cli.js`, so that every test in `tests/public/` and `tests/private/`
passes.

- `src/cli.ts` is the contract: the program the command runs, and the types
  it exports. Keep the exported types; replace the `not implemented` exit. You
  may add files under `src/`. Node's built-in modules only.
- Do not change any test, `package.json`, `tsconfig.json`, `sandbox.env` or
  `sandbox/`.
- `node sandbox/run.mjs public` and `node sandbox/run.mjs private` build the
  project and run one suite each, printing every test's outcome as JSON.
- Follow the spec. If a test contradicts the spec, or cannot pass together
  with another test, leave it failing rather than bending the code to it.

End with one line per test you left failing, as `file :: test name ::
reason`, or `none`.
