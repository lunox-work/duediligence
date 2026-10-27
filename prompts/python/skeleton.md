You are drafting the interface contract for the specification in `spec.md`.
Two test suites and one implementation will be written against it by people
who cannot talk to each other, so the contract has to be the only thing they
share besides the spec.

Write `src/solution.py`:

- Every class and function a caller needs to exercise each scenario in the
  spec, defined at module level by name, with complete type hints on every
  parameter and return value. Prefer plain functions, dataclasses and
  `TypedDict`s; use a class with methods only when the spec describes
  something with state.
- Every function and method body is exactly
  `raise NotImplementedError("not implemented")`. No logic, no helpers, no
  module-level constants with values. If a caller needs a value the spec
  states, it is the implementation's job, not the contract's. A dataclass
  may declare its fields; it holds no logic.
- Anything the behaviour depends on that a test must control (the current
  time, a secret key, randomness) is a parameter, never read from the
  environment.
- Errors: if the spec says a call fails, say in that function's docstring
  which exception it raises. Use a built-in exception (`ValueError`,
  `KeyError`, `TypeError`) unless the spec names its own; do not invent
  exception classes the spec does not name.
- One short docstring per definition saying what it is for, in the spec's
  words. Do not add rules the spec does not state.
- The standard library only: there is nothing else to import.

Run `python3 sandbox/compile_check.py`; it must report no errors. Write
nothing but `src/solution.py`: no tests, no other files, no changes to
`sandbox/`, `pytest.ini` or `requirements.txt`.

End with one line: the names the module defines.
