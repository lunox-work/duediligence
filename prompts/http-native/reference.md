Implement the specification in `spec.md` under `src/`, in {{language}}, as an
HTTP service started by `{{run}}`, so that every test in `tests/public/` and
`tests/private/` passes.

- `{{entry}}` is the contract: the server it starts, listening on the port in
  `PORT` at the host in `HOST` (`127.0.0.1` when unset). Keep the port, the
  host and the contract comments; replace the 501 answers. You may add files
  under `src/`.{{extra}} {{stdlib}}.
- The tests are TypeScript; they only send it requests. Do not change any
  test, `package.json`, `tsconfig.json`, `sandbox.env` or `sandbox/`, and add
  nothing outside `src/`.
- `node sandbox/boundary.mjs -- node sandbox/run.mjs public` and
  `node sandbox/boundary.mjs -- node sandbox/run.mjs private` build the
  project (the suites, then the service), start the service, and run one
  suite each against it, printing every test's outcome as JSON.
- Follow the spec. If a test contradicts the spec, or cannot pass together
  with another test, leave it failing rather than bending the code to it.

End with one line per test you left failing, as `file :: test name ::
reason`, or `none`.
