Write the public test suite for the specification in `spec.md`, against the
command whose contract is `{{entry}}`, a {{language}} program the suite runs as
`{{run}}`. The contract is fixed: do not change it. Until someone implements
it, the command writes `not implemented` and exits 2.

These tests are handed to the developer who implements the spec. They work
against them and run them as often as they like.

Cover, for each scenario in the spec: its happy path, and one boundary case.

Rules:

- The tests are TypeScript on `node:test`, whatever language the command is
  in. The code is reached only by running the command. Its argv is the JSON
  array in `process.env.BOUNDARY_COMMAND`; run it with `node:child_process`,
  from the project's root, as in
  `const [bin, ...args] = JSON.parse(process.env.BOUNDARY_COMMAND); spawnSync(bin, [...args, ...yours], { input, encoding: "utf8" })`,
  and assert on its exit code, stdout, stderr and any files it writes. Nothing
  imports from `src/`; declare any type you need for a JSON document in the
  test file. Files a test gives it go in a fresh folder from `fs.mkdtempSync`
  under `os.tmpdir()`, removed after.
- Files go in `tests/public/` and end in `.test.ts`. Use
  `import { test } from "node:test";` and
  `import assert from "node:assert/strict";`. Flat `test("...", () => {...})`
  calls with unique names; no `describe`, no subtests. Node's modules are
  untyped here, so annotate any callback parameter you take from them.
- Start every test's name with the key of the scenario it asserts, in square
  brackets: the scenario's kind tag and its position among the scenarios of
  that kind, in spec order, counting from 1. The second `@unhappy` scenario is
  `[unhappy-2]`. A test that spans two scenarios is keyed to the one whose
  outcome it asserts.
- Each test is independent and deterministic: no real clock, randomness or
  network.
- Assert only what the spec states or what follows necessarily from it.
- `npm test` builds the project (the suites, then the command) and runs the
  suite (`sandbox.env` sets `BOUNDARY_COMMAND`). `npm run build` must report
  no errors. The tests will fail when run, because the command exits 2; that
  is expected.
- Write nothing outside `tests/public/`: no implementation, no changes to
  `src/`, `package.json`, `tsconfig.json`, `sandbox.env` or `sandbox/`.

End with one line: how many tests, in how many files.
