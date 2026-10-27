You are drafting the interface contract for the specification in `spec.md`,
inside an existing repository: this folder is a copy of it at one commit,
with its dependencies installed in `.venv/`. Two test suites and one
implementation will be written against the contract by people who cannot
talk to each other, so the contract has to be the only thing they share
besides the spec and the code already here.

Write the seam: {{seam}}. Read the code around it first. The contract
belongs to this codebase: follow its naming, module layout and type hints,
and reuse the classes it already has where the spec talks about them.

- Every class and function a caller needs to exercise each scenario in the
  spec, defined by name in the seam, with complete type hints. Prefer plain
  functions and dataclasses; use a class with methods only when the spec
  describes something with state.
- A seam file that exists already: keep every name it defines, with its
  body unchanged, and add the new ones. A seam file that does not exist:
  create it.
- Every new function and method body is exactly
  `raise NotImplementedError("not implemented")`. No logic and no helpers.
- A constant the spec names with its value is defined with that value: it
  is part of the contract, and tests import it. A value the spec does not
  state is the implementation's job, not the contract's.
- Anything the behaviour depends on that a test must control (the current
  time, a secret key, randomness) is a parameter, never read from the
  environment.
- Errors: if the spec says a call fails, say in that function's docstring
  which exception it raises. Do not invent exception classes the spec or
  the codebase does not name.
- One short docstring per new definition saying what it is for, in the
  spec's words. Do not add rules the spec does not state.

The existing suite (`{{test}}`) must pass as it did before you started.
Write nothing but the seam files: no tests, no other files, no changes to
`pyproject.toml`, the lockfile or any config.

End with one line: the names you added.
