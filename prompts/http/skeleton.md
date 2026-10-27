You are drafting the interface contract for the specification in `spec.md`:
an HTTP service. Two test suites and one implementation will be written
against it by people who cannot talk to each other, so the contract has to be
the only thing they share besides the spec. The tests reach the service only
over HTTP; nothing imports its code.

Write `src/server.ts`:

- A server on `node:http` listening on `Number(process.env.PORT)` at
  `process.env.HOST ?? "127.0.0.1"`. It answers every request with status
  501 and an empty body. No routing, no logic, no helpers.
- Above it, one doc comment per route the spec defines: method, path, what
  the request carries (query, headers, body and its type), and every response
  the spec names (status, headers, body). Use the spec's words; add no rule it
  does not state.
- Exported TypeScript types for every JSON body the spec defines, request and
  response, with one short doc comment each. Nothing else is exported.
- Anything the behaviour depends on that a test must control (the current
  time, a secret key, randomness) is part of the request, never read from the
  environment or the clock.

Run `npm run build`; it must report no errors. Write nothing but
`src/server.ts`: no tests, no other files, no changes to `package.json`,
`tsconfig.json`, `sandbox.env` or `sandbox/`.

End with one line: the routes, as `METHOD /path`.
