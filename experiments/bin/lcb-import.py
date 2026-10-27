#!/usr/bin/env python3
"""Step 1 for LiveCodeBench: turns problems from the benchmark's
code_generation_lite release into specs in this folder's layout, with the
benchmark's private test cases as the hidden suite and no model involved.

    python3 -I bin/lcb-import.py [--difficulty hard] [--newest 40] [--file test6.jsonl] [--cache DIR] [--force]

Writes, per problem, specs/lcb-<platform>-<id>/:
  spec.md                    the statement and format line as the benchmark prompts it
  toolchain.json             {"name": "python", "reference": false, "generate": ["public"]}
  skeleton/src/main.py       a stdin program that raises `not implemented`, or
  skeleton/src/solution.py   the starter `class Solution` whose method raises
  tests/private/cases.json   the private test cases (gitignored: large, re-importable)
  tests/private/test_hidden.py  one unittest per case, through the vendored checker
  problem.json               provenance: platform, id, contest date, difficulty, counts

The dataset file is downloaded into --cache (default ~/.cache/double-blind/lcb)
when missing. Private cases are stored zlib+base64 around a pickled JSON
string; they are unpickled with a loader that admits no classes at all.
"""
import argparse
import base64
import io
import json
import os
import pickle
import re
import sys
import urllib.request
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPECS = os.path.join(ROOT, "specs")
DATASET = "https://huggingface.co/datasets/livecodebench/code_generation_lite/resolve/main/"
FORMAT_STDIN = (
    "Read the inputs from stdin solve the problem and write the answer to stdout "
    "(do not directly test on the sample inputs). Enclose your code within delimiters as follows. "
    "Ensure that when the python program runs, it reads the inputs, runs the algorithm and writes output to STDOUT."
)
FORMAT_STARTER = "You will use the following starter code to write the solution to the problem and enclose your code within delimiters."


class StringOnly(pickle.Unpickler):
    def find_class(self, module, name):
        raise pickle.UnpicklingError(f"refused {module}.{name}: the payload should be a plain string")


def private_cases(raw):
    try:
        return json.loads(raw)
    except ValueError:
        text = StringOnly(io.BytesIO(zlib.decompress(base64.b64decode(raw)))).load()
        if not isinstance(text, str):
            raise SystemExit("private_test_cases did not unpickle to a string")
        return json.loads(text)


def fetch(name, cache):
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, name)
    if not os.path.exists(path):
        print(f"downloading {name} to {cache}", file=sys.stderr)
        urllib.request.urlretrieve(DATASET + name, path)
    return path


def slug_of(row):
    ident = re.sub(r"[^a-z0-9_]+", "-", str(row["question_id"]).lower()).strip("-")
    return f"lcb-{row['platform']}-{ident}"


def skeleton(row):
    starter = row["starter_code"].rstrip()
    if not starter:
        return "main.py", (
            "# Interface contract: this program reads the input described in spec.md\n"
            "# from standard input and prints the answer to standard output.\n"
            "import sys\n\n\n"
            "def main() -> None:\n"
            "    data = sys.stdin.read()\n"
            '    raise NotImplementedError("not implemented")\n\n\n'
            'if __name__ == "__main__":\n'
            "    main()\n"
        )
    last = starter.split("\n")[-1]
    indent = len(last) - len(last.lstrip()) + 4
    body = " " * indent + 'raise NotImplementedError("not implemented")\n'
    return "solution.py", "from typing import *\n\n\n" + starter + "\n" + body


HIDDEN = '''"""The hidden suite: this problem's private test cases from LiveCodeBench,
run through the benchmark's own checker in order and stopping at the first
failure, as the benchmark does. One test per case; a case after the first
failure fails as not reached."""
import json
import os
import unittest

from sandbox.check import describe, run_cases

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "cases.json"), encoding="utf-8") as handle:
    DATA = json.load(handle)
CASES = DATA["cases"]
FN = DATA.get("fn_name")


class Hidden(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.results, cls.metadata = run_cases(CASES, FN)


def make(index):
    def test(self):
        results = self.results
        if index < len(results) and results[index] is True:
            return
        if index < len(results):
            self.fail(describe(self.metadata))
        self.fail("not reached: an earlier case failed")

    return test


for i in range(len(CASES)):
    setattr(Hidden, f"test_case_{i + 1:04d}", make(i))
'''


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def spec_text(row):
    out = f"# {row['question_title']}\n\n{row['question_content'].strip()}\n\n## Format\n\n"
    if row["starter_code"].strip():
        out += f"{FORMAT_STARTER}\n\n```python\n{row['starter_code'].rstrip()}\n```\n"
    else:
        out += f"{FORMAT_STDIN}\n"
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--difficulty", default="hard")
    parser.add_argument("--newest", type=int, default=40)
    parser.add_argument("--file", default="test6.jsonl")
    parser.add_argument("--cache", default=os.path.expanduser("~/.cache/double-blind/lcb"))
    parser.add_argument("--force", action="store_true")
    options = parser.parse_args()

    rows = []
    with open(fetch(options.file, options.cache), encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            if options.difficulty in ("any", row["difficulty"]):
                rows.append(row)
    rows.sort(key=lambda row: (row["contest_date"], str(row["question_id"])), reverse=True)
    rows = rows[: options.newest]

    written = []
    for row in rows:
        slug = slug_of(row)
        out = os.path.join(SPECS, slug)
        if os.path.exists(os.path.join(out, "spec.md")) and not options.force:
            if not os.path.exists(os.path.join(out, "tests", "private", "cases.json")):
                pass  # the gitignored cases are rewritten below
            else:
                written.append(slug)
                continue
        public = json.loads(row["public_test_cases"])
        private = private_cases(row["private_test_cases"])
        metadata = json.loads(row["metadata"]) if row["metadata"] else {}
        fn = metadata.get("func_name")
        name, stub = skeleton(row)
        if (name == "solution.py") != bool(fn):
            raise SystemExit(f"{slug}: starter code and func_name disagree")
        if not os.path.exists(os.path.join(out, "spec.md")) or options.force:
            write(os.path.join(out, "spec.md"), spec_text(row))
            write(os.path.join(out, "toolchain.json"), json.dumps({"name": "python", "reference": False, "generate": ["public"]}, indent=2) + "\n")
            write(os.path.join(out, "skeleton", "src", name), stub)
            write(os.path.join(out, "problem.json"), json.dumps({
                "benchmark": "LiveCodeBench code_generation_lite",
                "file": options.file,
                "platform": row["platform"],
                "question_id": row["question_id"],
                "contest_id": row["contest_id"],
                "contest_date": row["contest_date"],
                "difficulty": row["difficulty"],
                "title": row["question_title"],
                "kind": "functional" if fn else "stdin",
                "fn_name": fn,
                "publicCases": len(public),
                "privateCases": len(private),
            }, indent=2) + "\n")
        write(os.path.join(out, "tests", "private", "cases.json"), json.dumps({
            "fn_name": fn,
            "cases": [{"input": case["input"], "output": case["output"]} for case in private],
        }))
        write(os.path.join(out, "tests", "private", "test_hidden.py"), HIDDEN)
        written.append(slug)
        print(f"{slug}: {row['contest_date'][:10]} {row['difficulty']} {len(public)} public, {len(private)} private cases", file=sys.stderr)
    print("\n".join(written))


if __name__ == "__main__":
    main()
