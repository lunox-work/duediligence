# spec.md holds only the title and starter code. The cases below use the
# definition of LeetCode 3490 "Count Beautiful Numbers": a positive integer
# is beautiful if the product of its digits is divisible by the sum of its
# digits; return how many beautiful numbers lie in [l, r], 1 <= l <= r < 10^9.
import unittest

from sandbox.check import run_case


def is_beautiful(n):
    digits = [int(c) for c in str(n)]
    product = 1
    for d in digits:
        product *= d
    return product % sum(digits) == 0


def brute(l, r):
    """Obviously correct count for a small range: test every number."""
    return sum(1 for n in range(l, r + 1) if is_beautiful(n))


class TestBeautifulNumbers(unittest.TestCase):
    def test_sample_1(self):
        # Sample 1: 10 and 20 are the beautiful numbers in [10, 20].
        run_case(self, fn="beautifulNumbers", args=[10, 20], expected=2)

    def test_sample_2(self):
        # Sample 2: 1..9 and 10 are the beautiful numbers in [1, 15].
        run_case(self, fn="beautifulNumbers", args=[1, 15], expected=10)

    def test_smallest_input(self):
        # 1: product 1, sum 1, 1 % 1 == 0.
        run_case(self, fn="beautifulNumbers", args=[1, 1], expected=1)

    def test_single_not_beautiful(self):
        # 11: product 1, sum 2, 1 % 2 != 0.
        run_case(self, fn="beautifulNumbers", args=[11, 11], expected=0)

    def test_range_with_no_beautiful(self):
        # 12..19 each have product a*b not divisible by 1+b (checked by hand; brute gives 0).
        run_case(self, fn="beautifulNumbers", args=[12, 19], expected=brute(12, 19))

    def test_largest_value(self):
        # 999999999: product 9^9 = 3^18, sum 81 = 3^4, divisible.
        run_case(self, fn="beautifulNumbers", args=[999999999, 999999999], expected=1)

    def test_zero_digit_large(self):
        # 100000000 has a zero digit, so product 0 is divisible by sum 1.
        run_case(self, fn="beautifulNumbers", args=[100000000, 100000000], expected=1)

    def test_small_range_brute(self):
        # Expected value computed by brute force over [1, 1000].
        run_case(self, fn="beautifulNumbers", args=[1, 1000], expected=brute(1, 1000))

    def test_top_range_brute(self):
        # Expected value computed by brute force over the last 1000 allowed values.
        run_case(self, fn="beautifulNumbers", args=[999999000, 999999999],
                 expected=brute(999999000, 999999999))


if __name__ == "__main__":
    unittest.main()
