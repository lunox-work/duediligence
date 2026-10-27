Write the hidden test suite for the specification in `spec.md`, against
the interface in `src/index.ts`. The interface is fixed: do not change it.
Its bodies throw `not implemented` until someone implements them.

Read `spec.md`, `src/index.ts` and every test under `tests/public/`. The
public suite is what the developer who implements the spec iterates
against; they run it as often as they like and never see this suite. This
suite exists to fail an implementation that passes the public suite
without satisfying the spec.

Cover:

- every scenario in the spec, and every scenario kind it uses (happy,
  boundary, unhappy, and any others it tags);
- for each public test, at least one test the public test does not
  exercise: other values, larger sizes, other orders, other combinations,
  longer inputs, more items, more files. Name the public test it extends
  in the test name or in a comment above it;
- every boundary and unhappy scenario the public suite skips;
- the test an implementation tuned to the public suite would fail. For
  each public test, ask what shortcut passes the visible cases, and write
  the case that shortcut gets wrong.

Where the public suite asserts something the spec leaves open, do not test
it either way. Note it for the list at the end.

Rules:

- Files go in `tests/private/` and end in `.test.ts`. Import the code under
  test from `"../../src/index.js"`.
- Use `import { test } from "node:test";` and
  `import assert from "node:assert/strict";`. Flat `test("...", () => {...})`
  calls with unique names; no `describe`, no subtests. Node's modules are
  untyped here, so annotate any callback parameter you take from them.
- Start every test's name with the key of the scenario it asserts, in
  square brackets: the scenario's kind tag and its position among the
  scenarios of that kind, in spec order, counting from 1. The second
  `@unhappy` scenario is `[unhappy-2]`. A test that spans two scenarios is
  keyed to the one whose outcome it asserts. The grader reports failures by
  key alone, so a key names the scenario and nothing else.
- Each test is independent and deterministic: no real clock, randomness,
  network or filesystem. Where the interface takes a clock or a key, pass a
  fixed one. You may compute expected values with Node's own modules (for
  example `node:crypto`) when the spec defines a result that way.
- Assert only what the spec states or what follows necessarily from it.
  Where the spec leaves something open, do not test it.
- Every test must fail against the interface as it stands, where every body
  throws `not implemented`. A test that a call fails must check that the
  error is the one the spec describes (its message, or what it names), not
  just that something was thrown.
- `npm run build` must report no errors.
- Write nothing outside `tests/private/`: no implementation, no changes to
  `src/`, `tests/public/`, `package.json`, `tsconfig.json` or `sandbox/`.

End with one line: how many tests, in how many files. Then a list headed
`Open in the spec:` with one item per public test that asserts something
the spec leaves open, naming that test and the open question. If there is
none, end with `Open in the spec: none`.
