Write the public test suite for the problem in `spec.md`. The program's
interface is fixed by the file under `src/`: `src/main.py` reads standard
input and prints the answer, or `src/solution.py` holds a `class Solution`
whose method is the one named in the starter code. Do not change it. It
raises `not implemented` until someone implements it.

These tests are handed to the developer who implements the problem. They
work against them and run them as often as they like.

Cover: every sample in the statement, one test each; then boundary cases
the constraints make possible, such as the smallest input, the largest
value a single element may take, and the edge the statement singles out,
where you can state the expected answer with certainty.

Rules:

- Files go in `tests/public/` and are named `test_*.py`. Use `unittest`
  and `from sandbox.check import run_case`, a flat `unittest.TestCase`
  class with one method per case and unique method names.
- A stdin problem's case is `run_case(self, stdin="...", expected="...")`,
  both strings exactly as the statement writes them. A `class Solution`
  problem's case is `run_case(self, fn="<method>", args=[...],
  expected=...)`, with the arguments and the expected return as Python
  values. `run_case` runs the program the way acceptance does.
- Every expected value must be right. For a case the statement does not
  answer, derive the answer by hand or compute it in the test with a
  brute force that is obviously correct for a tiny input, and say in a
  comment how it was obtained. Prefer fewer certain cases over more
  doubtful ones.
- Assert only what the statement states or what follows necessarily from
  it. No case may exceed the constraints.
- `python3 sandbox/compile_check.py` must report no errors. The tests
  will fail when run, because the program raises; that is expected.
- Write nothing outside `tests/public/`: no implementation, no changes to
  `src/` or `sandbox/`.

End with one line: how many tests, in how many files.
