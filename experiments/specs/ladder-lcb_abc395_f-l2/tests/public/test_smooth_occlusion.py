# spec.md gives no samples and no constraints, so every case here is
# small (N >= 2, every length >= 1, X >= 1) and its expected answer was
# derived by hand and confirmed by an exhaustive brute force over every
# target H and every vector of final upper lengths.
#
# Reasoning used throughout: grinding only lowers lengths, so the cost is
# sum(U_i + D_i) - N * H, and the task is to maximise a feasible H.
import unittest

from sandbox.check import run_case


class TestSmoothOcclusion(unittest.TestCase):
    def test_already_fit_minimal(self):
        # Smallest case: two identical pairs already satisfy both conditions.
        run_case(self, stdin="2 1\n1 1\n1 1\n", expected="0")

    def test_already_fit_large_x(self):
        # Sums are 6 and 6, |5 - 1| = 4 <= 100: nothing to grind.
        run_case(self, stdin="2 100\n5 1\n1 5\n", expected="0")

    def test_h_limited_by_smallest_sum(self):
        # Sums 4 and 2, so H <= 2. H = 2 with u = (1, 1) is valid.
        # Cost = 6 - 2 * 2 = 2.
        run_case(self, stdin="2 5\n3 1\n1 1\n", expected="2")

    def test_x_constraint_binds(self):
        # Sums 6 and 6, but u1 >= H - 1 and u2 <= 1 need H - 2 <= 1,
        # so H = 3 at most (u = (2, 1)). Cost = 12 - 2 * 3 = 6.
        run_case(self, stdin="2 1\n5 1\n1 5\n", expected="6")

    def test_short_upper_tooth_on_left_limits_chain(self):
        # u1 <= 1 forces u2 <= 2, u3 <= 3, u4 <= 4; then H <= min(1+9,
        # 2+9, 3+9, 4+9) = 10. Cost = 64 - 4 * 10 = 24.
        run_case(self, stdin="4 1\n1 9\n9 9\n9 9\n9 9\n", expected="24")

    def test_short_upper_tooth_on_right_limits_chain(self):
        # Mirror of the previous case: the limit spreads leftwards. Cost 24.
        run_case(self, stdin="4 1\n9 9\n9 9\n9 9\n1 9\n", expected="24")

    def test_short_upper_tooth_in_middle(self):
        # u2 <= 1 caps u1, u3 at 3 with X = 2; H <= min(3+1, 1+9, 3+1) = 4.
        # Cost = 30 - 3 * 4 = 18.
        run_case(self, stdin="3 2\n9 1\n1 9\n9 1\n", expected="18")

    def test_mixed_four_teeth(self):
        # Caps on u after spreading with X = 3: (3, 4, 5, 2) -> H <= min(4,
        # 5, 14, 8) = 4. Cost = 31 - 4 * 4 = 15.
        run_case(self, stdin="4 3\n3 1\n4 1\n5 9\n2 6\n", expected="15")


if __name__ == "__main__":
    unittest.main()
