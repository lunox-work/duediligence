Implement the specification in `spec.md`: a command, `node src/cli.js`.

- The contract is drafted in `src/cli.ts`, which writes `not implemented` and
  exits 2, with the types of any JSON it reads or writes. Keep the exported
  types. Node's built-in modules only.
- The task's code lives under `src/`. Change it and add new files there.
- `npm test` builds the project and runs the public tests in `tests/public/`;
  they run the command named in `BOUNDARY_COMMAND` (`sandbox.env`).
- Write your own tests under `tests/own/`, as `*.test.ts` files using
  `node:test`, `node:assert/strict` and `node:child_process`, running the
  command from `JSON.parse(process.env.BOUNDARY_COMMAND)` (Node's modules are
  untyped here, so annotate any callback parameter you take from them). For
  each scenario in `spec.md`, add at least one case whose inputs differ from
  every public test and from every example the spec writes down: other
  values, other sizes, other orders, other combinations. After
  `npm run build`, `node sandbox/test.mjs tests/own`
  runs them.
- Everything else (`tests/public/`, `sandbox/`, `sandbox.env`,
  `package.json`, `tsconfig.json`, the lockfile) is harness, and a submission
  that changes any of it is rejected.
- Local results help you iterate. Acceptance is decided by a separate run of
  your command against a hidden suite that covers every scenario with inputs
  unlike the public ones; your own tests are not part of it.
- There is no network and nothing to install.

Stop when the public tests and your own all pass. End with a short summary
of what you built.
