import unittest

from sandbox.check import run_case

# spec.md gives no samples, so every expected value below is derived.
# Shortening only lowers lengths, so if every pair ends at total H the cost
# is sum(U_i + D_i) - N*H: the answer is fixed by the largest feasible H.
# Each small case was also checked by a brute force that tries every H and
# every choice of final upper lengths. Every case gives the same answer
# whether a tooth may be ground down to length 0 or must stay at least 1;
# the statement does not say which.


class TestSmoothOcclusion(unittest.TestCase):
    def test_four_pairs_mixed(self):
        # Totals 4,5,14,8 (sum 31), so H <= 4. H=4 works with uppers
        # 3,4,4,2 (lowers 1,0,0,2; adjacent diffs <= 3). Cost 31 - 4*4 = 15.
        # Confirmed by brute force.
        run_case(self, stdin="4 3\n3 1\n4 1\n5 9\n2 6\n", expected="15")

    def test_smallest_all_ones(self):
        # Already balanced (both totals 2, uppers equal): nothing to do.
        run_case(self, stdin="2 1\n1 1\n1 1\n", expected="0")

    def test_already_satisfied_large_x(self):
        # All pairs total 6 and all uppers equal: cost 0.
        run_case(self, stdin="4 1000000000\n3 3\n3 3\n3 3\n3 3\n", expected="0")

    def test_totals_differ_x_not_binding(self):
        # X never binds, so H = min total = 2; cost (2+5+8) - 3*2 = 9.
        run_case(self, stdin="3 1000000000\n1 1\n2 3\n4 4\n", expected="9")

    def test_adjacent_limit_forces_lower_total(self):
        # Totals 6,6. Upper_1 >= H-1 and upper_2 <= 1, so H-2 <= X=1, H <= 3.
        # H=3 works with uppers 2,1. Cost 12 - 2*3 = 6.
        run_case(self, stdin="2 1\n5 1\n1 5\n", expected="6")

    def test_zigzag_three_positions(self):
        # Totals 5 each. H=5 forces uppers 4,1,4 (diff 3 > X=2). H=4 allows
        # uppers 3,1,3. Cost 15 - 3*4 = 3.
        run_case(self, stdin="3 2\n4 1\n1 4\n4 1\n", expected="3")

    def test_max_values_equal(self):
        # Every tooth at 1e9, uppers equal: cost 0.
        run_case(self, stdin="2 1\n1000000000 1000000000\n1000000000 1000000000\n", expected="0")

    def test_max_values_against_smallest_pair(self):
        # Pair 2 totals 2, so H <= 2; H=2 with every tooth 1 is valid.
        # Cost (2e9 + 2) - 2*2 = 1999999998 (exceeds 32 bits).
        run_case(self, stdin="2 1\n1000000000 1000000000\n1 1\n", expected="1999999998")

    def test_many_max_values_against_smallest_pair(self):
        # Last pair totals 2, so H <= 2; H=2 with every tooth 1 is valid.
        # Cost (6e9 + 2) - 4*2 = 5999999994.
        run_case(
            self,
            stdin="4 1\n1000000000 1000000000\n1000000000 1000000000\n1000000000 1000000000\n1 1\n",
            expected="5999999994",
        )


if __name__ == "__main__":
    unittest.main()
