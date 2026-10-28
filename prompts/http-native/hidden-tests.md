Write the hidden test suite for the specification in `spec.md`, against the
HTTP service whose contract is `{{entry}}`, a {{language}} program
`{{run}}` starts. The contract is fixed: do not
change it. Until someone implements it, the service answers every request
with 501.

Read `spec.md`, `{{entry}}` and every test under `tests/public/`. The
public suite is what the developer who implements the spec iterates against;
they run it as often as they like and never see this suite. This suite exists
to fail an implementation that passes the public suite without satisfying the
spec.

Cover:

- every scenario in the spec, and every scenario kind it uses (happy,
  boundary, unhappy, and any others it tags);
- for each public test, at least one test the public test does not exercise:
  other values, larger sizes, other orders, other combinations, longer
  inputs, more items. Name the public test it extends in the test name or in
  a comment above it;
- every boundary and unhappy scenario the public suite skips, and every
  status, header and error body the spec names;
- the test an implementation tuned to the public suite would fail. For each
  public test, ask what shortcut passes the visible cases, and write the case
  that shortcut gets wrong.

Where the public suite asserts something the spec leaves open, do not test it
either way. Note it for the list at the end.

Rules:

- The tests are TypeScript on `node:test`, whatever language the service is
  in. The service is reached only over HTTP. Its base URL is
  `process.env.BOUNDARY_URL`; call it with the global `fetch`. Nothing
  imports from `src/`; declare any type you need for a JSON body in the test
  file.
- Files go in `tests/private/` and end in `.test.ts`. Use
  `import { test } from "node:test";` and
  `import assert from "node:assert/strict";`. Flat async
  `test("...", async () => {...})` calls with unique names; no `describe`, no
  subtests. Node's modules and `fetch` are untyped here, so annotate any
  callback parameter you take from them.
- Start every test's name with the key of the scenario it asserts, in square
  brackets: the scenario's kind tag and its position among the scenarios of
  that kind, in spec order, counting from 1. The second `@unhappy` scenario is
  `[unhappy-2]`. A test that spans two scenarios is keyed to the one whose
  outcome it asserts. The grader reports failures by key alone, so a key
  names the scenario and nothing else.
- One service serves every test of the suite. Each test is independent and
  deterministic: it sends everything it depends on, relies on no state
  another test left, and uses no real clock, randomness or outside network.
  You may compute expected values with Node's own modules when the spec
  defines a result that way.
- Assert only what the spec states or what follows necessarily from it.
  Where the spec leaves something open, do not test it.
- Every test must fail against the service as it stands, which answers 501
  to everything. A test of an error response must check what the spec says
  the response holds (its status and, where the spec names one, its body),
  not just that the status is not 200.
- `node sandbox/boundary.mjs -- node sandbox/run.mjs private` builds the
  project (the suites, then the service), starts it and runs this suite. `npm run build` must
  report no errors.
- Write nothing outside `tests/private/`: no implementation, no changes to
  `src/`, `tests/public/`, `package.json`, `tsconfig.json`, `sandbox.env` or
  `sandbox/`.

End with one line: how many tests, in how many files. Then a list headed
`Open in the spec:` with one item per public test that asserts something the
spec leaves open, naming that test and the open question. If there is none,
end with `Open in the spec: none`.
