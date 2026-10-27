import unittest

from src.solution import largest_divisor


class TestLargestDivisor(unittest.TestCase):
    def test_docstring_example(self):
        self.assertEqual(largest_divisor(15), 5)

    def test_even_composite(self):
        # The proper positive divisors of 12 are 1, 2, 3, 4, and 6.
        self.assertEqual(largest_divisor(12), 6)

    def test_odd_composite_with_multiple_proper_divisors(self):
        # The proper positive divisors of 45 are 1, 3, 5, 9, and 15.
        self.assertEqual(largest_divisor(45), 15)

    def test_square_of_a_prime(self):
        # 49 = 7 * 7, so its proper positive divisors are 1 and 7.
        self.assertEqual(largest_divisor(49), 7)

    def test_prime_excludes_the_number_itself(self):
        # 13 is prime: its positive divisors are 1 and 13; exclude 13.
        self.assertEqual(largest_divisor(13), 1)

    def test_smallest_positive_number_with_a_proper_divisor(self):
        # The positive divisors of 2 are 1 and 2; only 1 is smaller than 2.
        self.assertEqual(largest_divisor(2), 1)
