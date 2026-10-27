# spec.md carries only the title and starter code. The cases below follow
# the LeetCode problem that title names (3505): with +1/-1 operations on
# single elements, return the minimum number of operations so that nums
# has at least k non-overlapping subarrays of size exactly x whose
# elements are all equal. Constraints: 2 <= len(nums) <= 10^5,
# -10^6 <= nums[i] <= 10^6, 2 <= x <= len(nums), 1 <= k <= 15,
# 2 <= k * x <= len(nums).
import unittest
from itertools import combinations

from sandbox.check import run_case


def brute(nums, x, k):
    """Exhaustive answer for tiny inputs: try every set of k
    non-overlapping windows; a window's cost is the cheapest target among
    its own values (the optimum of sum |a - t| lies at a median, which is
    one of the values)."""
    def cost(window):
        return min(sum(abs(a - t) for a in window) for t in set(window))

    best = None
    for starts in combinations(range(len(nums) - x + 1), k):
        if any(b - a < x for a, b in zip(starts, starts[1:])):
            continue
        total = sum(cost(nums[s:s + x]) for s in starts)
        if best is None or total < best:
            best = total
    return best


class TestMinOperations(unittest.TestCase):
    def test_example_1(self):
        run_case(self, fn="minOperations",
                 args=[[5, -2, 1, 3, 7, 3, 6, 4, -1], 3, 2], expected=8)

    def test_example_2(self):
        run_case(self, fn="minOperations",
                 args=[[9, -2, -2, -2, 1, 5], 2, 2], expected=3)

    def test_smallest_input(self):
        # n = 2, x = 2, k = 1: one window [1, 2], one step makes it equal.
        run_case(self, fn="minOperations", args=[[1, 2], 2, 1], expected=1)

    def test_extreme_values(self):
        # Window [-10^6, 10^6]: any target between them costs 2 * 10^6.
        run_case(self, fn="minOperations",
                 args=[[-10**6, 10**6], 2, 1], expected=2 * 10**6)

    def test_already_equal(self):
        # Every element equal: no operation needed.
        run_case(self, fn="minOperations",
                 args=[[7, 7, 7, 7, 7, 7], 3, 2], expected=0)

    def test_full_partition(self):
        # k * x == n forces windows [1,3], [2,2], [5,9]: 2 + 0 + 4.
        run_case(self, fn="minOperations",
                 args=[[1, 3, 2, 2, 5, 9], 2, 3], expected=6)

    def test_window_is_whole_array_odd(self):
        # x == n, median 3: 2 + 2 + 1 + 5 + 0.
        run_case(self, fn="minOperations",
                 args=[[1, 5, 2, 8, 3], 5, 1], expected=10)

    def test_window_is_whole_array_even(self):
        # x == n, any target in [2, 3]: with 2, 1 + 0 + 1 + 8.
        run_case(self, fn="minOperations",
                 args=[[1, 2, 3, 10], 4, 1], expected=10)

    def test_windows_must_not_overlap(self):
        # Overlapping [1,1] windows would cost 0, but with n = 4, x = 2,
        # k = 2 the only choice is [1,1] and [1,9]: 0 + 8.
        run_case(self, fn="minOperations",
                 args=[[1, 1, 1, 9], 2, 2], expected=8)

    def test_max_k(self):
        # k = 15, x = 2, n = 30 forces the pairs (2j, 2j+1), each costing 1.
        run_case(self, fn="minOperations",
                 args=[list(range(30)), 2, 15], expected=15)

    def test_all_windows_same_cost(self):
        # Every size-3 window of this array holds two of one value and one
        # of the other (difference 4), so each costs 4: 2 * 4.
        run_case(self, fn="minOperations",
                 args=[[4, 0, 4, 0, 4, 4, 0, 4], 3, 2], expected=8)

    def test_small_mixed_brute_force(self):
        nums, x, k = [3, -1, 4, 1, -5, 9, 2, -6, 5, 3], 2, 3
        run_case(self, fn="minOperations", args=[nums, x, k],
                 expected=brute(nums, x, k))

    def test_large_n_alternating_extremes(self):
        # n = 10^5 alternating -10^6, 10^6: every size-2 window holds one of
        # each and costs 2 * 10^6; k = 15 windows cost 15 * 2 * 10^6.
        nums = [-10**6, 10**6] * 50000
        run_case(self, fn="minOperations", args=[nums, 2, 15],
                 expected=15 * 2 * 10**6)

    def test_large_single_window(self):
        # x = n = 10^5, 50000 copies each of -10^6 and 10^6: any target in
        # between costs 50000 * 2 * 10^6.
        nums = [-10**6, 10**6] * 50000
        run_case(self, fn="minOperations", args=[nums, 10**5, 1],
                 expected=50000 * 2 * 10**6)


if __name__ == "__main__":
    unittest.main()
