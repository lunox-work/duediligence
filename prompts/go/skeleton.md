You are drafting the interface contract for the specification in `spec.md`.
Two test suites and one implementation will be written against it by people
who cannot talk to each other, so the contract has to be the only thing they
share besides the spec.

Write `src/task.go`, `package task`:

- Every type and function a caller needs to exercise each scenario in the
  spec, exported (capitalised), with complete signatures. Prefer plain
  functions and structs; use methods on a type only when the spec describes
  something with state. A call the spec says can fail returns an `error` as
  its last result.
- Every function and method body is exactly `panic("not implemented")`. No
  logic, no helpers, no package-level variables or constants with values.
  If a caller needs a value the spec states, it is the implementation's job,
  not the contract's.
- Anything the behaviour depends on that a test must control (the current
  time, a secret key, randomness) is a parameter, never read from the
  environment.
- Errors: say in the doc comment when a call returns an error and what its
  message names. Do not invent error variables or types the spec does not
  name.
- One short doc comment per exported name saying what it is for, in the
  spec's words. Do not add rules the spec does not state.
- The standard library only: there is nothing else to import.

Run `go vet ./...`; it must report no errors. Write nothing but
`src/task.go`: no tests, no other files, no changes to `go.mod` or
`sandbox/`.

End with one line: the exported names.
