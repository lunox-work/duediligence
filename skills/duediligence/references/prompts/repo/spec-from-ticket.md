Turn the ticket in `ticket.md` into a precise specification in `spec.md`,
for a change to {{seam}} in `{{package}}` of this repository. This folder is
the repository at the commit the change starts from. Read the seam, the code
around it and the existing tests nearest it ({{examples}}) before you write.

A developer will implement from your `spec.md` alone, and tests will be
written from it, so every behaviour a test could check must be decided
here.

- Start with a `# Title` and a short paragraph of context, then one
  ```gherkin block: a `Feature:`, an optional `Background:`, and
  `Rule:` sections holding `Scenario:`s.
- Name the functions, types and constants the change exports from the seam,
  with their signatures. Where the ticket gives an interface, use it as it
  stands. Say which existing exports keep their behaviour.
- Tag every scenario with its kind on the line above it: `@happy`,
  `@boundary`, `@unhappy`, or `@concurrency` when calls may overlap.
- Use the interface's own names and the repository's own types. Give
  concrete inputs and outputs in each scenario, with tables where several
  cases share one rule.
- Specify only what a unit test can check by calling the seam's exports:
  no database, network, clock or file system unless the interface takes
  them as parameters.
- Where the ticket leaves a question open (formats, limits, which inputs
  are rejected and how, ordering, rounding, what happens when calls
  overlap), decide it, state the decision as a rule with what happens
  otherwise, and add a scenario that shows it. Prefer what the surrounding
  code already does, then the conventional choice for this kind of code.
- Write nothing but `spec.md`.

End with a list headed `Decided:` naming each open question you decided,
one line each. Under each line, indented, write `Ticket:` and the ticket's
sentence it answers, quoted as written, or `Ticket: silent.`; then
`Instead:` and the conventional alternative you did not choose. A person
reviews each decision against these two lines before any test is written.
