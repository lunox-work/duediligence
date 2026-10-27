"""What a test calls to run the submission the way acceptance runs it.

Acceptance is LiveCodeBench's own checker (sandbox/lcb/testing_util.py,
vendored verbatim). It execs the program's text with stdin mocked and
stdout captured, one case at a time with a 6-second alarm per case, and
compares output lines stripped of surrounding whitespace, numeric tokens
as decimals. Call-based problems (a `class Solution` in src/solution.py)
have their method called with the case's arguments and the return value
compared to the expected value. This module is the only path to the
checker, so the public tests, the hidden tests and `sandbox/exec.py` all
see the same semantics.

    from sandbox.check import run_case

    run_case(self, stdin="3 3\\n2 1 1", expected="6")
    run_case(self, fn="countNonDecreasingSubarrays", args=[[6, 3, 1], 7], expected=3)
"""

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIMEOUT = 6  # seconds per case: LiveCodeBench's default


def source(fn=None):
    """The one file acceptance runs: src/solution.py for a call-based problem, src/main.py otherwise."""
    path = os.path.join(ROOT, "src", "solution.py" if fn else "main.py")
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def run_cases(cases, fn=None):
    """Every case in order through the checker, stopping at the first
    failure as the benchmark does, in a fresh process per call as the
    benchmark does (sandbox/lcb_worker.py), under the benchmark's global
    timeout of (6 + 1) seconds per case plus 5. Returns (results,
    metadata): results[i] is True for a pass and an error code otherwise;
    cases after a failure are absent."""
    sample = {
        "input_output": json.dumps(
            {
                "inputs": [case["input"] for case in cases],
                "outputs": [case["output"] for case in cases],
                "fn_name": fn,
            }
        )
    }
    job = json.dumps({"sample": sample, "code": source(fn), "timeout": TIMEOUT})
    try:
        run = subprocess.run(
            [sys.executable, "-I", os.path.join(ROOT, "sandbox", "lcb_worker.py")],
            input=job, capture_output=True, text=True, cwd=ROOT,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
            timeout=(TIMEOUT + 1) * len(cases) + 5,
        )
    except subprocess.TimeoutExpired:
        return [-1], {"error_code": -1, "error_message": "global timeout"}
    try:
        reply = json.loads(run.stdout)
    except ValueError:
        tail = (run.stderr or "").strip().split("\n")[-1] if run.stderr else ""
        return [-4], {"error_code": -4, "error_message": f"checker produced no result ({tail or 'no output'})"}
    return list(reply.get("results") or []), reply.get("metadata") or {}


def describe(metadata):
    """One line on why a case failed, from the checker's metadata."""
    message = metadata.get("error_message") or metadata.get("error") or "failed"
    parts = [str(message)]
    for key in ("inputs", "expected", "output"):
        if key in metadata:
            parts.append(f"{key}={metadata[key]!r}")
    return "; ".join(parts)


def run_case(tc, *, stdin=None, expected=None, fn=None, args=None):
    """One case, asserted on a unittest.TestCase.

    stdin form: the program's standard input and the expected standard
    output, both strings. Call-based form: the method name on `Solution`,
    its positional arguments as a list, and the expected return value, as
    Python values."""
    if fn is None:
        if stdin is None or expected is None:
            raise TypeError("run_case needs stdin= and expected= for a stdin problem")
        case = {"input": stdin, "output": expected}
    else:
        if args is None:
            raise TypeError("run_case needs args= for a call-based problem")
        case = {
            "input": "\n".join(json.dumps(arg) for arg in args),
            "output": json.dumps(expected),
        }
    results, metadata = run_cases([case], fn)
    if not results or results[0] is not True:
        tc.fail(describe(metadata))
