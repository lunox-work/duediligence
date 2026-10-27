Implement the specification in `{{specPath}}` in this repository.

- The interface is drafted at {{seam}}, with new bodies that raise
  `NotImplementedError("not implemented")`. Keep its names and signatures,
  and every other definition and its behaviour.
- The task's code lives in {{allowedPaths}}. Change it and add new files
  there. A change elsewhere is reported with the result.
- The package's existing suite, `{{test}}`, must keep passing: a test of it
  that passed before your change and fails after it rejects the submission.
- Write your own tests in `{{publicDir}}/{{ownName}}`, in the idiom of the
  existing tests ({{examples}}); `{{testOwn}}` runs them. Cover every
  scenario in the spec.
- Every test that existed before, `pyproject.toml`, the lockfile, any
  `conftest.py`, `.venv/` and the test config are harness, and a submission
  that changes any of them is rejected.
- Local results help you iterate. Acceptance is decided by a separate run of
  your code against a hidden suite that covers every scenario; your own
  tests are not part of it.
- Nothing needs installing, and nothing may be installed.

Stop when your own tests and the existing suite pass. End with a short
summary of what you built.
