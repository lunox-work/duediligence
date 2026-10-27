Write the public test suite for the specification in `spec.md`, against the
interface at {{seam}}. This folder is a copy of an existing repository at one
commit, with its dependencies installed. The interface is fixed: do not
change it. Its new bodies throw `not implemented` until someone implements
them.

These tests are handed to the developer who implements the spec in this
repository. They work against them and run them as often as they like.

Cover, for each scenario in the spec: its happy path, and one boundary case.

Rules:

- Files go directly in `{{publicDir}}/`, named `{{slug}}.test.ts`, or
  `{{slug}}.<part>.test.ts` for more than one file, with any extension
  `{{testPattern}}` takes. Import the code under test by its path in this
  repository, from that folder: `{{import}}`.
- Read the existing tests nearest the seam first: {{examples}}. Use the test
  function, assertions, imports, fixtures and helpers they use. Flat
  top-level tests with unique names; no `describe`, no nesting, even where
  those files nest.
- Start every test's name with the key of the scenario it asserts, in
  square brackets: the scenario's kind tag and its position among the
  scenarios of that kind, in spec order, counting from 1. The second
  `@unhappy` scenario is `[unhappy-2]`. A test that spans two scenarios is
  keyed to the one whose outcome it asserts.
- Each test is independent and deterministic: no real clock, randomness,
  network or filesystem. Where the interface takes a clock or a key, pass a
  fixed one.
- Assert only what the spec states or what follows necessarily from it.
- `cd {{package}} && npx {{build}}` must report no errors. `{{testPublic}}`
  runs your files; they fail, because the bodies throw. That is expected.
- Write nothing but your test files: no implementation, no changes to the
  seam, to other tests, to `package.json`, the lockfile or any config.

End with one line: how many tests, in how many files.
