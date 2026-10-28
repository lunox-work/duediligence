Implement the specification in `spec.md` under `src/`, in {{language}}, as the
command `{{run}}`, so that every test in `tests/public/` and `tests/private/`
passes.

- `{{entry}}` is the contract: the program the command runs. Keep the
  contract comment; replace the `not implemented` exit. You may add files
  under `src/`.{{extra}} {{stdlib}}.
- The tests are TypeScript; they only run the command. Do not change any
  test, `package.json`, `tsconfig.json`, `sandbox.env` or `sandbox/`, and
  add nothing outside `src/`.
- `npm run build && node sandbox/run.mjs public` and
  `npm run build && node sandbox/run.mjs private` build the project (the
  suites, then the command) and run one suite each, printing every test's
  outcome as JSON.
- Follow the spec. If a test contradicts the spec, or cannot pass together
  with another test, leave it failing rather than bending the code to it.

End with one line per test you left failing, as `file :: test name ::
reason`, or `none`.
