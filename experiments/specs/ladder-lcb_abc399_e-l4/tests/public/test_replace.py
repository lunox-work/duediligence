# Public tests for spec.md ("Replace").
#
# spec.md gives only the input format (N, S, T) and the output rule
# ("print the minimum number of operations required, otherwise -1"). It
# does not define the operation, list samples, or state constraints. So
# the only answer that follows from it with certainty is this one: when S
# already equals T, zero operations make them identical, so the minimum
# is 0, whatever the operation is. Strings are kept short and in
# lowercase letters to stay inside any plausible constraints.
import unittest

from sandbox.check import run_case


class TestReplace(unittest.TestCase):
    def test_smallest_input_identical(self):
        # N = 1, S == T: no operation needed.
        run_case(self, stdin="1\na\na\n", expected="0")

    def test_identical_with_repeated_letters(self):
        # S == T: no operation needed.
        run_case(self, stdin="4\nabac\nabac\n", expected="0")

    def test_identical_all_letters(self):
        # S == T over all 26 lowercase letters: no operation needed.
        alphabet = "abcdefghijklmnopqrstuvwxyz"
        run_case(self, stdin=f"26\n{alphabet}\n{alphabet}\n", expected="0")


if __name__ == "__main__":
    unittest.main()
