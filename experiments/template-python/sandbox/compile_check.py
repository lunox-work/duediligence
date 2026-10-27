# Parses every .py under src/ and tests/ and reports syntax errors. The
# Python counterpart of `tsc --noEmit`: it proves the files load as code,
# nothing about their behaviour.
#
#   python3 sandbox/compile_check.py
import ast
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
problems = []
for top in ("src", "tests"):
    for base, dirs, files in os.walk(os.path.join(ROOT, top)):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for name in sorted(files):
            if not name.endswith(".py"):
                continue
            path = os.path.join(base, name)
            try:
                with open(path, encoding="utf-8") as handle:
                    ast.parse(handle.read(), filename=path)
            except SyntaxError as error:
                problems.append(f"{os.path.relpath(path, ROOT)}:{error.lineno}: {error.msg}")
            except (UnicodeDecodeError, ValueError) as error:
                problems.append(f"{os.path.relpath(path, ROOT)}: {error}")
for line in problems:
    print(line)
sys.exit(1 if problems else 0)
