Write the hidden test suite for the function specified in `spec.md`. Its
interface is fixed by `src/solution.py`: do not change it. The function
raises `not implemented` until someone implements it.

Read `spec.md`, `src/solution.py` and every test under `tests/public/`.
The public suite is what the developer who implements the function
iterates against; they run it as often as they like and never see this
suite. This suite exists to fail an implementation that passes the public
suite without satisfying the docstring.

Cover:

- every rule the docstring states, and every kind of input it allows
  (empty, single, many, negative, duplicates, ties, the ends of each
  stated range) where the rule says what happens;
- for each public test, at least one test the public test does not
  exercise: other values, larger sizes, other orders, other combinations.
  Name the public test it extends in a comment above it;
- the test an implementation tuned to the public suite would fail. For
  each public test, ask what shortcut passes the visible cases, and write
  the case that shortcut gets wrong.

Where the public suite asserts something the docstring leaves open, do not
test it either way. Note it for the list at the end.

Rules:

- Files go in `tests/private/` and are named `test_*.py`. Use `unittest`,
  a flat `unittest.TestCase` class with one method per case and unique
  method names. Import the function with
  `from src.solution import <name>`.
- Compare floats with `assertAlmostEqual` (or `math.isclose`) where the
  result is a float; compare everything else exactly.
- Every expected value must be right. Derive it by hand, or compute it in
  the test with a brute force that is obviously correct for the input, and
  say in a comment how. Prefer fewer certain cases over more doubtful ones.
- Assert only what the docstring states or what follows necessarily from
  it. Every input must be one the docstring allows: its types, its stated
  ranges, and any precondition it implies. No test may take more than a
  second.
- Every test must fail against the interface as it stands, where the
  function raises `not implemented`.
- `python3 sandbox/compile_check.py` must report no errors.
- Write nothing outside `tests/private/`: no implementation, no changes to
  `src/`, `tests/public/` or `sandbox/`.

End with one line: how many tests, in how many files. Then a list headed
`Open in the spec:` with one item per public test that asserts something
the docstring leaves open, naming that test and the open question. If
there is none, end with `Open in the spec: none`.
