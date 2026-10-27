# spec.md gives no samples or constraints. Inputs stay within the original
# problem's limits (2 <= x, 1 <= k <= 15, k * x <= len(nums) <= 10^5,
# |nums[i]| <= 10^6). Each window's cost is sum |a - t| minimised over the
# target t; every expected value below was worked out by hand from the
# window costs and checked against an exhaustive search over all window
# placements and all integer targets.
import unittest

from sandbox.check import run_case


class TestMinOperations(unittest.TestCase):
    def test_two_windows_of_three(self):
        # Window costs by start: 7,5,6,4,4,3,7; best disjoint pair is
        # [-2,1,3] (5, to 1) + [3,6,4] (3, to 4) = 8.
        run_case(self, fn="minOperations",
                 args=[[5, -2, 1, 3, 7, 3, 6, 4, -1], 3, 2], expected=8)

    def test_one_zero_cost_window_plus_cheapest_other(self):
        # Pair costs by start: 11,0,0,3,4; best disjoint: start 1 (0) + start 3 (3).
        run_case(self, fn="minOperations",
                 args=[[9, -2, -2, -2, 1, 5], 2, 2], expected=3)

    def test_smallest_input(self):
        run_case(self, fn="minOperations", args=[[1, 2], 2, 1], expected=1)

    def test_already_equal(self):
        run_case(self, fn="minOperations", args=[[7, 7], 2, 1], expected=0)

    def test_extreme_values(self):
        # Both elements must meet somewhere in between: 2 * 10^6 steps.
        run_case(self, fn="minOperations",
                 args=[[-1000000, 1000000], 2, 1], expected=2000000)

    def test_negative_values_zero_cost(self):
        run_case(self, fn="minOperations", args=[[-5, -5, -3], 2, 1], expected=0)

    def test_windows_tile_whole_array(self):
        # k * x == n forces [1,2] and [3,4]: 1 + 1.
        run_case(self, fn="minOperations", args=[[1, 2, 3, 4], 2, 2], expected=2)

    def test_forced_tiling_skips_cheap_middle(self):
        # Only placement is [5,1] and [1,5]: 4 + 4; the free [1,1] overlaps both.
        run_case(self, fn="minOperations", args=[[5, 1, 1, 5], 2, 2], expected=8)

    def test_cheapest_windows_overlap(self):
        # Pair costs by start: 9,1,1,7. The two cheapest (starts 1, 2) overlap;
        # best disjoint pair is starts 1 and 3: 1 + 7.
        run_case(self, fn="minOperations", args=[[10, 1, 2, 3, 10], 2, 2], expected=8)

    def test_odd_window_median(self):
        # Window costs by start: 8,8,6,5,6. Disjoint pairs: (0,3)=13,
        # (0,4)=14, (1,4)=14.
        run_case(self, fn="minOperations", args=[[4, 0, 8, 2, 6, 1, 7], 3, 2], expected=13)

    def test_max_k_forced_pairs(self):
        # n = 30, x = 2, k = 15: windows are forced to (0,1),(2,3),...; each costs 1.
        run_case(self, fn="minOperations", args=[list(range(30)), 2, 15], expected=15)

    def test_large_all_equal(self):
        run_case(self, fn="minOperations", args=[[0] * 100000, 7, 15], expected=0)

    def test_large_alternating_even_window(self):
        # Every window of 4 holds two 0s and two 10^6s: cost 2 * 10^6 each.
        run_case(self, fn="minOperations",
                 args=[[0, 1000000] * 50000, 4, 15], expected=30000000)

    def test_large_alternating_odd_window(self):
        # Every window of 3 holds two of one value and one of the other: cost 10^6.
        run_case(self, fn="minOperations",
                 args=[[0, 1000000] * 50000, 3, 15], expected=15000000)

    def test_large_window(self):
        # x = 50000, k = 2 tiles the array; each half is 0..49999 alternating
        # with 10^6 -> 25000 of each value, so each half costs 25000 * 10^6.
        run_case(self, fn="minOperations",
                 args=[[0, 1000000] * 50000, 50000, 2], expected=50000000000)


if __name__ == "__main__":
    unittest.main()
