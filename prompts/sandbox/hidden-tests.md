Write the hidden tests for the bounty: the acceptance tests a developer's
submission is judged by, which the developer never sees. The project is a
standalone copy of the code the bounty changes, generated so that it
installs, builds, runs its walkthrough and passes its public tests. Modules
it does not copy are cut: each is a typed stub whose runtime values are
recording mocks. The public tests are what the developer iterates against;
these tests exist to fail a submission that passes them without doing what
the spec says.

Write each test under `{{hiddenDir}}/` as a `{{testPattern}}` file, and mark
it with the outcome it has on the project as it is now. "fail" is a test
that only a finished bounty passes: it checks the behaviour the bounty asks
for. "pass" is one that guards behaviour the code already has and a finished
bounty must keep. At least one must be "fail". A submission is accepted when
every hidden test passes, so test what the spec says through the code's own
interface, such that any correct implementation passes and an incomplete one
does not.

Cover:

- every scenario in the spec, and every scenario kind it uses (happy,
  boundary, unhappy, and any others it tags);
- for each public test, at least one case it does not exercise: other
  values, larger sizes, other orders, other combinations, more items. Name
  the public test it extends in a comment above it;
- the case an implementation tuned to the public tests would get wrong. For
  each public test, ask what shortcut passes the visible cases, and write
  the case that shortcut fails.

Assert only what the spec states or what follows necessarily from it. Where
the spec, or a public test, leaves a name, message or structure open, do not
test it either way.

A "fail" test must fail by its assertions, not by breaking. Hidden tests are
compiled with the project by `{{build}}`, so they must type-check against the
code as it is now: a test that imports a function or passes a parameter the
bounty has yet to add breaks the build, and the whole baseline with it. When
the bounty adds something new, reach it at run time inside the test, for
example `const mod: Record<string, unknown> = await import("{{importExample}}")`,
assert that it exists, and call it through a type you declare in the test. A
test that throws while its file loads, or imports something that is not
there, is an error, never the failure it is expected to show. A "pass" is
read from the runner's report, not only its exit code: at least one test
must run to completion and none may be skipped, todo or cancelled, and a
file that ends early or declares no test is an error. Do not name a test
after a file.

Write them so that a submission can only pass by doing the work:

- Assert observable results first: what the code returns, throws or leaves
  in the state it exposes. A test that a call fails checks that the error is
  the one the spec describes, not just that something was thrown. Use
  `recordedCalls()` only to confirm that a seam was reached, and with what,
  never as the only evidence that the behaviour is there.
- Call `resetMocks()` at the start of each test, for example in
  `beforeEach`, and install the behaviour each test needs inside it, so no
  test depends on what another left behind.
- Include at least one case whose inputs differ from the fixtures' default
  data and the walkthrough's: give the mocked calls other values with
  `mockImplementation(path, fn)` inside that test, so an implementation that
  hard-codes the public data fails. Never use the exact fixture values as a
  test's only inputs.
- Each hidden test runs twice and must give the same result both times:
  nothing may depend on timing, randomness, the clock or the order the tests
  run in.

The toolchain is fixed: {{toolchain}} Import the project's code with
relative paths from the test's folder; from `{{hiddenDir}}/` a file at
`src/feature.ts` is `{{importExample}}`. Import
`{ mockImplementation, recordedCalls, resetMocks }` from `{{mockModule}}` to
give a mocked call behaviour or to check what the code asked of it. Packages
compile as `any`. Nothing may reach the network, a database or any outside
service.
