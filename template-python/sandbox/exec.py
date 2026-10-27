# Runs the program the way acceptance runs it, through LiveCodeBench's
# checker, and prints what it produced. No expected output is involved.
#
#   python3 sandbox/exec.py < input.txt              src/main.py on that stdin
#   python3 sandbox/exec.py --fn NAME ARG_JSON...    Solution.NAME(*args) from src/solution.py
#
# The checker wraps a stdin program's top-level statements in a function
# and mocks sys.stdin, input() and open(); a program that passes here
# behaves the same under acceptance.
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from sandbox.check import source  # noqa: E402
from sandbox.lcb import Capturing, call_method, clean_if_name, compile_code, get_function, import_string, make_function  # noqa: E402

argv = sys.argv[1:]
if argv[:1] == ["--fn"]:
    if len(argv) < 2:
        print("usage: python3 sandbox/exec.py --fn NAME ARG_JSON...", file=sys.stderr)
        sys.exit(2)
    name, args = argv[1], [json.loads(arg) for arg in argv[2:]]
    solution = compile_code(import_string + "\n\n" + source(name), 60)
    method = get_function(solution, name)
    if method is None:
        print(f"no method {name} on Solution", file=sys.stderr)
        sys.exit(1)
    result = method(*args)
    print(json.dumps(list(result) if isinstance(result, tuple) else result))
else:
    stdin = sys.stdin.read()
    code = make_function(clean_if_name(source()))
    method = get_function(compile_code(code, 60), "wrapped_function")
    with Capturing() as captured:
        call_method(method, stdin)
    sys.stdout.write(captured[0])
