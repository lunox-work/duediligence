Solve the problem in `spec.md`, with your own tests.

- The one file under `src/` is the program acceptance runs: `src/main.py`
  reads standard input and prints the answer, or `src/solution.py` holds
  the `class Solution` from the starter code. Put all of your code in that
  file; other files under `src/` are not loaded. Keep the method's name
  and signature.
- Write your tests under `tests/own/`, as `test_*.py` files using
  `unittest` and `from sandbox.check import run_case`:
  `run_case(self, stdin="...", expected="...")` for a stdin problem,
  `run_case(self, fn="<method>", args=[...], expected=...)` for a
  `class Solution`. `python3 sandbox/run.py own` runs them the way
  acceptance runs your program; `python3 sandbox/exec.py < input` runs it
  on an input of your own. Acceptance execs the file's text with standard
  input mocked, allows 6 seconds of CPython per test case, and compares
  output lines with surrounding whitespace stripped.
- Everything else (`sandbox/`) is harness, and a submission that changes
  any of it is rejected.
- Acceptance is decided by a separate run of your code against tests that
  are not in this directory; your own tests are not part of it.
- There is no network and nothing to install.

Stop when you consider the problem solved. End with a short summary of
your approach.
