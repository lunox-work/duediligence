"""Public tests for minimumCost.

spec.md carries only the title and starter code. These cases follow the
published LeetCode statement of "Minimum Cost to Divide Array Into
Subarrays", which that title and signature identify:

  Divide nums into contiguous subarrays. The i-th subarray (1-indexed),
  nums[l..r], costs (nums[0] + ... + nums[r] + k * i) * (cost[l] + ... + cost[r]).
  Return the minimum total cost over all divisions.
  1 <= n <= 1000, len(cost) == n, 1 <= nums[i], cost[i] <= 1000, 1 <= k <= 1000.
"""

import unittest

from sandbox.check import run_case


def brute(nums, cost, k):
    """Try every division (each of the n-1 gaps cut or not) and take the
    cheapest, applying the cost formula literally. Only for tiny n."""
    n = len(nums)
    best = None
    for mask in range(1 << (n - 1)):
        total, l, i = 0, 0, 0
        for r in range(n):
            if r == n - 1 or mask >> r & 1:
                i += 1
                total += (sum(nums[: r + 1]) + k * i) * sum(cost[l : r + 1])
                l = r + 1
        best = total if best is None else min(best, total)
    return best


class TestMinimumCost(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, fn="minimumCost", args=[[3, 1, 4], [4, 6, 6], 1], expected=110)

    def test_sample_2(self):
        run_case(
            self,
            fn="minimumCost",
            args=[[4, 8, 5, 1, 14, 2, 2, 12, 1], [7, 2, 8, 4, 2, 2, 1, 1, 2], 7],
            expected=985,
        )

    def test_single_element_minimum_values(self):
        # Only division is [1]: (1 + 1*1) * 1 = 2.
        run_case(self, fn="minimumCost", args=[[1], [1], 1], expected=2)

    def test_single_element_maximum_values(self):
        # Only division is [1000]: (1000 + 1000*1) * 1000 = 2000000.
        run_case(self, fn="minimumCost", args=[[1000], [1000], 1000], expected=2000000)

    def test_two_elements_all_ones(self):
        # By hand: [1,1] -> (2+1)*2 = 6; [1],[1] -> (1+1)*1 + (2+2)*1 = 6. Min 6.
        run_case(self, fn="minimumCost", args=[[1, 1], [1, 1], 1], expected=6)

    def test_small_mixed_brute_force(self):
        # Expected value from brute() above: all 2^(n-1) divisions.
        nums, cost, k = [5, 1, 3, 2, 4], [2, 7, 1, 3, 1], 2
        run_case(self, fn="minimumCost", args=[nums, cost, k], expected=brute(nums, cost, k))

    def test_maximum_values_small_n_brute_force(self):
        # Every value at its cap 1000; expected value from brute().
        nums, cost, k = [1000] * 6, [1000] * 6, 1000
        run_case(self, fn="minimumCost", args=[nums, cost, k], expected=brute(nums, cost, k))

    def test_large_k_brute_force(self):
        # k at its cap, small nums: expected value from brute().
        nums, cost, k = [1, 2, 1, 3, 1, 2, 1], [3, 1, 4, 1, 5, 9, 2], 1000
        run_case(self, fn="minimumCost", args=[nums, cost, k], expected=brute(nums, cost, k))

    def test_heavy_costs_late_brute_force(self):
        # Large costs near the end; expected value from brute().
        nums, cost, k = [9, 1, 1, 1, 1, 1, 1, 9], [1, 1, 1, 1, 1, 1, 1000, 1000], 1
        run_case(self, fn="minimumCost", args=[nums, cost, k], expected=brute(nums, cost, k))


if __name__ == "__main__":
    unittest.main()
