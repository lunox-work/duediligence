`spec.md` specifies the module in `src/`, and `src/` implements it. The
module is in use. Write the change request a product owner files for it
next: one change to its behaviour, which touches several of the existing
scenarios and leaves the rest as they are.

- The interface stays as it is: the same exported names, signatures and
  types in `src/index.ts`. The change is in behaviour only.
- Prefer a change that interacts with other rules (an order, a precedence,
  a limit, a default, an error case), so that making it means touching code
  other behaviour depends on. A change that only adds an isolated branch is
  too easy.
- Write `change/ticket.md`, the ticket as filed: a `#` title, then
  `Context`, `Change`, `Acceptance criteria` and `Scope`, 5 to 12 lines in
  all. It describes the change only, in a product owner's words. It does
  not restate the rules that stay, and it does not settle every detail.
- Write `change/spec.md`, the whole specification after the change, in the
  same format as `spec.md`: every scenario the change does not touch,
  word for word; the scenarios it touches, rewritten; new scenarios for what
  it adds, tagged by kind like the rest. Where the ticket leaves a detail
  open, decide it here, the conventional way, and state it as a rule with
  what happens otherwise.
- Write nothing else. Do not change `src/` or `spec.md`.

End with a list headed `Changed:` naming each scenario you rewrote or added,
one line each.
