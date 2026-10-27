import unittest

from sandbox.check import run_case


def brute(nums, k, limit):
    """Every non-empty subsequence by bitmask; only for tiny inputs."""
    best = -1
    n = len(nums)
    for mask in range(1, 1 << n):
        picked = [nums[i] for i in range(n) if mask >> i & 1]
        alt = sum(x if j % 2 == 0 else -x for j, x in enumerate(picked))
        prod = 1
        for x in picked:
            prod *= x
        if alt == k and prod <= limit:
            best = max(best, prod)
    return best


class TestMaxProduct(unittest.TestCase):
    # Samples from the statement.

    def test_example_1(self):
        run_case(self, fn="maxProduct", args=[[1, 2, 3], 2, 10], expected=6)

    def test_example_2(self):
        run_case(self, fn="maxProduct", args=[[0, 2, 3], -5, 12], expected=-1)

    def test_example_3(self):
        run_case(self, fn="maxProduct", args=[[2, 2, 3, 3], 0, 9], expected=9)

    # Smallest input: a single element. The only subsequence is [x],
    # with alternating sum x and product x.

    def test_single_element_matches(self):
        run_case(self, fn="maxProduct", args=[[5], 5, 5], expected=5)

    def test_single_element_product_over_limit(self):
        # [5] has sum 5 but product 5 > limit 4.
        run_case(self, fn="maxProduct", args=[[5], 5, 4], expected=-1)

    def test_single_element_sum_mismatch(self):
        run_case(self, fn="maxProduct", args=[[3], 2, 10], expected=-1)

    def test_single_zero(self):
        # [0] has sum 0 and product 0 <= 1.
        run_case(self, fn="maxProduct", args=[[0], 0, 1], expected=0)

    # Largest element value, 12.

    def test_max_value_element_at_limit(self):
        run_case(self, fn="maxProduct", args=[[12], 12, 12], expected=12)

    def test_max_value_element_over_limit(self):
        run_case(self, fn="maxProduct", args=[[12], 12, 11], expected=-1)

    # Extreme k: unreachable with a single element of at most 12.

    def test_k_max_unreachable(self):
        run_case(self, fn="maxProduct", args=[[12], 100000, 5000], expected=-1)

    def test_k_min_unreachable(self):
        run_case(self, fn="maxProduct", args=[[12], -100000, 5000], expected=-1)

    # A zero makes the product 0, which is always within the limit.

    def test_zero_product_negative_k(self):
        # Only [0, 5] has alternating sum -5; its product is 0.
        run_case(self, fn="maxProduct", args=[[0, 5], -5, 1], expected=0)

    # All elements 12: a subsequence of length L has alternating sum 12
    # if L is odd and 0 if L is even, and product 12^L.

    def test_four_twelves_k_zero_max_limit(self):
        # Even L: 144 (L=2) <= 5000, 20736 (L=4) > 5000.
        run_case(self, fn="maxProduct", args=[[12] * 4, 0, 5000], expected=144)

    def test_max_length_twelves_k_zero(self):
        # n = 150; even L with 12^L <= 5000 is only L=2 -> 144.
        run_case(self, fn="maxProduct", args=[[12] * 150, 0, 5000], expected=144)

    def test_max_length_twelves_k_twelve(self):
        # n = 150; odd L with 12^L <= 5000: L=1 -> 12, L=3 -> 1728.
        run_case(self, fn="maxProduct", args=[[12] * 150, 12, 5000], expected=1728)

    def test_max_length_ones(self):
        # n = 150 ones: any even-length subsequence has sum 0, product 1.
        run_case(self, fn="maxProduct", args=[[1] * 150, 0, 1], expected=1)

    def test_max_length_ones_unreachable_k(self):
        # Alternating sum of ones is 0 or 1, never 2.
        run_case(self, fn="maxProduct", args=[[1] * 150, 2, 5000], expected=-1)

    # Tiny mixed inputs; expected values from the bitmask brute force above.

    def test_brute_mixed_a(self):
        args = [[3, 0, 4, 1, 2, 5], 1, 20]
        run_case(self, fn="maxProduct", args=args, expected=brute(*args))

    def test_brute_mixed_b(self):
        args = [[7, 2, 9, 3, 6, 4, 8], 4, 100]
        run_case(self, fn="maxProduct", args=args, expected=brute(*args))

    def test_brute_mixed_c(self):
        args = [[12, 11, 10, 2, 1, 6], -3, 5000]
        run_case(self, fn="maxProduct", args=args, expected=brute(*args))


if __name__ == "__main__":
    unittest.main()
