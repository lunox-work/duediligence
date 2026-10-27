Write the public test suite for the specification in `spec.md`, against the
HTTP service whose contract is `src/server.ts`. The contract is fixed: do not
change it. Until someone implements it, the service answers every request
with 501.

These tests are handed to the developer who implements the spec. They work
against them and run them as often as they like.

Cover, for each scenario in the spec: its happy path, and one boundary case.

Rules:

- The service is reached only over HTTP. Its base URL is
  `process.env.BOUNDARY_URL`; call it with the global `fetch`, as in
  `await fetch(new URL("/path", process.env.BOUNDARY_URL), { method: "POST", ... })`.
  Never import from `src/`, except `import type` of the contract's types.
- Files go in `tests/public/` and end in `.test.ts`. Use
  `import { test } from "node:test";` and
  `import assert from "node:assert/strict";`. Flat async
  `test("...", async () => {...})` calls with unique names; no `describe`, no
  subtests. Node's modules and `fetch` are untyped here, so annotate any
  callback parameter you take from them.
- Start every test's name with the key of the scenario it asserts, in square
  brackets: the scenario's kind tag and its position among the scenarios of
  that kind, in spec order, counting from 1. The second `@unhappy` scenario is
  `[unhappy-2]`. A test that spans two scenarios is keyed to the one whose
  outcome it asserts.
- One service serves every test of the suite. Each test is independent and
  deterministic: it sends everything it depends on, relies on no state
  another test left, and uses no real clock, randomness or outside network.
- Assert only what the spec states or what follows necessarily from it:
  status, the headers it names, the body byte for byte where it defines it.
- `node sandbox/boundary.mjs -- node sandbox/run.mjs public` builds the
  project, starts the service and runs the suite. `npm run build` must report
  no errors. The tests will fail when run, because the service answers 501;
  that is expected.
- Write nothing outside `tests/public/`: no implementation, no changes to
  `src/`, `package.json`, `tsconfig.json`, `sandbox.env` or `sandbox/`.

End with one line: how many tests, in how many files.
