import unittest

from src.solution import is_prime


class TestIsPrime(unittest.TestCase):
    # Examples from the docstring, one test each.

    def test_example_6(self):
        self.assertIs(is_prime(6), False)

    def test_example_101(self):
        self.assertIs(is_prime(101), True)

    def test_example_11(self):
        self.assertIs(is_prime(11), True)

    def test_example_13441(self):
        self.assertIs(is_prime(13441), True)

    def test_example_61(self):
        self.assertIs(is_prime(61), True)

    def test_example_4(self):
        self.assertIs(is_prime(4), False)

    def test_example_1(self):
        self.assertIs(is_prime(1), False)

    # Rule: a prime returns True.

    def test_prime_typical_97(self):
        # 97 is not divisible by 2, 3, 5 or 7, the primes up to
        # sqrt(97) ~ 9.8, so it is prime.
        self.assertIs(is_prime(97), True)

    def test_prime_boundary_2(self):
        # 2 is the smallest prime (its only divisors are 1 and 2), and the
        # only even one.
        self.assertIs(is_prime(2), True)

    # Rule: a non-prime returns False.

    def test_composite_typical_15(self):
        # 15 = 3 * 5, an odd composite.
        self.assertIs(is_prime(15), False)

    def test_composite_boundary_49(self):
        # 49 = 7 * 7: its only nontrivial divisor is exactly its square
        # root, so a divisor search must include sqrt(n) to find it.
        self.assertIs(is_prime(49), False)


if __name__ == "__main__":
    unittest.main()
