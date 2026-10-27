import unittest

from src.solution import factorize


class TestFactorize(unittest.TestCase):
    def test_docstring_eight(self):
        self.assertEqual(factorize(8), [2, 2, 2])

    def test_docstring_twenty_five(self):
        self.assertEqual(factorize(25), [5, 5])

    def test_docstring_seventy(self):
        self.assertEqual(factorize(70), [2, 5, 7])

    def test_composite_factors_are_prime(self):
        # 12 = 2 * 2 * 3; both 2 and 3 are prime.
        self.assertEqual(factorize(12), [2, 2, 3])

    def test_smallest_prime(self):
        # 2 is the smallest prime, so its only prime factor is itself.
        self.assertEqual(factorize(2), [2])

    def test_distinct_factors_in_ascending_order(self):
        # 1001 = 7 * 143 = 7 * 11 * 13, all prime and ascending.
        self.assertEqual(factorize(1001), [7, 11, 13])

    def test_single_prime_factor(self):
        # 13 is prime, so [13] is the complete, already sorted factor list.
        self.assertEqual(factorize(13), [13])

    def test_mixed_factor_multiplicities(self):
        # 360 = 8 * 9 * 5 = 2**3 * 3**2 * 5; the listed product is 360.
        self.assertEqual(factorize(360), [2, 2, 2, 3, 3, 5])

    def test_smallest_repeated_prime_factor(self):
        # 4 = 2 * 2 is the smallest integer with a repeated prime factor.
        self.assertEqual(factorize(4), [2, 2])

    def test_one_has_no_prime_factors(self):
        # No prime divides 1, and the product of the empty list is 1.
        self.assertEqual(factorize(1), [])
