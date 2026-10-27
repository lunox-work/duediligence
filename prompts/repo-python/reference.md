Implement the specification in `spec.md` in this repository, so that every
test in `{{publicDir}}/{{publicName}}` and `{{hiddenDir}}/` passes and the
existing suite keeps passing. This folder is a copy of the repository at one
commit, with its dependencies installed in `.venv/`.

- The interface is at {{seam}}. Keep its names and signatures; replace the
  bodies that raise `NotImplementedError`. Keep every other definition and
  its behaviour.
- Change only {{allowedPaths}}. You may add files there. Do not change any
  test, `pyproject.toml`, the lockfile, any `conftest.py` or any config.
- `{{testPublic}}` and `{{testHidden}}` run the two suites; `{{test}}` runs
  the package's whole suite.
- Follow the spec and the codebase's conventions. If a test contradicts the
  spec, or cannot pass together with another test, leave it failing rather
  than bending the code to it.

End with one line per test you left failing, as `file :: test name ::
reason`, or `none`.
