Turn the ticket in `ticket.md` into a precise specification in `spec.md`,
for the interface in `src/index.ts`. The interface is fixed: do not change
it. Its bodies throw `not implemented` until someone implements them.

A developer will implement from your `spec.md` alone, and tests will be
written from it, so every behaviour a test could check must be decided
here.

- Start with a `# Title` and a short paragraph of context, then one
  ```gherkin block: a `Feature:`, an optional `Background:`, and
  `Rule:` sections holding `Scenario:`s.
- Tag every scenario with its kind on the line above it: `@happy`,
  `@boundary`, `@unhappy`, or `@concurrency` when calls may overlap.
- Use the interface's own names. Give concrete inputs and outputs in each
  scenario, with tables where several cases share one rule.
- Where the ticket leaves a question open (formats, limits, which inputs
  are rejected and how, ordering, rounding, what happens when calls
  overlap), decide it, state the decision as a rule with what happens
  otherwise, and add a scenario that shows it. Prefer the conventional
  choice for this kind of code.
- Write nothing but `spec.md`.

End with a list headed `Decided:` naming each open question you decided,
one line each.
