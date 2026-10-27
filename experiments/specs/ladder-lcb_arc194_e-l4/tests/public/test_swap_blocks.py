# spec.md gives only the title, input format and output format: no
# samples, no constraints and no definition of the operation. These cases
# hold under any reading of the title "Swap 0^X and 1^Y" (an operation
# that exchanges a block of X zeros with a block of Y ones, X, Y >= 1):
#   - if S already equals T, it is possible (zero operations) -> Yes;
#   - a swap keeps the number of 0s and of 1s, so if S and T differ in
#     those counts, it is impossible -> No.
import unittest

from sandbox.check import run_case


class TestSwapBlocks(unittest.TestCase):
    # Smallest input. S already equals T.
    def test_min_identical_zero(self):
        run_case(self, stdin="1 1 1\n0\n0\n", expected="Yes")

    def test_min_identical_one(self):
        run_case(self, stdin="1 1 1\n1\n1\n", expected="Yes")

    # Smallest input. A swap needs X + Y >= 2 characters, so a length-1
    # string never changes. Also, the digit counts differ.
    def test_min_zero_to_one(self):
        run_case(self, stdin="1 1 1\n0\n1\n", expected="No")

    def test_min_one_to_zero(self):
        run_case(self, stdin="1 1 1\n1\n0\n", expected="No")

    # S already equals T, so no operation is needed.
    def test_identical_longer(self):
        run_case(self, stdin="6 2 3\n010110\n010110\n", expected="Yes")

    # S has two 1s and T has three. Swaps keep the counts, so No.
    def test_count_mismatch(self):
        run_case(self, stdin="4 1 1\n0011\n0111\n", expected="No")


if __name__ == "__main__":
    unittest.main()
