Write the hidden test suite for the specification in `spec.md`, against the
interface at {{seam}}. This folder is a copy of an existing repository at one
commit, with its dependencies installed. The interface is fixed: do not
change it. Its new bodies throw `not implemented` until someone implements
them.

Read `spec.md`, the seam and every test in `{{publicDir}}/{{slug}}.*`. That
public suite is what the developer who implements the spec iterates against;
they run it as often as they like and never see this suite. This suite
exists to fail an implementation that passes the public suite without
satisfying the spec.

Cover:

- every scenario in the spec, and every scenario kind it uses (happy,
  boundary, unhappy, and any others it tags);
- for each public test, at least one test the public test does not
  exercise: other values, larger sizes, other orders, other combinations,
  longer inputs, more items. Name the public test it extends in the test
  name or in a comment above it;
- every boundary and unhappy scenario the public suite skips;
- the test an implementation tuned to the public suite would fail. For
  each public test, ask what shortcut passes the visible cases, and write
  the case that shortcut gets wrong.

Where the public suite asserts something the spec leaves open, do not test
it either way. Note it for the list at the end.

Rules:

- Files go in `{{hiddenDir}}/` and match `{{testPattern}}`. Import the code
  under test by its path in this repository, from that folder:
  `{{hiddenImport}}`.
- Read the existing tests nearest the seam first: {{examples}}. Use the test
  function, assertions, imports, fixtures and helpers they use. Flat
  top-level tests with unique names; no `describe`, no nesting, even where
  those files nest.
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
- Every test must fail against the interface as it stands, where every new
  body throws `not implemented`. A test that a call fails must check that
  the error is the one the spec describes (its message, or what it names),
  not just that something was thrown.
- `cd {{package}} && npx {{build}}` must report no errors. `{{testHidden}}`
  runs your files.
- Write nothing outside `{{hiddenDir}}/`: no implementation, no changes to
  the seam, to the public suite or other tests, to `package.json`, the
  lockfile or any config.

End with one line: how many tests, in how many files. Then a list headed
`Open in the spec:` with one item per public test that asserts something
the spec leaves open, naming that test and the open question. If there is
none, end with `Open in the spec: none`.
