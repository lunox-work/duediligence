import unittest

from src.solution import greatest_common_divisor


def brute_gcd(a, b):
    # Largest positive d dividing both a and b, found by trying every
    # candidate up to max(|a|, |b|). Only used when a and b are not both 0.
    return max(d for d in range(1, max(abs(a), abs(b)) + 1)
               if a % d == 0 and b % d == 0)


class TestGreatestCommonDivisorPrivate(unittest.TestCase):
    # The docstring says "a" greatest common divisor, so wherever an
    # argument is zero or negative only the magnitude is asserted. For
    # positive arguments the docstring examples return the positive value.

    # Extends test_example_coprime_3_5: coprime pairs where neither is prime,
    # so a "return 1 when a or b is prime" shortcut does not help.

    def test_coprime_composites_8_15(self):
        # 8 = 2^3, 15 = 3*5: no shared prime factor.
        self.assertEqual(greatest_common_divisor(8, 15), 1)

    def test_coprime_composites_35_64(self):
        # 35 = 5*7, 64 = 2^6: no shared prime factor.
        self.assertEqual(greatest_common_divisor(35, 64), 1)

    def test_coprime_consecutive_integers(self):
        # Any common divisor of n and n+1 divides their difference 1.
        self.assertEqual(greatest_common_divisor(1000000, 999999), 1)

    def test_coprime_prime_powers(self):
        # 2^19 = 524288 and 3^12 = 531441 share no prime factor.
        self.assertEqual(greatest_common_divisor(524288, 531441), 1)

    def test_coprime_consecutive_fibonacci(self):
        # Consecutive Fibonacci numbers F(30) = 832040, F(31) = 1346269 are
        # coprime (gcd(F(n+1), F(n)) = gcd(F(n), F(n-1)) = ... = 1).
        self.assertEqual(greatest_common_divisor(1346269, 832040), 1)

    # Extends test_example_25_15: other pairs with a common factor greater
    # than 1 where neither divides the other.

    def test_shared_factor_35_21(self):
        # 35 = 5*7, 21 = 3*7; shared factor 7.
        self.assertEqual(greatest_common_divisor(35, 21), 7)

    def test_shared_factor_100_75(self):
        # 100 = 2^2*5^2, 75 = 3*5^2; shared factor 5^2 = 25.
        self.assertEqual(greatest_common_divisor(100, 75), 25)

    def test_shared_factor_36_48(self):
        # 36 = 2^2*3^2, 48 = 2^4*3; shared 2^2*3 = 12. Neither divides the
        # other, so a "return min if it divides max else 1" shortcut gives 1.
        self.assertEqual(greatest_common_divisor(36, 48), 12)

    # Extends test_typical_12_18: every pair of positive integers up to 40,
    # checked against brute_gcd (exhaustive divisor search).

    def test_grid_positive_pairs_up_to_40(self):
        for a in range(1, 41):
            for b in range(1, 41):
                with self.subTest(a=a, b=b):
                    self.assertEqual(greatest_common_divisor(a, b),
                                     brute_gcd(a, b))

    # Extends test_typical_larger_values: larger inputs with known
    # factorizations.

    def test_larger_values_swapped(self):
        # 1071 = 3^2*7*17, 462 = 2*3*7*11; shared 3*7 = 21.
        self.assertEqual(greatest_common_divisor(1071, 462), 21)

    def test_larger_fibonacci_pair(self):
        # gcd(F(m), F(n)) = F(gcd(m, n)): F(30) = 832040, F(20) = 6765,
        # gcd(30, 20) = 10, F(10) = 55.
        self.assertEqual(greatest_common_divisor(832040, 6765), 55)

    def test_larger_prime_power_products(self):
        # 2^10*3^5 = 248832, 2^7*3^8*5 = 4199040; min exponents give
        # 2^7*3^5 = 128*243 = 31104.
        self.assertEqual(greatest_common_divisor(248832, 4199040), 31104)

    def test_larger_squarefree_products(self):
        # 15015 = 3*5*7*11*13, 22610 = 2*5*7*17*19; shared 5*7 = 35.
        self.assertEqual(greatest_common_divisor(15015, 22610), 35)

    # Extends test_argument_order_does_not_matter: swapping arguments leaves
    # the set of common divisors unchanged, for many pairs.

    def test_order_symmetric_grid(self):
        for a in range(1, 31):
            for b in range(1, 31):
                with self.subTest(a=a, b=b):
                    self.assertEqual(greatest_common_divisor(a, b),
                                     greatest_common_divisor(b, a))

    def test_order_larger_first_and_second(self):
        # 48 = 2^4*3, 180 = 2^2*3^2*5; shared 2^2*3 = 12, in both orders.
        self.assertEqual(greatest_common_divisor(48, 180), 12)
        self.assertEqual(greatest_common_divisor(180, 48), 12)

    # Extends test_boundary_one_divides_the_other: the multiple first, and
    # larger multiples.

    def test_divides_multiple_first(self):
        # 7 divides 21; 7 is the largest divisor of 7.
        self.assertEqual(greatest_common_divisor(21, 7), 7)

    def test_divides_large_multiple(self):
        # 13 divides 1261 = 13*97.
        self.assertEqual(greatest_common_divisor(13, 1261), 13)
        self.assertEqual(greatest_common_divisor(1261, 13), 13)

    def test_divides_composite_divisor(self):
        # 6 divides 48 = 6*8.
        self.assertEqual(greatest_common_divisor(6, 48), 6)

    # Extends test_boundary_equal_arguments: other equal values.

    def test_equal_ones(self):
        self.assertEqual(greatest_common_divisor(1, 1), 1)

    def test_equal_prime(self):
        self.assertEqual(greatest_common_divisor(97, 97), 97)

    def test_equal_large(self):
        self.assertEqual(greatest_common_divisor(1000000, 1000000), 1000000)

    def test_equal_negative(self):
        # Common divisors of -10 and -10 are the divisors of 10 up to sign.
        self.assertEqual(abs(greatest_common_divisor(-10, -10)), 10)

    # Extends test_boundary_one: 1 in the second position, and with a large
    # or a negative partner.

    def test_one_second(self):
        self.assertEqual(greatest_common_divisor(9, 1), 1)

    def test_one_with_large_value(self):
        self.assertEqual(greatest_common_divisor(1, 1000003), 1)

    def test_minus_one(self):
        # -1's divisors are +-1.
        self.assertEqual(abs(greatest_common_divisor(-1, 9)), 1)

    # Extends test_boundary_zero_argument: zero second, and zero with other
    # values. Every integer divides 0, so the common divisors of 0 and n are
    # the divisors of n.

    def test_zero_second(self):
        # Catches an "if a == 0: return b" special case that ignores b == 0.
        self.assertEqual(abs(greatest_common_divisor(5, 0)), 5)

    def test_zero_with_composite(self):
        self.assertEqual(abs(greatest_common_divisor(0, 12)), 12)
        self.assertEqual(abs(greatest_common_divisor(12, 0)), 12)

    def test_zero_with_one(self):
        self.assertEqual(abs(greatest_common_divisor(0, 1)), 1)
        self.assertEqual(abs(greatest_common_divisor(1, 0)), 1)

    def test_zero_with_negative(self):
        self.assertEqual(abs(greatest_common_divisor(0, -7)), 7)
        self.assertEqual(abs(greatest_common_divisor(-7, 0)), 7)

    # Extends test_boundary_negative_argument: negative second, both
    # negative, and larger magnitudes. Divisors of -n are those of n up to
    # sign, so the magnitude equals brute_gcd(|a|, |b|).

    def test_negative_second(self):
        self.assertEqual(abs(greatest_common_divisor(4, -6)), 2)

    def test_both_negative(self):
        self.assertEqual(abs(greatest_common_divisor(-6, -4)), 2)

    def test_negative_larger_magnitude(self):
        # 12 and 18 share 6. A divisor search over range(1, min(a, b) + 1)
        # finds nothing when the minimum is negative.
        self.assertEqual(abs(greatest_common_divisor(-12, 18)), 6)

    def test_negative_coprime(self):
        self.assertEqual(abs(greatest_common_divisor(-3, 5)), 1)

    def test_negative_example_values(self):
        # 25 and 15 share 5.
        self.assertEqual(abs(greatest_common_divisor(-25, -15)), 5)

    def test_negative_divides_other(self):
        # 7 divides 21.
        self.assertEqual(abs(greatest_common_divisor(-7, 21)), 7)
        self.assertEqual(abs(greatest_common_divisor(21, -7)), 7)

    def test_grid_signed_pairs(self):
        for a in range(-20, 21):
            for b in range(-20, 21):
                if a == 0 and b == 0:
                    continue
                with self.subTest(a=a, b=b):
                    self.assertEqual(abs(greatest_common_divisor(a, b)),
                                     brute_gcd(a, b))

    def test_signed_result_divides_both(self):
        # Whatever sign is returned, the result is a common divisor.
        for a, b in [(-6, 4), (-12, -18), (35, -21), (-1071, 462)]:
            with self.subTest(a=a, b=b):
                g = greatest_common_divisor(a, b)
                self.assertEqual(a % g, 0)
                self.assertEqual(b % g, 0)


if __name__ == "__main__":
    unittest.main()
