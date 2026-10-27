You are drafting the interface contract for the specification in `spec.md`.
Two test suites and one implementation will be written against it by people
who cannot talk to each other, so the contract has to be the only thing they
share besides the spec.

Write `src/index.ts`:

- Every type, interface, class and function a caller needs to exercise each
  scenario in the spec, exported by name, with complete TypeScript
  signatures. Prefer plain functions and object types; use a class only when
  the spec describes something with state.
- Every function and method body is exactly
  `throw new Error("not implemented");`. No logic, no helpers, no exported
  constants with values. If a caller needs a value the spec states, it is
  the implementation's job, not the contract's.
- Anything the behaviour depends on that a test must control — the current
  time, a secret key, randomness — is a parameter, never read from the
  environment.
- Errors: if the spec says a call fails, say in that function's doc comment
  that it throws. Do not invent error classes or codes the spec does not
  name.
- One short doc comment per export saying what it is for, in the spec's
  words. Do not add rules the spec does not state.

Run `npm run build`; it must report no errors. Write nothing but
`src/index.ts`: no tests, no other files, no changes to `package.json`,
`tsconfig.json` or `sandbox/`.

End with one line: the exported names.
