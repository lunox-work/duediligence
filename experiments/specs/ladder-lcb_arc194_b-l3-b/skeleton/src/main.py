# Interface contract: this program reads the input described in spec.md
# from standard input and prints the answer to standard output.
import sys


def main() -> None:
    data = sys.stdin.read()
    raise NotImplementedError("not implemented")


if __name__ == "__main__":
    main()
