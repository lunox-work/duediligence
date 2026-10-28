# The contract: spec.md, "Interface: a command", and the TypeScript types of each name's arguments and result in tests/public/boundary.ts.
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from patch import MalformedDiff, apply_patch

COMMANDS = {"applyPatch": apply_patch}


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        sys.stderr.write(f"usage: cli.py <{'|'.join(COMMANDS)}>\n")
        sys.exit(2)
    args = json.loads(sys.stdin.read())
    try:
        result = COMMANDS[sys.argv[1]](*args)
    except MalformedDiff as error:
        sys.stderr.write(f"{error}\n")
        sys.exit(1)
    if result is not None:
        sys.stdout.write(json.dumps(result))
    sys.exit(0)


if __name__ == "__main__":
    main()
