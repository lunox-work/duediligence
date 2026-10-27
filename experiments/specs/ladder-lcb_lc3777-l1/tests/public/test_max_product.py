import itertools
import unittest

from sandbox.check import run_case


def brute(nums, k, limit):
    # Obviously correct for tiny inputs: enumerate every non-empty
    # subsequence (index combination, order kept), keep those whose
    # alternating sum is k and whose product is at most limit, take the max.
    best = -1
    for r in range(1, len(nums) + 1):
        for idx in itertools.combinations(range(len(nums)), r):
            sub = [nums[i] for i in idx]
            alt = sum(v if j % 2 == 0 else -v for j, v in enumerate(sub))
            if alt != k:
                continue
            prod = 1
            for v in sub:
                prod *= v
            if prod <= limit:
                best = max(best, prod)
    return best


class TestMaxProduct(unittest.TestCase):
    # The statement gives no samples. The next three are LeetCode 3509's
    # examples, each checked by hand against the definition.

    def test_example_1(self):
        # [1,2,3]: 1-2+3 = 2, product 6 <= 10; the only other match is [2].
        run_case(self, fn="maxProduct", args=[[1, 2, 3], 2, 10], expected=6)

    def test_example_2(self):
        # No subsequence of [0,2,3] has alternating sum -5.
        run_case(self, fn="maxProduct", args=[[0, 2, 3], -5, 12], expected=-1)

    def test_example_3(self):
        # [3,3] gives 9; [2,2,3,3] / [2,3,3,2] give 36 > 9.
        run_case(self, fn="maxProduct", args=[[2, 2, 3, 3], 0, 9], expected=9)

    # Smallest input: a single element.

    def test_single_element_match(self):
        run_case(self, fn="maxProduct", args=[[7], 7, 7], expected=7)

    def test_single_element_product_over_limit(self):
        # Only candidate is [5], product 5 > limit 4.
        run_case(self, fn="maxProduct", args=[[5], 5, 4], expected=-1)

    def test_single_element_sum_mismatch(self):
        run_case(self, fn="maxProduct", args=[[5], 4, 5000], expected=-1)

    def test_single_zero(self):
        # [0]: alternating sum 0, product 0 <= 1.
        run_case(self, fn="maxProduct", args=[[0], 0, 1], expected=0)

    def test_max_element_value(self):
        # nums[i] = 12 is the largest allowed value.
        run_case(self, fn="maxProduct", args=[[12], 12, 12], expected=12)

    def test_zero_product_only_option(self):
        # Only [0,5] has alternating sum -5; its product 0 is the answer.
        run_case(self, fn="maxProduct", args=[[0, 5], -5, 1], expected=0)

    def test_negative_k(self):
        # [1,12]: 1-12 = -11, product 12.
        run_case(self, fn="maxProduct", args=[[1, 12], -11, 12], expected=12)

    def test_negative_k_over_limit(self):
        run_case(self, fn="maxProduct", args=[[1, 12], -11, 11], expected=-1)

    def test_smallest_limit(self):
        # limit = 1: [1] alone has alternating sum 1 and product 1.
        run_case(self, fn="maxProduct", args=[[3, 1, 2], 1, 1], expected=1)

    # Extremes of k: alternating sums of 150 values in [0, 12] lie in
    # [-900, 900], so k = +-10^5 is unreachable.

    def test_k_max_unreachable(self):
        run_case(self, fn="maxProduct", args=[[12] * 150, 100000, 5000], expected=-1)

    def test_k_min_unreachable(self):
        run_case(self, fn="maxProduct", args=[[12] * 150, -100000, 5000], expected=-1)

    # Largest length, all elements 12, largest limit. Odd-length
    # subsequences sum to 12 and even-length ones to 0; products 12^len.

    def test_max_length_all_twelve_k12(self):
        # 12^3 = 1728 <= 5000 < 12^5.
        run_case(self, fn="maxProduct", args=[[12] * 150, 12, 5000], expected=1728)

    def test_max_length_all_twelve_k0(self):
        # 12^2 = 144 <= 5000 < 12^4.
        run_case(self, fn="maxProduct", args=[[12] * 150, 0, 5000], expected=144)

    def test_max_length_all_ones_k0(self):
        # Any even-length subsequence of 1s: sum 0, product 1.
        run_case(self, fn="maxProduct", args=[[1] * 150, 0, 5000], expected=1)

    def test_max_length_all_zeros(self):
        # Every subsequence sums to 0 with product 0.
        run_case(self, fn="maxProduct", args=[[0] * 150, 0, 1], expected=0)

    # Tiny cases whose expected value is computed by brute() above.

    def _brute_case(self, nums, k, limit):
        run_case(self, fn="maxProduct", args=[nums, k, limit],
                 expected=brute(nums, k, limit))

    def test_brute_mixed_1(self):
        self._brute_case([3, 0, 4, 2, 5], 2, 30)

    def test_brute_mixed_2(self):
        self._brute_case([2, 5, 1, 3, 4, 6], -1, 50)

    def test_brute_mixed_3(self):
        self._brute_case([12, 11, 10, 9, 8, 7, 6], 3, 5000)

    def test_brute_mixed_4(self):
        self._brute_case([1, 4, 0, 6, 2, 2, 9], 6, 100)


if __name__ == "__main__":
    unittest.main()
