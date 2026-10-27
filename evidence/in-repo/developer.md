You made the change in `change.diff`: the code as you committed it. This
folder is the repository before your change. Someone drafted `spec.md` from
your ticket, `ticket.md`, without seeing your code, and asks you to confirm
it before tests are written from it. Tests written from the spec will judge
your code, so the spec must say what your code does.

Edit `spec.md`:

- Read every rule, scenario and `Decided:` item. Where your code does
  something else, change the rule, its scenarios and its `Decided:` line to
  what your code does, with concrete inputs and outputs your code produces.
- Where the spec names an export, a signature, a constant or a message
  differently from your code, use yours.
- Where the spec leaves a question open that your code decides and a test
  could check, decide it as your code does and add it to `Decided:`.
- Remove a rule or scenario only when your code does not do it and you
  would not want it.
- Do not add rules about behaviour the spec does not talk about, and do not
  describe how the code works inside.
- Keep the format: the title and context, one gherkin block with tagged
  scenarios, and the `Decided:` list at the end.

Write nothing but `spec.md`. End with a list headed `Changed:` naming each
change, one line each, or `Changed: none`.
