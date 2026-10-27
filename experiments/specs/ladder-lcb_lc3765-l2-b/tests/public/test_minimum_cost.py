import itertools
import unittest

from sandbox.check import run_case


def brute_force(nums, cost, k):
    """Minimum over every one of the 2^(n-1) divisions of nums, each costed
    directly by the statement's formula. Only used for tiny inputs."""
    n = len(nums)
    best = None
    for cuts in itertools.product([False, True], repeat=n - 1):
        # cuts[j] is True when a new subarray starts at index j + 1.
        starts = [0] + [j + 1 for j in range(n - 1) if cuts[j]]
        ends = starts[1:] + [n]
        total = 0
        for i, (l, r_excl) in enumerate(zip(starts, ends), start=1):
            total += (sum(nums[:r_excl]) + k * i) * sum(cost[l:r_excl])
        if best is None or total < best:
            best = total
    return best


class TestMinimumCost(unittest.TestCase):
    def check(self, nums, cost, k, expected):
        run_case(self, fn="minimumCost", args=[nums, cost, k], expected=expected)

    def check_brute(self, nums, cost, k):
        self.check(nums, cost, k, brute_force(nums, cost, k))

    # Samples from the statement.

    def test_example_1(self):
        self.check([3, 1, 4], [4, 6, 6], 1, 110)

    def test_example_2(self):
        self.check([4, 8, 5, 1, 14, 2, 2, 12, 1], [7, 2, 8, 4, 2, 2, 1, 1, 2], 7, 985)

    # Smallest input: one element, so the only division is one subarray.

    def test_single_element_minimum_values(self):
        # (1 + 1 * 1) * 1 = 2, by hand.
        self.check([1], [1], 1, 2)

    def test_single_element_maximum_values(self):
        # (1000 + 1000 * 1) * 1000 = 2000000, by hand.
        self.check([1000], [1000], 1000, 2000000)

    # Two elements: only two divisions exist.

    def test_two_elements_split_is_better(self):
        # Whole: (1 + 1000 + 1) * (1000 + 1) = 1002 * 1001 = 1003002.
        # Split: (1 + 1) * 1000 + (1 + 1000 + 2) * 1 = 2000 + 1003 = 3003.
        self.check([1, 1000], [1000, 1], 1, 3003)

    def test_two_elements_whole_is_better(self):
        # Whole: (1 + 1 + 1000) * (1 + 1) = 2004.
        # Split: (1 + 1000) * 1 + (1 + 1 + 2000) * 1 = 1001 + 2002 = 3003.
        self.check([1, 1], [1, 1], 1000, 2004)

    # Small inputs checked against the brute force above.

    def test_brute_small_mixed(self):
        self.check_brute([5, 2, 9, 1, 7, 3], [3, 8, 1, 6, 2, 9], 4)

    def test_brute_all_max_values(self):
        self.check_brute([1000] * 10, [1000] * 10, 1000)

    def test_brute_max_values_small_k(self):
        self.check_brute([1000] * 10, [1000] * 10, 1)

    def test_brute_all_min_values(self):
        self.check_brute([1] * 10, [1] * 10, 1)

    def test_brute_decreasing_cost(self):
        self.check_brute([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100], 1)

    def test_brute_increasing_nums_large_k(self):
        self.check_brute([10, 100, 1000, 1, 50, 500, 5, 999], [7, 1, 1000, 3, 3, 250, 2, 40], 1000)

    # Largest length.

    def test_max_length_all_ones_k_1000(self):
        # nums = cost = all ones, n = 1000, k = 1000. One subarray costs
        # (1000 + 1000) * 1000 = 2000000. Any division with subarrays
        # starting at 0 = l_1 < l_2 < ... < l_m (sizes s_t) differs from it by
        #   k * sum_{t>=2} (n - l_t)  -  sum_{t>=2} s_t * l_t,
        # and since s_t <= n - l_t and l_t <= 999 < k, every term is
        # positive, so one subarray is the unique optimum.
        self.check([1] * 1000, [1] * 1000, 1000, 2000000)


if __name__ == "__main__":
    unittest.main()
