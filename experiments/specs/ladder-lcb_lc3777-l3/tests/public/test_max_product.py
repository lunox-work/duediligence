# The statement gives no samples, no constraints, and no answer for the
# case where no subsequence qualifies, so every case here has at least one
# subsequence with alternating sum k and product <= limit. Each expected
# value is the same whether the first element of a subsequence is added
# or subtracted, so no case depends on how "even positions" is indexed.
# Values stay in 0..12, lengths <= 150, limit in 1..5000.
# Every expected value was derived by hand (reasoning in the comment) and
# checked with an exhaustive enumeration of all subsequences.
import unittest

from sandbox.check import run_case


class TestMaxProduct(unittest.TestCase):
    def test_single_zero(self):
        # Only subsequence [0]: alternating sum 0, product 0 <= 1.
        run_case(self, fn="maxProduct", args=[[0], 0, 1], expected=0)

    def test_two_ones_limit_one(self):
        # [1,1]: 1 - 1 = 0, product 1 <= 1. Single [1] has sum +-1.
        run_case(self, fn="maxProduct", args=[[1, 1], 0, 1], expected=1)

    def test_largest_values_pair(self):
        # [12,12]: 12 - 12 = 0, product 144. Single [12] has sum +-12.
        run_case(self, fn="maxProduct", args=[[12, 12], 0, 5000], expected=144)

    def test_product_equal_to_limit_allowed(self):
        # Same as above; 144 does not exceed limit 144, so it counts.
        run_case(self, fn="maxProduct", args=[[12, 12], 0, 144], expected=144)

    def test_skip_middle_element(self):
        # Sums: [2],[3],[2] -> +-2,+-3; [2,3] -> +-1; [3,2] -> +-1;
        # [2,2] -> 0 (product 4); [2,3,2] -> +-1. Only [2,2] reaches 0.
        run_case(self, fn="maxProduct", args=[[2, 3, 2], 0, 10], expected=4)

    def test_zero_product_when_larger_exceeds_limit(self):
        # Sum 0: [0] (product 0) and [5,5] (product 25 > 20). [5,0,5] sums
        # to +-10, [5,0]/[0,5] to +-5. Best within limit is 0.
        run_case(self, fn="maxProduct", args=[[5, 0, 5], 0, 20], expected=0)

    def test_positive_k(self):
        # Sum +1: [1] (product 1) and [2,1] or [1,2] depending on sign
        # convention (product 2); [1,2,1] sums to 0. Best is 2.
        run_case(self, fn="maxProduct", args=[[1, 2, 1], 1, 5], expected=2)

    def test_negative_k(self):
        # Sum -1: [1] under one convention, and [1,2] / [2,1] (product 2)
        # under either. Best is 2.
        run_case(self, fn="maxProduct", args=[[1, 2, 1], -1, 5], expected=2)

    def test_pick_best_of_several(self):
        # Sum 2 is reached by [2] (product 2) and by [4,2] or [2,4]
        # (product 8); all other subsequences sum to 0, +-4, +-6 or +-8
        # (e.g. [4,2,2,4] -> 0, [4,2,4] -> +-6). Best is 8 <= 20.
        run_case(self, fn="maxProduct", args=[[4, 2, 2, 4], 2, 20], expected=8)

    def test_zero_inside_subsequence(self):
        # Sum 3 (either convention): [3,0] or [0,3], product 0 <= 1.
        # [3] alone has product 3 > 1.
        run_case(self, fn="maxProduct", args=[[3, 0, 3], 3, 1], expected=0)

    def test_longest_all_twelves(self):
        # Sum 0 needs an even count of 12s; products 144, 20736, ...
        # Largest <= 5000 is 144.
        run_case(self, fn="maxProduct", args=[[12] * 150, 0, 5000], expected=144)

    def test_longest_all_twos(self):
        # Sum 0 needs an even count of 2s: products 2^2, 2^4, ...
        # 2^12 = 4096 <= 5000 < 2^14, so 4096.
        run_case(self, fn="maxProduct", args=[[2] * 150, 0, 5000], expected=4096)

    def test_longest_all_ones(self):
        # [1,1] sums to 0 with product 1 <= 1.
        run_case(self, fn="maxProduct", args=[[1] * 150, 0, 1], expected=1)

    def test_longest_all_zeros(self):
        # Every subsequence has sum 0 and product 0.
        run_case(self, fn="maxProduct", args=[[0] * 150, 0, 5000], expected=0)

    def test_longest_only_zero_fits(self):
        # Sum 0 from 12s alone needs an even count: product >= 144 > 100.
        # [0] sums to 0 with product 0, so the answer is 0.
        run_case(self, fn="maxProduct", args=[[12] * 149 + [0], 0, 100], expected=0)


if __name__ == "__main__":
    unittest.main()
