You are drafting the interface contract for the specification in `spec.md`:
a command. Two test suites and one implementation will be written against it
by people who cannot talk to each other, so the contract has to be the only
thing they share besides the spec. The tests reach the code only by running
the command; nothing imports it.

Write `src/cli.ts`, the program `node src/cli.js` runs:

- It writes `not implemented` and a newline on stderr and exits with code 2
  (`process.exitCode = 2`). No argument parsing, no logic, no helpers.
- Above it, one doc comment giving the command's whole contract as the spec
  states it: its arguments, what it reads on stdin and from files, what it
  writes on stdout, on stderr and to files, and every exit code the spec
  names. Use the spec's words; add no rule it does not state.
- Exported TypeScript types for every JSON document the spec defines on stdin
  or stdout, with one short doc comment each. Nothing else is exported.
- Anything the behaviour depends on that a test must control (the current
  time, a secret key, randomness) is an argument or input, never read from
  the environment or the clock.

Run `npm run build`; it must report no errors. Write nothing but
`src/cli.ts`: no tests, no other files, no changes to `package.json`,
`tsconfig.json`, `sandbox.env` or `sandbox/`.

End with one line: the command's usage.
