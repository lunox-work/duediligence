Implement the specification in `spec.md`.

- The interface is drafted in `src/index.ts`, with bodies that throw
  `not implemented`. Keep its exported names and signatures.
- The task's code lives under `src/`. Change it and add new files there.
- `npm test` builds the project and runs the public tests in `tests/public/`.
- Write your own tests under `tests/own/`, as `*.test.ts` files using
  `node:test` and `node:assert/strict` (Node's modules are untyped here, so
  annotate any callback parameter you take from them). For each scenario in
  `spec.md`, add at least one case whose inputs differ from every public
  test and from every example the spec writes down: other values, other
  sizes, other orders, other combinations. After `npm run build`,
  `node --test "tests/own/**/*.test.js"` runs them.
- Everything else (`tests/public/`, `sandbox/`, `package.json`,
  `tsconfig.json`, the lockfile) is harness, and a submission that changes
  any of it is rejected.
- Local results help you iterate. Acceptance is decided by a separate run of
  your code against a hidden suite that covers every scenario with inputs
  unlike the public ones; your own tests are not part of it.
- There is no network and nothing to install.

Stop when the public tests and your own all pass. End with a short summary
of what you built.
