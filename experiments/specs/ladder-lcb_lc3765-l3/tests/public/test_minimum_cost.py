import itertools
import unittest

from sandbox.check import run_case


def brute_force(nums, cost, k):
    """Try every way to cut the array (2^(n-1) cut patterns) and score each
    split exactly as the statement defines it: the i-th subarray ending at
    index r costs (nums[0] + ... + nums[r] + k * i) * (sum of cost over the
    subarray). Only used on tiny inputs."""
    n = len(nums)
    best = None
    for cuts in itertools.product([False, True], repeat=n - 1):
        total = 0
        start = 0
        i = 0
        for r in range(n):
            if r == n - 1 or cuts[r]:
                i += 1
                total += (sum(nums[: r + 1]) + k * i) * sum(cost[start : r + 1])
                start = r + 1
        if best is None or total < best:
            best = total
    return best


class TestMinimumCost(unittest.TestCase):
    def test_single_element(self):
        # Only one split: (5 + 2*1) * 3 = 21.
        self.assertEqual(brute_force([5], [3], 2), 21)
        run_case(self, fn="minimumCost", args=[[5], [3], 2], expected=21)

    def test_single_element_all_ones(self):
        # Smallest input with smallest positive values: (1 + 1*1) * 1 = 2.
        self.assertEqual(brute_force([1], [1], 1), 2)
        run_case(self, fn="minimumCost", args=[[1], [1], 1], expected=2)

    def test_single_element_large_values(self):
        # Only one split: (1000 + 1000*1) * 1000 = 2000000.
        self.assertEqual(brute_force([1000], [1000], 1000), 2000000)
        run_case(self, fn="minimumCost", args=[[1000], [1000], 1000], expected=2000000)

    def test_two_elements_split_is_better(self):
        # Whole array: (3 + 1) * 2 = 8.
        # Split [1] | [2]: (1 + 1) * 1 + (3 + 2) * 1 = 7.  Minimum 7.
        self.assertEqual(brute_force([1, 2], [1, 1], 1), 7)
        run_case(self, fn="minimumCost", args=[[1, 2], [1, 1], 1], expected=7)

    def test_two_elements_whole_is_better(self):
        # Whole array: (2 + 10) * 2 = 24.
        # Split [1] | [1]: (1 + 10) * 1 + (2 + 20) * 1 = 33.  Minimum 24.
        self.assertEqual(brute_force([1, 1], [1, 1], 10), 24)
        run_case(self, fn="minimumCost", args=[[1, 1], [1, 1], 10], expected=24)

    def test_three_elements(self):
        # By hand: [3, 1] | [4] costs (4 + 1) * 10 + (8 + 2) * 6 = 110;
        # whole array costs (8 + 1) * 16 = 144; [3] | [1, 4] costs
        # (3 + 1) * 4 + (8 + 2) * 12 = 136; [3] | [1] | [4] costs
        # 16 + 6 * 6 + 11 * 6 = 118.  Minimum 110 (confirmed by brute force).
        self.assertEqual(brute_force([3, 1, 4], [4, 6, 6], 1), 110)
        run_case(self, fn="minimumCost", args=[[3, 1, 4], [4, 6, 6], 1], expected=110)

    def test_nine_elements(self):
        # Expected computed by the brute force above over all 2^8 splits.
        nums = [4, 8, 5, 1, 14, 2, 2, 12, 1]
        cost = [7, 2, 8, 4, 2, 2, 1, 1, 2]
        expected = brute_force(nums, cost, 7)
        run_case(self, fn="minimumCost", args=[nums, cost, 7], expected=expected)

    def test_all_ones_eight_elements(self):
        # Expected computed by the brute force above over all 2^7 splits.
        nums = [1] * 8
        cost = [1] * 8
        expected = brute_force(nums, cost, 1)
        run_case(self, fn="minimumCost", args=[nums, cost, 1], expected=expected)

    def test_large_values_six_elements(self):
        # Expected computed by the brute force above over all 2^5 splits.
        nums = [1000] * 6
        cost = [1000] * 6
        expected = brute_force(nums, cost, 1000)
        run_case(self, fn="minimumCost", args=[nums, cost, 1000], expected=expected)

    def test_mixed_seven_elements(self):
        # Expected computed by the brute force above over all 2^6 splits.
        nums = [9, 1, 1, 7, 3, 1, 5]
        cost = [1, 9, 2, 1, 8, 3, 1]
        expected = brute_force(nums, cost, 3)
        run_case(self, fn="minimumCost", args=[nums, cost, 3], expected=expected)


if __name__ == "__main__":
    unittest.main()
