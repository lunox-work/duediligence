import unittest

from src.solution import factorize


class TestFactorizeHidden(unittest.TestCase):
    # Extends test_docstring_eight: multiplicity must not stop at three.
    def test_long_power_of_two(self):
        # By construction, 2**20 has exactly twenty factors of 2.
        self.assertEqual(factorize(2**20), [2] * 20)

    # Extends test_smallest_repeated_prime_factor: another even exponent.
    def test_five_factors_of_two(self):
        # 32 = 2 * 2 * 2 * 2 * 2.
        self.assertEqual(factorize(32), [2, 2, 2, 2, 2])

    # Extends test_docstring_twenty_five: odd multiplicity above two.
    def test_cube_of_seven(self):
        # 343 = 7**3, and 7 is prime.
        self.assertEqual(factorize(343), [7, 7, 7])

    # Extends test_docstring_eight: repeated division is also needed for odd primes.
    def test_long_power_of_three(self):
        # 3**9 contains exactly nine copies of the prime 3.
        self.assertEqual(factorize(3**9), [3] * 9)

    # Extends test_docstring_twenty_five: a square beyond the visible divisors.
    def test_square_of_larger_prime(self):
        # 127 is prime; its square has exactly these two prime factors.
        self.assertEqual(factorize(127**2), [127, 127])

    # Extends test_docstring_seventy: four distinct factors and no factor 2.
    def test_four_distinct_odd_factors(self):
        # The input is explicitly the product of these four distinct primes.
        self.assertEqual(factorize(3 * 5 * 7 * 11), [3, 5, 7, 11])

    # Extends test_distinct_factors_in_ascending_order: all factors exceed 13.
    def test_three_factors_beyond_public_primes(self):
        # 17, 19 and 23 are prime, listed in increasing order.
        self.assertEqual(factorize(17 * 19 * 23), [17, 19, 23])

    # Extends test_smallest_prime: the first odd prime is also its own factor.
    def test_smallest_odd_prime(self):
        # 3 is prime.
        self.assertEqual(factorize(3), [3])

    # Extends test_single_prime_factor: a prime outside the visible examples.
    def test_two_digit_prime(self):
        # 97 has no divisor among 2, 3, 5, 7, the primes below its square root.
        self.assertEqual(factorize(97), [97])

    # Extends test_single_prime_factor: a much larger prime must remain intact.
    def test_larger_prime(self):
        # A prime's sole factor is itself. Trial division independently checks
        # this chosen input, using all potential divisors up to its square root.
        n = 65537
        self.assertTrue(all(n % d for d in range(2, 257)))
        self.assertEqual(factorize(n), [n])

    # Extends test_mixed_factor_multiplicities: four different multiplicities.
    def test_four_mixed_multiplicities(self):
        # Construct the input from the exact prime powers in the expected list.
        n = 2**5 * 3**4 * 5**2 * 7**3
        self.assertEqual(factorize(n), [2] * 5 + [3] * 4 + [5] * 2 + [7] * 3)

    # Extends test_mixed_factor_multiplicities: repeated factors without 2 or 5.
    def test_all_odd_mixed_multiplicities(self):
        # Each exponent directly gives the number of occurrences of that prime.
        n = 3**2 * 7**3 * 11**2
        self.assertEqual(factorize(n), [3, 3, 7, 7, 7, 11, 11])

    # Extends test_mixed_factor_multiplicities: the largest factor repeats most.
    def test_largest_factor_has_highest_multiplicity(self):
        # 2 * 3 * 17**4 has one 2, one 3, and four 17s.
        self.assertEqual(factorize(2 * 3 * 17**4), [2, 3, 17, 17, 17, 17])

    # Extends test_composite_factors_are_prime: neither factor is a small prime.
    def test_close_larger_prime_factors(self):
        # 101 and 103 are prime, so their product has exactly these factors.
        self.assertEqual(factorize(101 * 103), [101, 103])

    # Extends test_docstring_seventy: a large prime remainder must be included.
    def test_widely_separated_prime_factors(self):
        # 1009 has no prime divisor <= sqrt(1009): 2,3,5,7,11,13,17,19,23,29,31.
        self.assertEqual(factorize(3 * 1009), [3, 1009])

    # Extends test_composite_factors_are_prime: the remaining square must split.
    def test_large_square_after_small_factor(self):
        # 97 is prime, so 2 * 97**2 needs two occurrences of 97.
        self.assertEqual(factorize(2 * 97**2), [2, 97, 97])

    # Extends test_distinct_factors_in_ascending_order: more than three factors.
    def test_eight_distinct_prime_factors(self):
        # The eight listed primes multiply to the constructed input.
        n = 2 * 3 * 5 * 7 * 11 * 13 * 17 * 19
        self.assertEqual(factorize(n), [2, 3, 5, 7, 11, 13, 17, 19])

    # Extends test_distinct_factors_in_ascending_order: sort repeated odd factors.
    def test_ascending_order_with_repeated_odd_factors(self):
        # Multiplication order does not change the ascending prime factorization.
        n = 19**2 * 13 * 7**3 * 3
        self.assertEqual(factorize(n), [3, 7, 7, 7, 13, 19, 19])

    # Extends test_composite_factors_are_prime: a square root can be composite.
    def test_square_of_composite_with_four_prime_factors(self):
        # Squaring 2 * 3 * 5 * 7 doubles every prime's exponent.
        self.assertEqual(factorize((2 * 3 * 5 * 7)**2), [2, 2, 3, 3, 5, 5, 7, 7])

    # Extends test_one_has_no_prime_factors: repeated 1 after a nonempty result.
    def test_one_after_composite_and_repeated(self):
        # 49 = 7**2; the only prime list with product 1 is the empty list.
        self.assertEqual(factorize(49), [7, 7])
        self.assertEqual(factorize(1), [])
        self.assertEqual(factorize(1), [])

    # Extends test_one_has_no_prime_factors: 1 between two prime inputs.
    def test_one_between_prime_calls(self):
        # Both neighboring inputs are prime; 1 contributes no prime factors.
        self.assertEqual(factorize(11), [11])
        self.assertEqual(factorize(1), [])
        self.assertEqual(factorize(17), [17])

    # Extends test_smallest_repeated_prime_factor: the smallest odd prime square.
    def test_smallest_odd_prime_square(self):
        # 9 = 3 * 3, with both copies required for the product to equal 9.
        self.assertEqual(factorize(9), [3, 3])
