`ticket.md` is a ticket for the interface in `src/index.ts`, whose bodies
throw `not implemented`. The tests in `tests/public/` were written for it.
A developer will implement the ticket without these tests, from the ticket
and your notes alone. Write the notes in `notes.md` so they know everything
the tests check, and nothing more.

- Start with a `## Notes` heading. Then one bullet per behaviour the tests
  check, grouped under a `###` heading per function or area.
- State each behaviour as a rule in plain language, with the concrete
  inputs and outputs the tests use as its examples: values, messages,
  orders, formats, which calls fail and with what error.
- Include everything an assertion pins down, however small: exact strings,
  counts, ordering, rounding, what is returned on failure.
- Add nothing the tests do not check, and leave out what they leave open.
  Do not guess the intent behind a test; say what it asserts.
- No code, no test names, no file names and no mention of tests: write it
  as notes on the ticket.
- Write nothing but `notes.md`.

End with one line: how many bullets.
