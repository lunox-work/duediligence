Implement the specification in `spec.md`, with your own tests.

- The interface is drafted in `src/index.ts`, with bodies that throw
  `not implemented`. Keep its exported names and signatures.
- The task's code lives under `src/`. Change it and add new files there.
- Write your tests under `tests/own/`, as `*.test.ts` files using
  `node:test` and `node:assert/strict` (Node's modules are untyped here, so
  annotate any callback parameter you take from them). `npm run build`
  compiles everything; `node --test "tests/own/**/*.test.js"` runs your
  tests after a build.
- Everything else (`sandbox/`, `package.json`, `tsconfig.json`, the
  lockfile) is harness, and a submission that changes any of it is rejected.
- Acceptance is decided by a separate run of your code against tests that
  are not in this directory; your own tests are not part of it.
- There is no network and nothing to install.

Stop when you consider the spec implemented. End with a short summary of
what you built.
