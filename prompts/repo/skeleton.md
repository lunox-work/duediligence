You are drafting the interface contract for the specification in `spec.md`,
inside an existing repository: this folder is a copy of it at one commit,
with its dependencies installed. Two test suites and one implementation will
be written against the contract by people who cannot talk to each other, so
the contract has to be the only thing they share besides the spec and the
code already here.

Write the seam: {{seam}}. Read the code around it first. The contract
belongs to this codebase: follow its naming, module layout and types, and
reuse the types it already has where the spec talks about them.

- Every type, interface, class and function a caller needs to exercise each
  scenario in the spec, exported by name from the seam, with complete
  TypeScript signatures. Prefer plain functions and object types; use a
  class only when the spec describes something with state.
- A seam file that exists already: keep every export it has, with its body
  unchanged, and add the new ones. A seam file that does not exist: create
  it.
- Every new function and method body is exactly
  `throw new Error("not implemented");`. No logic and no helpers.
- A constant the spec names with its value is exported with that value: it
  is part of the contract, and tests import it. Never `declare` one: a
  declared constant compiles but is missing when the tests run, and every
  test file that imports it fails to load. A value the spec does not state
  is the implementation's job, not the contract's.
- Anything the behaviour depends on that a test must control (the current
  time, a secret key, randomness) is a parameter, never read from the
  environment.
- Errors: if the spec says a call fails, say in that function's doc comment
  that it throws. Do not invent error classes or codes the spec or the
  codebase does not name.
- One short doc comment per new export saying what it is for, in the spec's
  words. Do not add rules the spec does not state.

`cd {{package}} && npx {{build}}` must report no errors, and the existing
suite (`{{test}}`) must pass as it did before you started. Write nothing but
the seam files: no tests, no other files, no changes to `package.json`, the
lockfile or any config.

End with one line: the exported names you added.
