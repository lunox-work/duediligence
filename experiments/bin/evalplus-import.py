#!/usr/bin/env python3
"""HumanEval+ as an outside oracle for the suite generator: picks tasks and
writes them as specs, with the canonical solution as the reference and no
benchmark test anywhere in the spec folder. The generator then writes the
public and hidden suites from the prompt alone (bin/generate.mjs), and
bin/evalplus-score.mjs judges EvalPlus's released solutions with them.

    python3 -I bin/evalplus-import.py [--top 30] [--random 10] [--seed 7] [--cache DIR] [--force]

Labels come from EvalPlus's own evaluator, run beforehand on its released
greedy solutions (`evalplus.evaluate humaneval --samples <set>` in
<cache>/samples/<set>/, writing eval_results.json). A task's weight is how
many solutions pass HumanEval's base tests and fail HumanEval+: the
solutions the original visible tests wrongly accept. --top takes the
heaviest; --random adds others, seeded, so false rejections are measured
on tasks the base tests already judge well.

Writes, per task, specs/he-<n>/:
  spec.md                    the prompt, as the function to implement
  toolchain.json             python toolchain, prompts/pyfunc/, both suites generated, no reference session
  skeleton/src/solution.py   the prompt with a body that raises `not implemented`
  reference/src/solution.py  the canonical solution
  problem.json               provenance and the task's label counts
"""
import argparse
import glob
import gzip
import json
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPECS = os.path.join(ROOT, "specs")


def labels(cache):
    """task_id -> list of (set, base_status, plus_status), one per released solution."""
    out = {}
    for path in sorted(glob.glob(os.path.join(cache, "samples", "*", "eval_results.json"))):
        name = os.path.basename(os.path.dirname(path))
        with open(path, encoding="utf-8") as handle:
            for task, rows in json.load(handle)["eval"].items():
                for row in rows:
                    out.setdefault(task, []).append((name, row["base_status"], row["plus_status"]))
    return out


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--top", type=int, default=30)
    parser.add_argument("--random", type=int, default=10)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--cache", default=os.path.expanduser("~/.cache/double-blind/evalplus"))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    with gzip.open(os.path.join(args.cache, "HumanEvalPlus.jsonl.gz"), "rt", encoding="utf-8") as handle:
        tasks = {row["task_id"]: row for row in map(json.loads, handle)}
    seen = labels(args.cache)
    if not seen:
        raise SystemExit("no eval_results.json under the cache's samples/: run evalplus.evaluate first")

    def weight(task):
        return sum(1 for _, base, plus in seen.get(task, []) if base == "pass" and plus != "pass")

    ranked = sorted(tasks, key=lambda task: (-weight(task), int(task.split("/")[1])))
    top = [task for task in ranked[: args.top] if weight(task) > 0]
    rest = sorted(set(tasks) - set(top), key=lambda task: int(task.split("/")[1]))
    picked = top + random.Random(args.seed).sample(rest, min(args.random, len(rest)))

    for task in picked:
        row = tasks[task]
        n = task.split("/")[1]
        out = os.path.join(SPECS, f"he-{n}")
        if os.path.exists(os.path.join(out, "spec.md")) and not args.force:
            continue
        name = row["entry_point"]
        prompt = row["prompt"].rstrip("\n") + "\n"
        write(
            os.path.join(out, "spec.md"),
            f"# {name}\n\nImplement `{name}` in `src/solution.py` as its docstring "
            f"describes. The signature is fixed.\n\n```python\n{prompt}```\n",
        )
        write(os.path.join(out, "skeleton", "src", "solution.py"), prompt + '    raise NotImplementedError("not implemented")\n')
        write(os.path.join(out, "reference", "src", "solution.py"), prompt + row["canonical_solution"])
        write(
            os.path.join(out, "toolchain.json"),
            json.dumps({"name": "python", "prompts": "pyfunc", "reference": False, "generate": ["public", "private"]}, indent=2) + "\n",
        )
        rows = seen.get(task, [])
        write(
            os.path.join(out, "problem.json"),
            json.dumps(
                {
                    "source": "HumanEval+ v0.1.10 (evalplus/humanevalplus_release)",
                    "task_id": task,
                    "entry_point": name,
                    "picked": "top" if task in top else "random",
                    "solutions": len(rows),
                    "basePassPlusFail": weight(task),
                    "plusPass": sum(1 for _, _, plus in rows if plus == "pass"),
                },
                indent=2,
            )
            + "\n",
        )
    print(f"{len(picked)} task(s): {len(top)} top, {len(picked) - len(top)} random")


if __name__ == "__main__":
    main()
