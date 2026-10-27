# Public tests for largest_divisor.
#
# Inputs are limited to integers n >= 2. The docstring asks for the largest
# number smaller than n that divides n evenly; for n >= 2 that number always
# exists (1 divides every n and 1 < n). It does not say what happens for
# n <= 1, so those inputs are not tested.
import unittest

from src.solution import largest_divisor


class TestLargestDivisor(unittest.TestCase):
    # Docstring example.
    def test_docstring_example_15(self):
        self.assertEqual(largest_divisor(15), 5)

    # Rule: largest proper divisor, typical composite case.
    # 100 = 2 * 50; the smallest factor above 1 is 2, so the largest divisor
    # below 100 is 100 / 2 = 50 (nothing in 51..99 divides 100).
    def test_composite_100(self):
        self.assertEqual(largest_divisor(100), 50)

    # Rule, typical: odd composite whose smallest prime factor is not 2.
    # 21 = 3 * 7; divisors of 21 are 1, 3, 7, 21, so the largest below 21 is 7.
    def test_odd_composite_21(self):
        self.assertEqual(largest_divisor(21), 7)

    # Rule, typical: square of a prime.
    # Divisors of 49 are 1, 7, 49, so the largest below 49 is 7.
    def test_prime_square_49(self):
        self.assertEqual(largest_divisor(49), 7)

    # Rule, boundary: a prime has no divisor between 1 and itself.
    # Divisors of 13 are 1 and 13, so the largest below 13 is 1.
    def test_prime_13(self):
        self.assertEqual(largest_divisor(13), 1)

    # Rule, boundary: smallest input that has a divisor smaller than n.
    # Divisors of 2 are 1 and 2, so the largest below 2 is 1.
    def test_smallest_input_2(self):
        self.assertEqual(largest_divisor(2), 1)

    # Rule, boundary: the divisor must be strictly smaller than n, so n itself
    # is excluded. Divisors of 4 are 1, 2, 4; the largest below 4 is 2.
    def test_excludes_n_itself_4(self):
        self.assertEqual(largest_divisor(4), 2)


if __name__ == "__main__":
    unittest.main()
