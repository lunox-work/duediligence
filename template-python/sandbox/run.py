# Checks the project parses and runs one suite under pytest, each test file
# in its own process, and prints what happened as JSON on stdout, in the
# shape the Node template's sandbox/run.mjs prints:
#
#   python3 sandbox/run.py public|private|own
#
# Any python3 starts it; the suite runs on the project's .venv/bin/python
# (.venv/Scripts/python.exe on Windows),
# which holds pytest. The grader runs the same suites through
# bin/runners/pytest.mjs, which this file cannot reach; the two must agree
# on the shape. A file that fails before any test reports is `crashed`: it
# did not parse, failed to import, or timed out. A file holding a
# LiveCodeBench problem's cases (cases.json beside it) gets the benchmark's
# time: (6 + 1) seconds per case plus 5, plus slack.
import json
import os
import subprocess
import sys
import tempfile

SUITES = {"public": "tests/public", "private": "tests/private", "own": "tests/own"}
FILE_TIMEOUT_S = 120
CASE_TIMEOUT_S = 6
OUTPUT_CHARS = 4000

suite = sys.argv[1] if len(sys.argv) > 1 else ""
if suite not in SUITES:
    print("usage: python3 sandbox/run.py public|private|own", file=sys.stderr)
    sys.exit(2)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Windows keeps a venv's interpreter in Scripts/.
PYTHON = os.path.join(ROOT, ".venv", "Scripts", "python.exe") if os.name == "nt" else os.path.join(ROOT, ".venv", "bin", "python")
if not os.path.exists(PYTHON):
    PYTHON = sys.executable
directory = os.path.join(ROOT, SUITES[suite])
env = {
    **os.environ,
    "PYTHONDONTWRITEBYTECODE": "1",
    "PYTHONHASHSEED": "0",
    "PYTHONPATH": os.path.join(ROOT, "sandbox"),
}


def list_tests(at):
    found = []
    if not os.path.isdir(at):
        return found
    for base, dirs, files in os.walk(at):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for name in files:
            if name.startswith("test_") and name.endswith(".py"):
                found.append(os.path.relpath(os.path.join(base, name), ROOT).replace(os.sep, "/"))
    return sorted(found)


def file_timeout(path):
    cases = os.path.join(os.path.dirname(os.path.join(ROOT, path)), "cases.json")
    try:
        with open(cases, encoding="utf-8") as handle:
            count = len(json.load(handle)["cases"])
    except (OSError, ValueError, KeyError, TypeError):
        return FILE_TIMEOUT_S
    return (CASE_TIMEOUT_S + 1) * count + 5 + 30


def run_file(path):
    handle, report = tempfile.mkstemp(prefix="independent-tests-pytest-", suffix=".jsonl")
    os.close(handle)
    timed_out = False
    code = None
    try:
        try:
            run = subprocess.run(
                [PYTHON, "-m", "pytest", "-p", "independent_tests_reporter", "-q", "--no-header", path],
                cwd=ROOT, env={**env, "INDEPENDENT_TESTS_REPORT": report},
                capture_output=True, text=True, timeout=file_timeout(path),
            )
            code = run.returncode
            output = run.stdout + run.stderr
        except subprocess.TimeoutExpired:
            timed_out = True
            output = ""
        with open(report, encoding="utf-8") as lines:
            records = [json.loads(line) for line in lines if line.startswith("{")]
    finally:
        os.unlink(report)
    tests = [r for r in records if "collectError" not in r]
    # Exit 5 is pytest's "no tests collected": an empty file, not a crash.
    crashed = timed_out or any("collectError" in r for r in records) or (not tests and code not in (0, 5))
    return {
        "file": path,
        "crashed": crashed,
        "timedOut": timed_out,
        "tests": [] if crashed else [{k: t[k] for k in ("name", "ok", "skipped", "error")} for t in tests],
        "output": output,
    }


compile_run = subprocess.run(
    [PYTHON, "-I", os.path.join("sandbox", "compile_check.py")],
    cwd=ROOT, env=env, capture_output=True, text=True,
)
compiled = compile_run.returncode == 0
files = []
for path in list_tests(directory):
    if not compiled:
        files.append({"file": path, "crashed": True, "timedOut": False, "tests": []})
        continue
    item = run_file(path)
    output = item.pop("output")
    if item["crashed"]:
        print(f"  CRASHED {path}:\n{output[-OUTPUT_CHARS:]}", file=sys.stderr)
    files.append(item)

result = {
    "suite": suite,
    "compiled": compiled,
    "compileOutput": "" if compiled else (compile_run.stdout + compile_run.stderr)[:OUTPUT_CHARS],
    "files": files,
}
tests = [test for item in files for test in item["tests"]]
passed = sum(1 for test in tests if test["ok"])
crashed_count = sum(1 for item in files if item["crashed"])
print(
    f"{suite}: {passed}/{len(tests)} passed"
    + ("" if compiled else ", did not parse")
    + (f", {crashed_count} file(s) crashed" if crashed_count else ""),
    file=sys.stderr,
)
for item in files:
    for test in item["tests"]:
        if not test["ok"]:
            message = ((test["error"] or {}).get("message") or "").split("\n")[0]
            print(f"  FAIL {item['file']} :: {test['name']}: {message[:300]}", file=sys.stderr)
print(json.dumps(result, indent=2))
sys.exit(0 if compiled and passed == len(tests) and crashed_count == 0 else 1)
