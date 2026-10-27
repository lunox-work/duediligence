import itertools
import unittest

from sandbox.check import run_case


def brute(nums, k, limit):
    """Every non-empty subsequence (index combination, order kept), straight
    from the statement: alternating sum == k and product <= limit; the
    largest such product, or -1. Only used on tiny inputs."""
    best = -1
    for size in range(1, len(nums) + 1):
        for idx in itertools.combinations(range(len(nums)), size):
            seq = [nums[i] for i in idx]
            alt = sum(v if j % 2 == 0 else -v for j, v in enumerate(seq))
            prod = 1
            for v in seq:
                prod *= v
            if alt == k and prod <= limit:
                best = max(best, prod)
    return best


class TestMaxProduct(unittest.TestCase):
    # The statement gives no worked examples and no constraints. The cases
    # below keep to small arrays, elements 0..12 and limit >= 1, and each
    # expected value is derived by hand from the definition and, where the
    # array is small enough, cross-checked by brute() in the test itself.

    def check(self, nums, k, limit, expected):
        # Hand-derived answers are confirmed against the brute force first.
        if len(nums) <= 12:
            self.assertEqual(brute(nums, k, limit), expected)
        run_case(self, fn="maxProduct", args=[nums, k, limit], expected=expected)

    def test_whole_array_best(self):
        # [1,2,3]: 1-2+3 = 2, product 6 <= 10; no product can exceed 6.
        self.check([1, 2, 3], 2, 10, 6)

    def test_unreachable_sum(self):
        # [0,2,3]: the most negative alternating sum is 0-3 = -3, so -5 is impossible.
        self.check([0, 2, 3], -5, 12, -1)

    def test_even_length_zero_sum(self):
        # [2,2,3,3], k=0: [3,3] gives 3-3 = 0, product 9 = limit (allowed).
        self.check([2, 2, 3, 3], 0, 9, 9)

    def test_single_element_match(self):
        # Smallest input: [5] alternates to 5, product 5 <= 5.
        self.check([5], 5, 5, 5)

    def test_single_element_product_over_limit(self):
        # [5] has the right sum but product 5 > 4.
        self.check([5], 5, 4, -1)

    def test_single_element_wrong_sum(self):
        # The only subsequence [5] has alternating sum 5, not 4.
        self.check([5], 4, 100, -1)

    def test_single_zero(self):
        # [0]: sum 0, product 0 <= 1.
        self.check([0], 0, 1, 0)

    def test_single_twelve_at_limit(self):
        # [12]: sum 12, product 12 equals the limit, which is not exceeding it.
        self.check([12], 12, 12, 12)

    def test_single_twelve_over_limit(self):
        # [12]: product 12 > 11, the only candidate.
        self.check([12], 12, 11, -1)

    def test_zero_product_only_option(self):
        # [0,7], k=-7: only [0,7] (0-7) works; product 0 <= 1.
        self.check([0, 7], -7, 1, 0)

    def test_order_matters(self):
        # [3,1], k=-2: subsequences are [3]=3, [1]=1, [3,1]=2; -2 needs [1,3], which is not a subsequence.
        self.check([3, 1], -2, 100, -1)

    def test_limit_forces_smaller_product(self):
        # [2,1,3,2], k=2: the subsequences summing to 2 are [2] (product 2) and
        # [2,1,3,2] (2-1+3-2, product 12 > 5), so the answer is 2.
        self.check([2, 1, 3, 2], 2, 5, 2)

    def test_limit_allows_larger_product(self):
        # Same array, limit 12: [2,1,3,2] has alternating sum 2 and product 12.
        self.check([2, 1, 3, 2], 2, 12, 12)

    def test_brute_small_mixed(self):
        # Expected computed by brute() over all 2^9 - 1 subsequences.
        nums, k, limit = [4, 0, 3, 7, 1, 2, 6, 5, 2], 3, 50
        run_case(self, fn="maxProduct", args=[nums, k, limit], expected=brute(nums, k, limit))

    def test_brute_small_negative_k(self):
        # Expected computed by brute() over all 2^10 - 1 subsequences.
        nums, k, limit = [1, 5, 2, 8, 3, 3, 9, 1, 4, 2], -6, 200
        run_case(self, fn="maxProduct", args=[nums, k, limit], expected=brute(nums, k, limit))

    def test_all_ones_long(self):
        # 150 ones: odd-length subsequences sum to 1, product 1 <= 1.
        self.check([1] * 150, 1, 1, 1)

    def test_all_twelves_even(self):
        # 150 twelves, k=0: only even lengths sum to 0; 12^2 = 144 <= 5000 < 12^4.
        self.check([12] * 150, 0, 5000, 144)

    def test_all_twelves_odd(self):
        # 150 twelves, k=12: only odd lengths sum to 12; 12^3 = 1728 <= 5000 < 12^5.
        self.check([12] * 150, 12, 5000, 1728)

    def test_k_far_above_reach(self):
        # Alternating sum is at most the sum of elements, 150*12 = 1800 < 100000.
        self.check([12] * 150, 100000, 5000, -1)

    def test_k_far_below_reach(self):
        # Alternating sum is at least -(sum of elements) = -1800 > -100000.
        self.check([12] * 150, -100000, 5000, -1)


if __name__ == "__main__":
    unittest.main()
