import unittest

from sandbox.check import run_case


def brute(nums, cost, k):
    """Every division of a tiny array, costed exactly as the statement
    defines it: bit g of `mask` set means a new subarray starts at g + 1."""
    n = len(nums)
    best = None
    for mask in range(1 << (n - 1)):
        total, l, i = 0, 0, 1
        for r in range(n):
            if r == n - 1 or mask >> r & 1:
                total += (sum(nums[: r + 1]) + k * i) * sum(cost[l : r + 1])
                l, i = r + 1, i + 1
        if best is None or total < best:
            best = total
    return best


class TestMinimumCost(unittest.TestCase):
    # The statement gives no samples; small cases are checked against the
    # exhaustive brute force above.

    def test_single_element_smallest(self):
        # One subarray: (1 + 1*1) * 1 = 2.
        run_case(self, fn="minimumCost", args=[[1], [1], 1], expected=2)

    def test_single_element_largest_values(self):
        # One subarray: (1000 + 1000*1) * 1000 = 2000000.
        run_case(self, fn="minimumCost", args=[[1000], [1000], 1000], expected=2000000)

    def test_two_elements_keep_together(self):
        # Whole: (1+1+1000)*2 = 2004; split: (1+1000)*1 + (2+2000)*1 = 3003.
        run_case(self, fn="minimumCost", args=[[1, 1], [1, 1], 1000], expected=2004)

    def test_two_elements_split(self):
        # Whole: (1000+1000+1)*2 = 4002; split: (1000+1)*1 + (2000+2)*1 = 3003.
        run_case(self, fn="minimumCost", args=[[1000, 1000], [1, 1], 1], expected=3003)

    def test_three_elements_brute(self):
        nums, cost, k = [3, 1, 4], [4, 6, 6], 1
        run_case(self, fn="minimumCost", args=[nums, cost, k], expected=brute(nums, cost, k))

    def test_nine_elements_brute(self):
        nums, cost, k = [4, 8, 5, 1, 14, 2, 2, 12, 1], [7, 2, 8, 4, 2, 2, 1, 1, 2], 7
        run_case(self, fn="minimumCost", args=[nums, cost, k], expected=brute(nums, cost, k))

    def test_mixed_large_values_brute(self):
        nums, cost, k = [1000, 1, 500, 999, 2, 1000, 7, 300], [1, 1000, 3, 1000, 999, 1, 450, 2], 1000
        run_case(self, fn="minimumCost", args=[nums, cost, k], expected=brute(nums, cost, k))

    def test_twelve_elements_brute(self):
        nums = [5, 9, 1, 1, 13, 7, 2, 8, 3, 6, 10, 4]
        cost = [2, 1, 7, 3, 1, 9, 4, 2, 6, 1, 5, 8]
        k = 3
        run_case(self, fn="minimumCost", args=[nums, cost, k], expected=brute(nums, cost, k))

    def test_max_length_one_subarray_optimal(self):
        # n = 1000, nums = cost = 1, k = 1000. Splitting off the subarray
        # that starts at l adds k*(n - l) for its later order, and saves at
        # most (n - 1)*(n - l) on the elements before it, which is less;
        # so the whole array is optimal: (1000 + 1000) * 1000 = 2000000.
        run_case(self, fn="minimumCost", args=[[1] * 1000, [1] * 1000, 1000], expected=2000000)

    def test_max_length_max_values_singletons_optimal(self):
        # n = 1000, nums = cost = 1000, k = 1. Not splitting before index l
        # makes element l-1 pay at least nums[l]*cost[l-1] = 10^6 more and
        # saves only k * (cost of l..n-1) <= 999000, so every element alone
        # is optimal. Element j is subarray j+1:
        # sum_j (1000*(j+1) + (j+1)) * 1000 = 1001000 * 500500 = 501000500000.
        run_case(self, fn="minimumCost", args=[[1000] * 1000, [1000] * 1000, 1], expected=501000500000)


if __name__ == "__main__":
    unittest.main()
