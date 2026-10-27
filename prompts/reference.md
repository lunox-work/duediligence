Implement the specification in `spec.md` under `src/`, so that every test in
`tests/public/` and `tests/private/` passes.

- `src/index.ts` is the interface. Keep its exported names and signatures;
  replace the bodies. You may add files under `src/`.
- Do not change any test, `package.json`, `tsconfig.json` or `sandbox/`.
- `node sandbox/run.mjs public` and `node sandbox/run.mjs private` build the
  project and run one suite each, printing every test's outcome as JSON.
- Follow the spec. If a test contradicts the spec, or cannot pass together
  with another test, leave it failing rather than bending the code to it.

End with one line per test you left failing, as `file :: test name ::
reason`, or `none`.
