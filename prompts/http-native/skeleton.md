You are drafting the interface contract for the specification in `spec.md`:
an HTTP service, written in {{language}}. Two test suites and one
implementation will be written against it by people who cannot talk to each
other, so the contract has to be the only thing they share besides the spec.
The tests reach the service only over HTTP; nothing imports its code.

Write `{{entry}}`, the program `{{run}}` runs:

- A server on {{server}} listening on the port in the environment variable
  `PORT`, at the host in `HOST` (`127.0.0.1` when it is unset). It answers
  every request with status 501 and an empty body. No routing, no logic, no
  helpers.{{extra}}
- Above it, one comment per route the spec defines: method, path, what the
  request carries (query, headers, body and the shape of its JSON), and every
  response the spec names (status, headers, body). Use the spec's words; add
  no rule it does not state.
- Anything the behaviour depends on that a test must control (the current
  time, a secret key, randomness) is part of the request, never read from the
  environment or the clock.
- {{stdlib}}.

Run `npm run build`, which builds the service; it must report no errors.
Write nothing but `{{entry}}`: no tests, no other files, no changes to
`package.json`, `tsconfig.json`, `sandbox.env` or `sandbox/`.

End with one line: the routes, as `METHOD /path`.
