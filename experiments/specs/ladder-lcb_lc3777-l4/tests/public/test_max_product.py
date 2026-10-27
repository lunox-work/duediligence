# spec.md has only the title and starter code. These cases follow the
# published problem with that title (LeetCode 3509): choose a non-empty
# subsequence whose alternating sum (even positions minus odd positions,
# 0-indexed within the subsequence) equals k and whose product is at most
# limit; return the largest such product, or -1 if none exists.
# Constraints: 1 <= len(nums) <= 150, 0 <= nums[i] <= 12,
# -10^5 <= k <= 10^5, 1 <= limit <= 5000.
import unittest

from sandbox.check import run_case


class TestMaxProduct(unittest.TestCase):
    # Samples from the statement.

    def test_example_1(self):
        run_case(self, fn="maxProduct", args=[[1, 2, 3], 2, 10], expected=6)

    def test_example_2(self):
        run_case(self, fn="maxProduct", args=[[0, 2, 3], -5, 12], expected=-1)

    def test_example_3(self):
        run_case(self, fn="maxProduct", args=[[2, 2, 3, 3], 0, 9], expected=9)

    # Boundary cases. Expected values derived by hand; the small ones were
    # also confirmed by enumerating every subsequence.

    def test_single_zero(self):
        # Only subsequence [0]: alternating sum 0, product 0 <= 1.
        run_case(self, fn="maxProduct", args=[[0], 0, 1], expected=0)

    def test_single_max_value(self):
        # Only subsequence [12]: alternating sum 12, product 12 <= 5000.
        run_case(self, fn="maxProduct", args=[[12], 12, 5000], expected=12)

    def test_single_product_exceeds_limit(self):
        # [12] has the right sum, but its product 12 exceeds limit 11.
        run_case(self, fn="maxProduct", args=[[12], 12, 11], expected=-1)

    def test_single_wrong_sum(self):
        # The only alternating sum available is 5, not 3.
        run_case(self, fn="maxProduct", args=[[5], 3, 10], expected=-1)

    def test_k_at_max(self):
        # The only alternating sum available is 1.
        run_case(self, fn="maxProduct", args=[[1], 100000, 1], expected=-1)

    def test_k_at_min(self):
        # The only alternating sum available is 1.
        run_case(self, fn="maxProduct", args=[[1], -100000, 1], expected=-1)

    def test_product_equal_to_limit_allowed(self):
        # Sum 12 comes from [12] (12) or [12,12,12] (1728); 1728 <= 5000.
        run_case(self, fn="maxProduct", args=[[12, 12, 12], 12, 5000], expected=1728)

    def test_product_one_over_limit(self):
        # Same subsequences; 1728 > 1727, so only [12] with product 12 is left.
        run_case(self, fn="maxProduct", args=[[12, 12, 12], 12, 1727], expected=12)

    def test_zero_in_middle(self):
        # Sum 0: [3,3] (9), [0] (0), [3,0]/[0,3] are 3/-3, [3,0,3] is 6.
        run_case(self, fn="maxProduct", args=[[3, 0, 3], 0, 5000], expected=9)

    def test_negative_k_unreachable(self):
        # Alternating sums available: 5, 3, 5-3=2. None is -3.
        run_case(self, fn="maxProduct", args=[[5, 3], -3, 5000], expected=-1)

    def test_max_length_all_twelve(self):
        # Odd-length subsequences sum to 12 with product 12^len; even-length
        # ones sum to 0. 12^3 = 1728 <= 5000 < 12^5, so the answer is 1728.
        run_case(self, fn="maxProduct", args=[[12] * 150, 12, 5000], expected=1728)

    def test_max_length_all_twelve_negative_k(self):
        # Alternating sums available are only 12 and 0.
        run_case(self, fn="maxProduct", args=[[12] * 150, -12, 5000], expected=-1)

    def test_max_length_all_zero(self):
        # Every subsequence has alternating sum 0 and product 0.
        run_case(self, fn="maxProduct", args=[[0] * 150, 0, 1], expected=0)


if __name__ == "__main__":
    unittest.main()
