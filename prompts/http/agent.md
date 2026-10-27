Implement the specification in `spec.md`: an HTTP service.

- The contract is drafted in `src/server.ts`: a server on
  `Number(process.env.PORT)` at `process.env.HOST ?? "127.0.0.1"` that
  answers 501 to everything, and the types of the JSON bodies. Keep the port,
  the host and the exported types. `node:http` and Node's other built-in
  modules only.
- The task's code lives under `src/`. Change it and add new files there.
- `node sandbox/boundary.mjs -- npm test` builds the project, starts your
  service from `src/server.js` and runs the public tests in `tests/public/`
  against it (they read its address from `BOUNDARY_URL`); the service is
  stopped after.
- Write your own tests under `tests/own/`, as `*.test.ts` files using
  `node:test`, `node:assert/strict` and `fetch` against
  `process.env.BOUNDARY_URL` (Node's modules are untyped here, so annotate any
  callback parameter you take from them). For each scenario in `spec.md`, add
  at least one case whose inputs differ from every public test and from every
  example the spec writes down: other values, other sizes, other orders,
  other combinations. `node sandbox/boundary.mjs -- node sandbox/test.mjs tests/own`
  runs them.
- Everything else (`tests/public/`, `sandbox/`, `sandbox.env`,
  `package.json`, `tsconfig.json`, the lockfile) is harness, and a submission
  that changes any of it is rejected.
- Local results help you iterate. Acceptance is decided by a separate run of
  your service against a hidden suite that covers every scenario with inputs
  unlike the public ones; your own tests are not part of it.
- There is no outside network and nothing to install; the service listens
  on 127.0.0.1 only.

Stop when the public tests and your own all pass. End with a short summary
of what you built.
