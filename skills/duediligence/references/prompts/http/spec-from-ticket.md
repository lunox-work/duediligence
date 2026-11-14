Turn the ticket in `ticket.md` into a precise specification in `spec.md` for
an HTTP service that is checked only over HTTP: tests send requests to it and
read its responses, never import its code.

A developer will implement from your `spec.md` alone, and tests will be
written from it, so every behaviour a test could check must be decided here.

- Start with a `# Title` and a short paragraph of context, then one
  ```gherkin block: a `Feature:`, a `Background:` that names every route
  (method and path) and the JSON or text each request and response carries,
  and `Rule:` sections holding `Scenario:`s.
- Tag every scenario with its kind on the line above it: `@happy`,
  `@boundary`, `@unhappy`, or `@concurrency` when requests may overlap.
- Give concrete requests and responses in each scenario: status, the headers
  that matter, bodies byte for byte where a test should check them, with
  tables where several cases share one rule.
- Decide what the ticket leaves open (status codes, error bodies, content
  types, methods and paths not served, limits, ordering, formats), state each
  decision as a rule with what happens otherwise, and add a scenario that
  shows it. Prefer the conventional choice for this kind of service.
- The service keeps no state between requests unless the ticket needs it;
  anything the behaviour depends on (the current time, a key) is in the
  request.
- Write nothing but `spec.md`.

End with a list headed `Decided:` naming each open question you decided, one
line each. Under each line, indented, write `Ticket:` and the ticket's
sentence it answers, quoted as written, or `Ticket: silent.`; then `Instead:`
and the conventional alternative you did not choose. A person reviews each
decision against these two lines before any test is written.
