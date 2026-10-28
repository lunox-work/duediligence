You are drafting the interface contract for the specification in `spec.md`:
a command, written in {{language}}. Two test suites and one implementation
will be written against it by people who cannot talk to each other, so the
contract has to be the only thing they share besides the spec. The tests
reach the code only by running the command; nothing imports it.

Write `{{entry}}`, the program `{{run}}` runs:

- It {{stub}}. No argument parsing, no logic, no helpers.{{extra}}
- Above it, one comment giving the command's whole contract as the spec
  states it: its arguments, what it reads on stdin and from files, what it
  writes on stdout, on stderr and to files, every exit code the spec names,
  and the shape of every JSON document it reads or writes. Use the spec's
  words; add no rule it does not state.
- Anything the behaviour depends on that a test must control (the current
  time, a secret key, randomness) is an argument or input, never read from
  the environment or the clock.
- {{stdlib}}.

Run `npm run build`, which builds the command; it must report no errors.
Write nothing but `{{entry}}`: no tests, no other files, no changes to
`package.json`, `tsconfig.json`, `sandbox.env` or `sandbox/`.

End with one line: the command's usage.
