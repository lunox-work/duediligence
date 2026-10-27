import unittest

from src.solution import is_prime


class TestIsPrime(unittest.TestCase):
    def test_example_6(self):
        self.assertEqual(is_prime(6), False)

    def test_example_101(self):
        self.assertEqual(is_prime(101), True)

    def test_example_11(self):
        self.assertEqual(is_prime(11), True)

    def test_example_13441(self):
        self.assertEqual(is_prime(13441), True)

    def test_example_61(self):
        self.assertEqual(is_prime(61), True)

    def test_example_4(self):
        self.assertEqual(is_prime(4), False)

    def test_example_1(self):
        self.assertEqual(is_prime(1), False)

    def test_prime_13(self):
        # sqrt(13) < 4; neither 2 nor 3 divides 13, so 13 is prime.
        self.assertEqual(is_prime(13), True)

    def test_smallest_prime_2(self):
        # 2 has exactly two positive divisors, 1 and 2; it is the first prime.
        self.assertEqual(is_prime(2), True)

    def test_odd_composite_9(self):
        # 9 = 3 * 3, so it has a positive divisor besides 1 and itself.
        self.assertEqual(is_prime(9), False)

    def test_zero(self):
        # A prime must be greater than 1; 0 does not meet that condition.
        self.assertEqual(is_prime(0), False)
