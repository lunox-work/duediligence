Implement the specification in `spec.md` under `src/`, so that every test in
`tests/public/` and `tests/private/` passes.

- `src/solution.py` is the interface. Keep its names and signatures;
  replace the bodies. You may add modules under `src/`. The standard library
  only.
- Do not change any test, `sandbox/`, `pytest.ini` or `requirements.txt`.
- `python3 sandbox/run.py public` and `python3 sandbox/run.py private`
  check the project parses and run one suite each, printing every test's
  outcome as JSON.
- Follow the spec. If a test contradicts the spec, or cannot pass together
  with another test, leave it failing rather than bending the code to it.

End with one line per test you left failing, as `file :: test name ::
reason`, or `none`.
