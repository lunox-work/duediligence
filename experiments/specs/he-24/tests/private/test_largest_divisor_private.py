# Private tests for largest_divisor.
#
# Inputs are integers n >= 2, the range where "the largest number that
# divides n evenly, smaller than n" always exists (1 divides n and 1 < n).
# Inputs stay at or below 10**6 so that even a plain O(n) loop finishes
# well within a second; the docstring asks for nothing about speed.
import unittest

from src.solution import largest_divisor


def brute_largest_divisor(n):
    # Obviously correct: scan every candidate below n, keep the largest
    # one that leaves no remainder.
    best = None
    for d in range(1, n):
        if n % d == 0:
            best = d
    return best


class TestLargestDivisorPrivate(unittest.TestCase):
    # Extends test_docstring_example_15: another product of two distinct
    # odd primes, where the larger prime is not the answer's only source.
    # 35 = 5 * 7; divisors 1, 5, 7, 35 -> 7.
    def test_product_5_7_is_7(self):
        self.assertEqual(largest_divisor(35), 7)

    # Extends test_docstring_example_15: two primes both above 7, so a
    # shortcut that only tries the factors 2, 3, 5, 7 fails.
    # 143 = 11 * 13; divisors 1, 11, 13, 143 -> 13.
    def test_product_11_13_is_13(self):
        self.assertEqual(largest_divisor(143), 13)

    # Extends test_docstring_example_15: the answer is not the largest
    # prime factor. 45 = 3 * 15; smallest factor above 1 is 3 -> 15
    # (largest prime factor would be 5).
    def test_45_is_15_not_largest_prime_factor(self):
        self.assertEqual(largest_divisor(45), 15)

    # Extends test_odd_composite_21: odd composite with a repeated factor.
    # 63 = 3 * 21; smallest factor above 1 is 3 -> 21.
    def test_odd_composite_63(self):
        self.assertEqual(largest_divisor(63), 21)

    # Extends test_odd_composite_21: three distinct odd primes.
    # 1001 = 7 * 11 * 13; smallest factor above 1 is 7 -> 1001 / 7 = 143.
    def test_three_primes_1001(self):
        self.assertEqual(largest_divisor(1001), 143)

    # Extends test_odd_composite_21: smallest factor is 5, not 2 or 3.
    # 175 = 5 * 35 (175 is odd and 1+7+5=13 is not a multiple of 3) -> 35.
    def test_smallest_factor_5_gives_35(self):
        self.assertEqual(largest_divisor(175), 35)

    # Extends test_composite_100: other even numbers; the answer is n / 2.
    # 6 -> 3, 30 -> 15, 1000000 -> 500000.
    def test_even_6(self):
        self.assertEqual(largest_divisor(6), 3)

    def test_even_30(self):
        self.assertEqual(largest_divisor(30), 15)

    def test_even_million(self):
        self.assertEqual(largest_divisor(1000000), 500000)

    # Extends test_composite_100: a large even number; 2 is its smallest
    # factor above 1, so the answer is 999966 / 2 = 499983.
    def test_large_even_999966(self):
        self.assertEqual(largest_divisor(999966), 499983)

    # Extends test_composite_100 and test_excludes_n_itself_4: powers of two.
    # 8 -> 4, 1024 -> 512.
    def test_power_of_two_8(self):
        self.assertEqual(largest_divisor(8), 4)

    def test_power_of_two_1024(self):
        self.assertEqual(largest_divisor(1024), 512)

    # Extends test_prime_square_49: smaller prime squares, where an
    # off-by-one in a square-root bound matters most. 9 = 3*3 -> 3,
    # 25 = 5*5 -> 5.
    def test_prime_square_9(self):
        self.assertEqual(largest_divisor(9), 3)

    def test_prime_square_25(self):
        self.assertEqual(largest_divisor(25), 5)

    # Extends test_prime_square_49: prime squares above 7*7, so a lookup of
    # small primes does not suffice. 121 -> 11, 961 = 31*31 -> 31,
    # 994009 = 997*997 -> 997.
    def test_prime_square_121(self):
        self.assertEqual(largest_divisor(121), 11)

    def test_prime_square_961(self):
        self.assertEqual(largest_divisor(961), 31)

    def test_prime_square_994009(self):
        self.assertEqual(largest_divisor(994009), 997)

    # Extends test_prime_square_49: prime cube. 27 = 3 * 9 -> 9.
    def test_prime_cube_27(self):
        self.assertEqual(largest_divisor(27), 9)

    # Extends test_prime_13: the smallest odd prime. Divisors of 3: 1, 3 -> 1.
    def test_prime_3(self):
        self.assertEqual(largest_divisor(3), 1)

    # Extends test_prime_13: larger primes. 997, 7919 and 999983 are prime
    # (999983 is the largest prime below 10**6) -> 1.
    def test_prime_997(self):
        self.assertEqual(largest_divisor(997), 1)

    def test_prime_7919(self):
        self.assertEqual(largest_divisor(7919), 1)

    def test_prime_999983(self):
        self.assertEqual(largest_divisor(999983), 1)

    # Extends test_smallest_input_2 and test_excludes_n_itself_4: the
    # result is strictly below n and divides n, for each n in 2..60,
    # and it equals the brute-force maximum.
    def test_small_range_matches_brute_force(self):
        for n in range(2, 61):
            with self.subTest(n=n):
                result = largest_divisor(n)
                self.assertLess(result, n)
                self.assertEqual(n % result, 0)
                self.assertEqual(result, brute_largest_divisor(n))

    # Rule over many inputs: every n in 2..1500 against the brute force.
    def test_sweep_matches_brute_force(self):
        for n in range(2, 1501):
            with self.subTest(n=n):
                self.assertEqual(largest_divisor(n), brute_largest_divisor(n))

    # The signature declares an int result.
    def test_returns_int(self):
        for n in (2, 15, 100, 999983):
            with self.subTest(n=n):
                self.assertIs(type(largest_divisor(n)), int)


if __name__ == "__main__":
    unittest.main()
