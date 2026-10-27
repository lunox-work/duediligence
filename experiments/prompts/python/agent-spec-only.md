Solve the problem in `spec.md`.

- The one file under `src/` is the program acceptance runs: `src/main.py`
  reads standard input and prints the answer, or `src/solution.py` holds
  the `class Solution` from the starter code. Put all of your code in that
  file; other files under `src/` are not loaded. Keep the method's name
  and signature.
- Everything else (`sandbox/`) is harness, and a submission that changes
  any of it is rejected.
- There are no tests here, and you do not write any.
  `python3 sandbox/exec.py < input` runs your program on an input of your
  own the way acceptance runs it (`--fn NAME ARG_JSON...` for a
  `class Solution`). Acceptance execs the file's text with standard input
  mocked, allows 6 seconds of CPython per test case, and compares output
  lines with surrounding whitespace stripped.
- Acceptance is decided by a separate run of your code against tests that
  are not in this directory.
- There is no network and nothing to install.

Stop when you consider the problem solved. End with a short summary of
your approach.
