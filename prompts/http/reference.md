Implement the specification in `spec.md` under `src/`, as an HTTP service,
so that every test in `tests/public/` and `tests/private/` passes.

- `src/server.ts` is the contract: the server it starts, listening on
  `Number(process.env.PORT)` at `process.env.HOST ?? "127.0.0.1"`, and the
  types it exports. Keep the port, the host and the exported types; replace
  the 501 answers. You may add files under `src/`. `node:http` and Node's
  other built-in modules only.
- Do not change any test, `package.json`, `tsconfig.json`, `sandbox.env` or
  `sandbox/`.
- `node sandbox/boundary.mjs -- node sandbox/run.mjs public` and
  `node sandbox/boundary.mjs -- node sandbox/run.mjs private` build the
  project, start the service from `src/server.js`, and run one suite each
  against it, printing every test's outcome as JSON.
- Follow the spec. If a test contradicts the spec, or cannot pass together
  with another test, leave it failing rather than bending the code to it.

End with one line per test you left failing, as `file :: test name ::
reason`, or `none`.
