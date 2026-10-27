import unittest

from src.solution import is_prime


def brute_is_prime(n):
    # Definition of a prime: an integer greater than 1 with no divisor
    # strictly between 1 and itself. Checks every candidate, no shortcuts.
    return n > 1 and all(n % d != 0 for d in range(2, n))


class TestIsPrimePrivate(unittest.TestCase):
    # Rule: numbers below 2 are not prime.

    def test_zero_is_not_prime(self):
        # 0 is divisible by every integer, and primes are greater than 1.
        self.assertIs(is_prime(0), False)

    def test_negative_one_is_not_prime(self):
        # -1 is less than 2, so it is not a prime number.
        self.assertIs(is_prime(-1), False)

    def test_negative_composite_is_not_prime(self):
        # -4 is less than 2 (and -4 = -2 * 2), so it is not prime.
        self.assertIs(is_prime(-4), False)

    # Extends test_prime_boundary_2: the smallest odd prime.
    def test_prime_3(self):
        # 3 has no divisor between 1 and 3.
        self.assertIs(is_prime(3), True)

    # Extends test_example_4: other even composites, including powers of 2.
    def test_even_composites(self):
        # Each is 2 * k with k >= 2, so each has the divisor 2.
        for n in (8, 16, 100, 1024, 4096, 65536):
            with self.subTest(n=n):
                self.assertIs(is_prime(n), False)

    # Extends test_example_6: 6 = 2 * 3; a composite with no factor of 2 or 3.
    def test_composite_35(self):
        # 35 = 5 * 7.
        self.assertIs(is_prime(35), False)

    # Extends test_composite_boundary_49: other squares of primes, which a
    # divisor search stopping before sqrt(n) misses.
    def test_squares_of_primes(self):
        # 9 = 3*3, 25 = 5*5, 121 = 11*11, 169 = 13*13, 7921 = 89*89,
        # 10201 = 101*101, 994009 = 997*997.
        for n in (9, 25, 121, 169, 7921, 10201, 994009):
            with self.subTest(n=n):
                self.assertIs(is_prime(n), False)

    # Extends test_composite_typical_15: odd composites whose smallest
    # factor is above 7, which a check of only 2, 3, 5, 7 misses.
    def test_composites_with_factors_above_7(self):
        # 143 = 11*13, 221 = 13*17, 323 = 17*19, 13439 = 89*151,
        # 988027 = 991*997, 1000001 = 101*9901.
        for n in (143, 221, 323, 13439, 988027, 1000001):
            with self.subTest(n=n):
                self.assertIs(is_prime(n), False)

    # Extends test_composite_typical_15: Carmichael numbers, which fool a
    # Fermat primality test for every coprime base.
    def test_carmichael_numbers(self):
        # 561 = 3*11*17, 1105 = 5*13*17, 1729 = 7*13*19, 2465 = 5*17*29.
        for n in (561, 1105, 1729, 2465):
            with self.subTest(n=n):
                self.assertIs(is_prime(n), False)

    # Extends test_example_61 and test_example_11: other small primes.
    def test_small_primes(self):
        # Each is checked against brute_is_prime as well as listed by hand
        # as the primes below 30.
        for n in (5, 7, 13, 17, 19, 23, 29):
            with self.subTest(n=n):
                self.assertTrue(brute_is_prime(n))
                self.assertIs(is_prime(n), True)

    # Extends test_example_101 and test_prime_typical_97: the primes just
    # above 100.
    def test_primes_just_above_100(self):
        # 103, 107, 109, 113: none is divisible by 2, 3, 5 or 7, the primes
        # up to sqrt(113) ~ 10.6.
        for n in (103, 107, 109, 113):
            with self.subTest(n=n):
                self.assertIs(is_prime(n), True)

    # Extends test_example_101: its odd neighbours 99 and 105 are composite.
    def test_neighbours_of_101(self):
        # 99 = 9 * 11, 105 = 3 * 5 * 7.
        self.assertIs(is_prime(99), False)
        self.assertIs(is_prime(105), False)

    # Extends test_example_13441: nearby odd numbers, prime and composite.
    def test_neighbours_of_13441(self):
        # 13443 = 3 * 4481, 13447 = 7 * 17 * 113, 40323 = 3 * 13441:
        # composite. 13451: no prime up to sqrt(13451) ~ 116 divides it
        # (checked with brute_is_prime).
        self.assertIs(is_prime(13443), False)
        self.assertIs(is_prime(13447), False)
        self.assertIs(is_prime(40323), False)
        self.assertTrue(brute_is_prime(13451))
        self.assertIs(is_prime(13451), True)

    # Extends test_example_13441: larger primes.
    def test_large_primes(self):
        # 7919 is the 1000th prime, 65537 is the Fermat prime 2^16 + 1,
        # 104729 is the 10000th prime, 999983 is the largest prime below
        # 10^6, 1000003 the smallest above. Each is confirmed with
        # brute_is_prime.
        for n in (7919, 65537, 104729, 999983, 1000003):
            with self.subTest(n=n):
                self.assertTrue(brute_is_prime(n))
                self.assertIs(is_prime(n), True)

    # Extends test_example_1: the boundary between non-prime and prime.
    def test_boundary_0_1_2_3(self):
        # 0 and 1 are not prime; 2 and 3 are.
        self.assertEqual([is_prime(n) for n in (0, 1, 2, 3)],
                         [False, False, True, True])

    # Every public test: the whole range 0..1500 against the definition,
    # so no lookup table of the visible cases passes.
    def test_matches_definition_up_to_1500(self):
        # Expected values come from brute_is_prime, which tries every
        # divisor between 2 and n - 1.
        for n in range(0, 1501):
            with self.subTest(n=n):
                self.assertIs(is_prime(n), brute_is_prime(n))

    def test_prime_count_below_1000(self):
        # There are 168 primes below 1000 (a standard value), and
        # brute_is_prime agrees.
        self.assertEqual(sum(1 for n in range(1000) if brute_is_prime(n)), 168)
        self.assertEqual(sum(1 for n in range(1000) if is_prime(n)), 168)

    def test_repeated_calls_agree(self):
        # The result depends only on n, so calling twice in any order gives
        # the same answers.
        first = [is_prime(n) for n in (97, 98, 97, 49, 2)]
        second = [is_prime(n) for n in (97, 98, 97, 49, 2)]
        self.assertEqual(first, [True, False, True, False, True])
        self.assertEqual(second, first)


if __name__ == "__main__":
    unittest.main()
