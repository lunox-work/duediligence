# Checks the project parses and runs one suite, each test file in its own
# process, and prints what happened as JSON on stdout, in the same shape
# as the Node template's sandbox/run.mjs:
#
#   python3 sandbox/run.py public|private|own
#
# The grader runs it on trees it staged itself; a developer runs it to see
# the public suite. A file that fails before any test reports is
# `crashed`: it did not parse, raised on import, or timed out. The private
# suite's file timeout follows the benchmark: (6 + 1) seconds per case
# plus 5.
import json
import os
import subprocess
import sys

SUITES = {"public": "tests/public", "private": "tests/private", "own": "tests/own"}
FILE_TIMEOUT_S = 120
CASE_TIMEOUT_S = 6
OUTPUT_CHARS = 4000

suite = sys.argv[1] if len(sys.argv) > 1 else ""
if suite not in SUITES:
    print("usage: python3 sandbox/run.py public|private|own", file=sys.stderr)
    sys.exit(2)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
directory = os.path.join(ROOT, SUITES[suite])
env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONHASHSEED": "0"}


def list_tests(at):
    found = []
    if not os.path.isdir(at):
        return found
    for base, dirs, files in os.walk(at):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for name in files:
            if name.startswith("test_") and name.endswith(".py"):
                found.append(os.path.relpath(os.path.join(base, name), ROOT))
    return sorted(found)


def file_timeout(path):
    if suite != "private":
        return FILE_TIMEOUT_S
    cases = os.path.join(os.path.dirname(os.path.join(ROOT, path)), "cases.json")
    try:
        with open(cases, encoding="utf-8") as handle:
            count = len(json.load(handle)["cases"])
    except (OSError, ValueError, KeyError, TypeError):
        return FILE_TIMEOUT_S
    return (CASE_TIMEOUT_S + 1) * count + 5 + 30  # the worker's own global timeout, plus slack


compile_run = subprocess.run(
    [sys.executable, "-I", os.path.join("sandbox", "compile_check.py")],
    cwd=ROOT, env=env, capture_output=True, text=True,
)
compiled = compile_run.returncode == 0
files = []
for path in list_tests(directory):
    if not compiled:
        files.append({"file": path, "crashed": True, "timedOut": False, "tests": []})
        continue
    timed_out = False
    try:
        run = subprocess.run(
            [sys.executable, "-I", os.path.join("sandbox", "run_file.py"), path],
            cwd=ROOT, env=env, capture_output=True, text=True, timeout=file_timeout(path),
        )
        stdout = run.stdout or ""
    except subprocess.TimeoutExpired as expired:
        timed_out = True
        stdout = expired.stdout.decode("utf-8", "replace") if isinstance(expired.stdout, bytes) else (expired.stdout or "")
    lines = []
    for line in stdout.split("\n"):
        if line.startswith("{"):
            try:
                lines.append(json.loads(line))
            except ValueError:
                pass
    # A file that never got to its tests reports one failure named after it.
    crashed = timed_out or (len(lines) == 1 and lines[0]["name"] == path and not lines[0]["ok"]) or (len(lines) == 0)
    files.append({
        "file": path,
        "crashed": crashed,
        "timedOut": timed_out,
        "tests": [] if crashed else [{"name": l["name"], "ok": l["ok"], "skipped": l["skipped"], "error": l["error"]} for l in lines],
    })

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
            message = (test["error"] or {}).get("message", "").split("\n")[0]
            print(f"  FAIL {item['file']} :: {test['name']}: {message[:300]}", file=sys.stderr)
print(json.dumps(result, indent=2))
sys.exit(0 if compiled and passed == len(tests) and crashed_count == 0 else 1)
