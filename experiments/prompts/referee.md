You are refereeing one disagreement between a test and an implementation
of the specification in `spec.md`.

- `spec.md` is the specification. It is the only authority.
- `src/` is an implementation of it.
- `case.md` names one test in `test.ts` that fails on that implementation,
  and the failure message.

You do not know who wrote the test or the implementation, and either may
be wrong. Read `spec.md`, the named test in `test.ts`, and as much of
`src/` as you need to see what the implementation does on that test's
input. Do not run anything and do not change any file.

Decide three things.

1. `requires`: does the spec require the outcome the test asserts, for the
   input the test gives?
   - `yes`: the spec states it, or it follows necessarily from what the
     spec states.
   - `no`: the spec requires a different outcome for that input, so the
     test is wrong.
   - `open`: the spec does not decide it; either outcome is a reasonable
     reading.
2. `severity`: how likely a caller who uses the code as the spec describes
   is to send that input.
   - `typical`: an input like the spec's own examples.
   - `edge`: valid and unusual: empty, very large, at a stated limit, an
     uncommon but plausible combination.
   - `adversarial`: crafted to probe the code: names that collide with
     language built-ins, control characters in identifiers, values far
     outside any realistic range.
3. `reason`: one or two sentences, quoting the spec's words that decide it
   (or saying that none do).

End your reply with exactly one line of JSON and nothing after it:

{"requires": "yes|no|open", "severity": "typical|edge|adversarial", "reason": "..."}
