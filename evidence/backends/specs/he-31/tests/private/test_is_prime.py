import unittest

from src.solution import is_prime


class TestIsPrimePrivate(unittest.TestCase):
    # Extends test_smallest_prime_2: 2 must not be the only accepted small prime.
    def test_prime_3(self):
        # 3 has only the positive divisors 1 and 3.
        self.assertEqual(is_prime(3), True)

    # Extends test_example_1: rejecting 1 must not reject other small odd numbers.
    def test_prime_5(self):
        # The only possible prime divisor up to sqrt(5) is 2; it does not divide 5.
        self.assertEqual(is_prime(5), True)

    # Extends test_prime_13: accept a prime absent from the example whitelist.
    def test_prime_7(self):
        # The only possible prime divisor up to sqrt(7) is 2.
        self.assertEqual(is_prime(7), True)

    # Extends test_example_11: another two-digit prime.
    def test_prime_17(self):
        # Neither 2 nor 3 divides 17, and sqrt(17) < 5.
        self.assertEqual(is_prime(17), True)

    # Extends test_example_101: a prime below 100 must also be recognized.
    def test_prime_97(self):
        # sqrt(97) < 10; none of 2, 3, 5, 7 divides 97.
        self.assertEqual(is_prime(97), True)

    # Extends test_example_101: a neighboring odd number is also prime.
    def test_prime_103(self):
        # sqrt(103) < 11; none of 2, 3, 5, 7 divides 103.
        self.assertEqual(is_prime(103), True)

    # Extends test_example_61: primes need not end in 1.
    def test_prime_127(self):
        # sqrt(127) < 12; none of 2, 3, 5, 7, 11 divides 127.
        self.assertEqual(is_prime(127), True)

    # Extends test_example_61: recognize a larger prime absent from the examples.
    def test_prime_257(self):
        # sqrt(257) < 17; none of 2, 3, 5, 7, 11, 13 divides 257.
        self.assertEqual(is_prime(257), True)

    # Extends test_example_13441: a different large prime defeats a whitelist.
    def test_prime_7919(self):
        # Brute force every possible proper divisor to derive the expected result.
        n = 7919
        expected = all(n % divisor != 0 for divisor in range(2, n))
        self.assertEqual(is_prime(n), expected)

    # Extends test_example_13441: primality is not limited to five-digit inputs.
    def test_prime_104729(self):
        # Brute force every possible proper divisor; fewer than 105,000 checks.
        n = 104729
        expected = all(n % divisor != 0 for divisor in range(2, n))
        self.assertEqual(is_prime(n), expected)

    # Extends test_example_4: even composites are not limited to 4 and 6.
    def test_composite_8(self):
        # 8 = 2 * 4.
        self.assertEqual(is_prime(8), False)

    # Extends test_example_6: a composite without a factor of 3.
    def test_composite_10(self):
        # 10 = 2 * 5.
        self.assertEqual(is_prime(10), False)

    # Extends test_example_6: another even composite outside the examples.
    def test_composite_14(self):
        # 14 = 2 * 7.
        self.assertEqual(is_prime(14), False)

    # Extends test_odd_composite_9: an odd composite need not be a square.
    def test_composite_27(self):
        # 27 = 3 * 9.
        self.assertEqual(is_prime(27), False)

    # Extends test_example_4: square roots must be included in divisor checks.
    def test_composite_25(self):
        # 25 = 5 * 5; it has no divisor among 2 and 3.
        self.assertEqual(is_prime(25), False)

    # Extends test_odd_composite_9: testing only divisibility by 2, 3, 5 fails.
    def test_composite_49(self):
        # 49 = 7 * 7.
        self.assertEqual(is_prime(49), False)

    # Extends test_example_11: the square of a prime is composite.
    def test_composite_121(self):
        # 121 = 11 * 11.
        self.assertEqual(is_prime(121), False)

    # Extends test_example_61: divisor checks must reach beyond small primes.
    def test_composite_1369(self):
        # 1369 = 37 * 37; including the square-root endpoint is necessary.
        self.assertEqual(is_prime(1369), False)

    # Extends test_example_101: accepting a prime must not accept its square.
    def test_composite_10201(self):
        # 10201 = 101 * 101; no smaller prime divides it.
        self.assertEqual(is_prime(10201), False)

    # Extends test_example_13441: a large odd number can have large factors.
    def test_composite_9797(self):
        # 9797 = 97 * 101; it is not a perfect square.
        self.assertEqual(is_prime(9797), False)

    # Extends test_prime_13: an odd nonsquare can be a product of two primes.
    def test_composite_143(self):
        # 143 = 11 * 13.
        self.assertEqual(is_prime(143), False)

    # Extends test_prime_13: a base-2 Fermat check alone can accept composites.
    def test_composite_341(self):
        # 341 = 11 * 31.
        self.assertEqual(is_prime(341), False)

    # Extends test_example_6: odd composites can have several distinct factors.
    def test_composite_561(self):
        # 561 = 3 * 11 * 17, a Carmichael number.
        self.assertEqual(is_prime(561), False)

    # Extends test_example_13441: larger size alone does not imply primality.
    def test_composite_105481(self):
        # 105481 = 313 * 337; neither factor is a small prime.
        self.assertEqual(is_prime(105481), False)

    # Extends test_example_1: cover the boundary between positive and nonpositive.
    def test_zero(self):
        # A prime is a positive integer greater than 1.
        self.assertEqual(is_prime(0), False)

    # Extends test_zero: negative integers are also below the prime domain.
    def test_negative_one(self):
        # -1 is not greater than 1.
        self.assertEqual(is_prime(-1), False)

    # Extends test_smallest_prime_2: taking abs(n) would incorrectly accept -2.
    def test_negative_two(self):
        # Negative integers are not prime even when their magnitudes are prime.
        self.assertEqual(is_prime(-2), False)

    # Extends test_zero: a larger negative prime magnitude is still not prime.
    def test_negative_97(self):
        # -97 is not a positive integer greater than 1.
        self.assertEqual(is_prime(-97), False)

    # Extends test_example_1: ensure the unique positive nonprime unit is rejected.
    def test_one(self):
        # 1 has only one positive divisor, rather than exactly two.
        self.assertEqual(is_prime(1), False)
