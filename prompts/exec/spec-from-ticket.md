Turn the ticket in `ticket.md` into a precise specification in `spec.md` for
a command that is checked only by running it: tests give it arguments, stdin
and files, and read its exit code, stdout, stderr and files, never import its
code. It is run as `node src/cli.js [arguments]`.

A developer will implement from your `spec.md` alone, and tests will be
written from it, so every behaviour a test could check must be decided here.

- Start with a `# Title` and a short paragraph of context, then one
  ```gherkin block: a `Feature:`, a `Background:` that gives the command's
  usage (arguments, stdin, files read and written, stdout, stderr, exit
  codes), and `Rule:` sections holding `Scenario:`s.
- Tag every scenario with its kind on the line above it: `@happy`,
  `@boundary`, `@unhappy`, or `@concurrency` when runs may overlap.
- Give concrete inputs and outputs in each scenario, byte for byte where a
  test should check them, with tables where several cases share one rule.
- Decide what the ticket leaves open (exit codes, error messages, output
  formats, which inputs are rejected and how, limits, ordering), state each
  decision as a rule with what happens otherwise, and add a scenario that
  shows it. Prefer the conventional choice for this kind of tool.
- Anything the behaviour depends on (the current time, a key) is an argument
  or input.
- Write nothing but `spec.md`.

End with a list headed `Decided:` naming each open question you decided, one
line each. Under each line, indented, write `Ticket:` and the ticket's
sentence it answers, quoted as written, or `Ticket: silent.`; then `Instead:`
and the conventional alternative you did not choose. A person reviews each
decision against these two lines before any test is written.
