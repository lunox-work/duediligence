import unittest
from itertools import combinations

from sandbox.check import run_case


def brute(nums, x, k):
    """Obviously correct for tiny inputs: try every set of k non-overlapping
    windows of size x. Windows are disjoint, so their costs add; a window's
    cost is min over targets t of sum |a - t|, and some element of the
    window is an optimal target (the median), so trying each element as t
    suffices."""
    n = len(nums)

    def cost(s):
        w = nums[s:s + x]
        return min(sum(abs(a - t) for a in w) for t in w)

    best = None
    for starts in combinations(range(n - x + 1), k):
        if all(b - a >= x for a, b in zip(starts, starts[1:])):
            total = sum(cost(s) for s in starts)
            if best is None or total < best:
                best = total
    return best


class TestMinOperations(unittest.TestCase):
    # The statement gives no worked samples; every case below is derived
    # by hand or by brute() as noted.

    def test_smallest_already_equal(self):
        # n = 2, x = 2, k = 1: the only window is already equal.
        run_case(self, fn="minOperations", args=[[1, 1], 2, 1], expected=0)

    def test_smallest_needs_ops(self):
        # Only window [1, 3]: |1 - t| + |3 - t| >= 2.
        run_case(self, fn="minOperations", args=[[1, 3], 2, 1], expected=2)

    def test_extreme_values_pair(self):
        # Only window [-10^6, 10^6]: cost is the gap, 2 * 10^6.
        run_case(self, fn="minOperations",
                 args=[[-10**6, 10**6], 2, 1], expected=2 * 10**6)

    def test_negative_equal(self):
        # Already equal at the minimum value: no operations.
        run_case(self, fn="minOperations",
                 args=[[-10**6, -10**6, -10**6], 3, 1], expected=0)

    def test_picks_cheapest_window(self):
        # Middle window [10, 10] is already equal.
        run_case(self, fn="minOperations", args=[[1, 10, 10, 1], 2, 1], expected=0)

    def test_greedy_cheapest_window_fails(self):
        # k * x == n forces windows [1, 2] and [2, 1], cost 1 + 1 = 2,
        # even though [2, 2] in the middle alone would cost 0.
        run_case(self, fn="minOperations", args=[[1, 2, 2, 1], 2, 2], expected=2)

    def test_brute_x3_k2(self):
        nums, x, k = [5, -2, 1, 3, 7, 3, 6, 4, -1], 3, 2
        # By hand: [-2, 1, 3] -> 1 costs 5, [3, 6, 4] -> 4 costs 3; total 8.
        expected = brute(nums, x, k)
        self.assertEqual(expected, 8)
        run_case(self, fn="minOperations", args=[nums, x, k], expected=expected)

    def test_brute_x2_k2(self):
        nums, x, k = [9, -2, -2, -2, 1, 5], 2, 2
        # By hand: [-2, -2] costs 0, [-2, 1] costs 3; total 3.
        expected = brute(nums, x, k)
        self.assertEqual(expected, 3)
        run_case(self, fn="minOperations", args=[nums, x, k], expected=expected)

    def test_brute_x2_k3_gaps(self):
        nums, x, k = [4, 0, 7, 7, 1, 3, 3, 9, 2, 2], 2, 3
        # By hand: [7, 7], [3, 3], [2, 2] are disjoint and cost 0.
        expected = brute(nums, x, k)
        self.assertEqual(expected, 0)
        run_case(self, fn="minOperations", args=[nums, x, k], expected=expected)

    def test_brute_x4_k2(self):
        nums, x, k = [3, 8, -1, 5, 0, 2, 6, -4, 7, 1], 4, 2
        expected = brute(nums, x, k)  # computed by exhaustive search
        run_case(self, fn="minOperations", args=[nums, x, k], expected=expected)

    def test_max_k_forced_tiling_extremes(self):
        # k = 15, x = 2, n = 30: windows are forced to be the 15 pairs,
        # each [-10^6, 10^6] costing 2 * 10^6.
        nums = [-10**6, 10**6] * 15
        run_case(self, fn="minOperations", args=[nums, 2, 15],
                 expected=15 * 2 * 10**6)

    def test_max_n_all_zero(self):
        # n = 10^5, all equal: any windows cost 0.
        run_case(self, fn="minOperations", args=[[0] * 10**5, 2, 15], expected=0)

    def test_max_n_consecutive_x2(self):
        # Every pair of consecutive integers costs exactly 1; 15 windows -> 15.
        run_case(self, fn="minOperations",
                 args=[list(range(10**5)), 2, 15], expected=15)

    def test_max_n_consecutive_large_x(self):
        # Every window of x = 2m consecutive integers costs m^2 (distances
        # to the median m..1 and 0..m-1). m = 3333, k = 15, k*x = 99990.
        run_case(self, fn="minOperations",
                 args=[list(range(10**5)), 6666, 15], expected=15 * 3333 ** 2)

    def test_max_n_single_window_extremes(self):
        # x = n = 10^5, half 0 and half 10^6: any target in [0, 10^6]
        # costs 50000 * 10^6.
        nums = [0] * 50000 + [10**6] * 50000
        run_case(self, fn="minOperations", args=[nums, 10**5, 1],
                 expected=50000 * 10**6)


if __name__ == "__main__":
    unittest.main()
