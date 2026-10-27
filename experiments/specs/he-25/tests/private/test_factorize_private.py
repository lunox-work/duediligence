import unittest
from math import prod

from src.solution import factorize


def is_prime(k):
    # Plain trial division: k is prime iff k >= 2 and no d in [2, sqrt(k)]
    # divides it.
    if k < 2:
        return False
    d = 2
    while d * d <= k:
        if k % d == 0:
            return False
        d += 1
    return True


class TestFactorizePrivate(unittest.TestCase):
    def assertIsFactorization(self, n, result):
        # By the uniqueness of prime factorization, a list is the answer iff
        # it is a list, every entry is prime, it is nondecreasing, and its
        # product is n.
        self.assertIsInstance(result, list)
        for p in result:
            self.assertTrue(is_prime(p), f"{p} in factorize({n}) is not prime")
        self.assertEqual(result, sorted(result))
        self.assertEqual(prod(result), n)

    # --- n = 1: the only list of primes whose product is 1 is the empty one.

    def test_one_has_no_prime_factors(self):
        self.assertEqual(factorize(1), [])

    # --- Extends test_docstring_example_8: higher powers of 2.

    def test_power_of_two_1024(self):
        # 1024 = 2^10.
        self.assertEqual(factorize(1024), [2] * 10)

    def test_power_of_two_2_pow_60(self):
        # A divisor-listing shortcut that appends 2, 4, 8, ... fails here,
        # and so does one that stops after a fixed number of divisions.
        self.assertEqual(factorize(2 ** 60), [2] * 60)

    def test_eight_is_not_divisor_list(self):
        # 16 = 2^4; the divisors 4, 8, 16 must not appear.
        self.assertEqual(factorize(16), [2, 2, 2, 2])

    # --- Extends test_docstring_example_25: squares/powers of odd primes.

    def test_square_of_seven(self):
        # 49 = 7 * 7.
        self.assertEqual(factorize(49), [7, 7])

    def test_power_of_three(self):
        # 243 = 3^5.
        self.assertEqual(factorize(243), [3, 3, 3, 3, 3])

    def test_cube_of_seven(self):
        # 343 = 7^3.
        self.assertEqual(factorize(343), [7, 7, 7])

    def test_square_of_large_prime(self):
        # 9973 is prime (public suite); 9973^2 = 99460729.
        self.assertEqual(factorize(9973 * 9973), [9973, 9973])

    # --- Extends test_docstring_example_70: distinct primes, last one past sqrt.

    def test_two_times_large_prime(self):
        # 2 * 9973 = 19946; 9973 > sqrt(19946) ~ 141, so a trial division
        # that stops at sqrt(n) without keeping the remainder loses it.
        self.assertEqual(factorize(19946), [2, 9973])

    def test_small_primes_times_prime_above_sqrt(self):
        # 2 * 3 * 101 = 606; 101 > sqrt(606) ~ 24.6.
        self.assertEqual(factorize(606), [2, 3, 101])

    def test_power_of_two_times_large_prime(self):
        # 2^3 * 97 = 776; remainder 97 is prime and must be kept once.
        self.assertEqual(factorize(776), [2, 2, 2, 97])

    # --- Extends test_order_typical_distinct_primes: more distinct primes.

    def test_primorial_up_to_23(self):
        # 2*3*5*7*11*13*17*19*23 = 223092870.
        self.assertEqual(
            factorize(223092870), [2, 3, 5, 7, 11, 13, 17, 19, 23]
        )

    def test_carmichael_561(self):
        # 561 = 3 * 11 * 17 (a Carmichael number; fools Fermat tests).
        self.assertEqual(factorize(561), [3, 11, 17])

    # --- Extends test_order_boundary_smallest_prime: other small primes.

    def test_three(self):
        self.assertEqual(factorize(3), [3])

    def test_five(self):
        self.assertEqual(factorize(5), [5])

    def test_six(self):
        # 6 = 2 * 3, the smallest product of two distinct primes.
        self.assertEqual(factorize(6), [2, 3])

    # --- Extends test_multiplicity_typical_mixed_powers.

    def test_mixed_powers_odd_primes(self):
        # 11^2 * 13 = 121 * 13 = 1573.
        self.assertEqual(factorize(1573), [11, 11, 13])

    def test_mixed_powers_many(self):
        # 2^2 * 3^3 * 5^2 * 7 = 4 * 27 * 25 * 7 = 18900.
        self.assertEqual(
            factorize(18900), [2, 2, 3, 3, 3, 5, 5, 7]
        )

    def test_mixed_powers_large_multiplicity(self):
        # 2^20 * 3^12; built in the test, expected list built from it.
        n = 2 ** 20 * 3 ** 12
        self.assertEqual(factorize(n), [2] * 20 + [3] * 12)

    # --- Extends test_multiplicity_boundary_smallest_repeated.

    def test_nine(self):
        # 9 = 3 * 3, smallest odd number with a repeated prime factor.
        self.assertEqual(factorize(9), [3, 3])

    def test_twelve(self):
        # 12 = 2 * 2 * 3; not [2, 3] (multiplicity) nor [2, 2, 3] reordered.
        self.assertEqual(factorize(12), [2, 2, 3])

    # --- Extends test_product_typical_odd_composite.

    def test_odd_composite_with_repeats(self):
        # 3^2 * 5 * 7^2 = 9 * 5 * 49 = 2205.
        self.assertEqual(factorize(2205), [3, 3, 5, 7, 7])

    def test_product_rule_all_up_to_3000(self):
        # Every n in [2, 3000] checked against the defining properties.
        for n in range(2, 3001):
            self.assertIsFactorization(n, factorize(n))

    # --- Extends test_product_boundary_large_prime.

    def test_mersenne_prime_2_pow_31_minus_1(self):
        # 2^31 - 1 = 2147483647 is prime; is_prime confirms it by trial
        # division up to 46341.
        n = 2 ** 31 - 1
        self.assertTrue(is_prime(n))
        self.assertEqual(factorize(n), [n])

    def test_semiprime_of_two_large_primes(self):
        # 104723 and 104729 are both prime (checked by is_prime).
        p, q = 104723, 104729
        self.assertTrue(is_prime(p) and is_prime(q))
        self.assertEqual(factorize(p * q), [p, q])

    def test_large_composite_with_large_prime_tail(self):
        # 2^5 * 3 * 1000003, with 1000003 prime (checked by is_prime).
        p = 1000003
        self.assertTrue(is_prime(p))
        self.assertEqual(factorize(32 * 3 * p), [2, 2, 2, 2, 2, 3, p])

    def test_product_rule_large_range(self):
        # A block of larger inputs checked against the defining properties.
        for n in range(1_000_000, 1_000_200):
            self.assertIsFactorization(n, factorize(n))


if __name__ == "__main__":
    unittest.main()
