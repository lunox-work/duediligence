Write the public test suite for the function specified in `spec.md`. Its
interface is fixed by `src/solution.py`: do not change it. The function
raises `not implemented` until someone implements it.

These tests are handed to the developer who implements the function. They
work against them and run them as often as they like.

Cover: every example in the docstring, one test each; then, for each rule
the docstring states, its typical case and one boundary case.

Rules:

- Files go in `tests/public/` and are named `test_*.py`. Use `unittest`,
  a flat `unittest.TestCase` class with one method per case and unique
  method names. Import the function with
  `from src.solution import <name>`.
- Compare floats with `assertAlmostEqual` (or `math.isclose`) where the
  result is a float; compare everything else exactly.
- Every expected value must be right. For a case the docstring does not
  answer, derive the answer by hand, and say in a comment how. Prefer
  fewer certain cases over more doubtful ones.
- Assert only what the docstring states or what follows necessarily from
  it. Every input must be one the docstring allows: its types, its stated
  ranges, and any precondition it implies.
- `python3 sandbox/compile_check.py` must report no errors. The tests
  will fail when run, because the function raises; that is expected.
- Write nothing outside `tests/public/`: no implementation, no changes to
  `src/` or `sandbox/`.

End with one line: how many tests, in how many files.
