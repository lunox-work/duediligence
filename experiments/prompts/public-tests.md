Write the public test suite for the specification in `spec.md`, against the
interface in `src/index.ts`. The interface is fixed: do not change it. Its
bodies throw `not implemented` until someone implements them.

These tests are handed to the developer who implements the spec. They work
against them and run them as often as they like.

Cover, for each scenario in the spec: its happy path, and one boundary case.

Rules:

- Files go in `tests/public/` and end in `.test.ts`. Import the code under
  test from `"../../src/index.js"`.
- Use `import { test } from "node:test";` and
  `import assert from "node:assert/strict";`. Flat `test("...", () => {...})`
  calls with unique names; no `describe`, no subtests. Node's modules are
  untyped here, so annotate any callback parameter you take from them.
- Start every test's name with the key of the scenario it asserts, in
  square brackets: the scenario's kind tag and its position among the
  scenarios of that kind, in spec order, counting from 1. The second
  `@unhappy` scenario is `[unhappy-2]`. A test that spans two scenarios is
  keyed to the one whose outcome it asserts.
- Each test is independent and deterministic: no real clock, randomness,
  network or filesystem. Where the interface takes a clock or a key, pass a
  fixed one.
- Assert only what the spec states or what follows necessarily from it.
- `npm run build` must report no errors. The tests will fail when run,
  because the bodies throw; that is expected.
- Write nothing outside `tests/public/`: no implementation, no changes to
  `src/`, `package.json`, `tsconfig.json` or `sandbox/`.

End with one line: how many tests, in how many files.
