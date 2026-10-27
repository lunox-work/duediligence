# Public cases for spec.md ("Uniform Sum").
#
# spec.md gives no samples, no constraints, and does not say how a blank
# entry is written in the input, so every case here has no blanks: each
# A_i and B_i is a small non-negative integer. With no blanks the question
# is only whether some reordering of A makes every A_i + B_i equal. Each
# expected answer was derived by hand, as the comment on the case shows.
import unittest

from sandbox.check import run_case


class TestUniformSum(unittest.TestCase):
    def test_single_position_zeros(self):
        # N = 1: one sum, so it is trivially uniform.
        run_case(self, stdin="1\n0\n0\n", expected="Yes")

    def test_single_position_nonzero(self):
        # N = 1: one sum (5 + 3), trivially uniform.
        run_case(self, stdin="1\n5\n3\n", expected="Yes")

    def test_all_zeros(self):
        # Every sum is 0 in any order.
        run_case(self, stdin="4\n0 0 0 0\n0 0 0 0\n", expected="Yes")

    def test_already_uniform(self):
        # Order as given: 5+5 = 0+10 = 10+0 = 10.
        run_case(self, stdin="3\n5 0 10\n5 10 0\n", expected="Yes")

    def test_needs_reordering(self):
        # As given the sums are 0, 10, 20; reversing A gives
        # 10+0 = 5+5 = 0+10 = 10.
        run_case(self, stdin="3\n0 5 10\n0 5 10\n", expected="Yes")

    def test_two_swap_yes(self):
        # Swap A to (2, 1): 2+1 = 1+2 = 3.
        run_case(self, stdin="2\n1 2\n1 2\n", expected="Yes")

    def test_two_no(self):
        # A = (1, 1) in either order gives sums 2 and 3.
        run_case(self, stdin="2\n1 1\n1 2\n", expected="No")

    def test_zeros_against_distinct(self):
        # A = (0, 0) in either order gives sums 0 and 1.
        run_case(self, stdin="2\n0 0\n0 1\n", expected="No")

    def test_three_permutation_yes(self):
        # Common sum must be (6 + 3) / 3 = 3: A = (3, 1, 2) as given pairs
        # 3+0 = 1+2 = 2+1 = 3.
        run_case(self, stdin="3\n3 1 2\n0 2 1\n", expected="Yes")

    def test_three_total_not_divisible(self):
        # All values sum to 13; three equal sums would need 3S = 13, which
        # has no integer solution, so no order works.
        run_case(self, stdin="3\n1 2 3\n1 2 4\n", expected="No")


if __name__ == "__main__":
    unittest.main()
