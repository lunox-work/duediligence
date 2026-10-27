import unittest

from src.solution import modp


def brute(n, p):
    # Obviously correct reference: Python ints are unbounded, so 2 ** n is
    # the exact power and % p its remainder for p >= 1.
    return (2 ** n) % p


class TestModpPrivate(unittest.TestCase):
    # Rule: return 2^n modulo p, checked exhaustively on a small grid.

    def test_exhaustive_small_grid(self):
        # Every n in 0..80 and p in 1..80 against the exact big-int power.
        for n in range(81):
            for p in range(1, 81):
                self.assertEqual(modp(n, p), brute(n, p), (n, p))

    def test_result_is_int(self):
        # The doctest shows `3`, not `3.0`, so the result is an int.
        self.assertIs(type(modp(3, 5)), int)

    def test_result_is_int_large_exponent(self):
        # Same for an exponent beyond float range (2^2000 overflows a float).
        self.assertIs(type(modp(2000, 7)), int)

    # Extends test_example_3_5: other exponents and moduli near it.

    def test_three_mod_seven(self):
        # 2^3 = 8; 8 mod 7 = 1.
        self.assertEqual(modp(3, 7), 1)

    def test_two_mod_five(self):
        # 2^2 = 4 < 5.
        self.assertEqual(modp(2, 5), 4)

    def test_four_mod_five(self):
        # 2^4 = 16; 16 mod 5 = 1.
        self.assertEqual(modp(4, 5), 1)

    # Extends test_example_1101_101: neighbouring exponent, other modulus.

    def test_1102_mod_101(self):
        # 2^1102 = 2^1101 * 2 = 2 * 2 = 4 (mod 101), using the docstring value.
        self.assertEqual(modp(1102, 101), 4)

    def test_1101_mod_103(self):
        # Exact big-int power, then remainder.
        self.assertEqual(modp(1101, 103), brute(1101, 103))

    # Extends test_example_0_101: n = 0 with other moduli.

    def test_zero_exponent_modulus_one(self):
        # 2^0 = 1; 1 mod 1 = 0. Catches "if n == 0: return 1".
        self.assertEqual(modp(0, 1), 0)

    def test_zero_exponent_modulus_two(self):
        # 2^0 = 1; 1 mod 2 = 1.
        self.assertEqual(modp(0, 2), 1)

    def test_zero_exponent_huge_modulus(self):
        # 2^0 = 1 < 10^40.
        self.assertEqual(modp(0, 10 ** 40), 1)

    # Extends test_example_3_11: other exponents mod 11.

    def test_four_mod_eleven(self):
        # 2^4 = 16; 16 mod 11 = 5.
        self.assertEqual(modp(4, 11), 5)

    def test_ten_mod_eleven(self):
        # 2^10 = 1024 = 93 * 11 + 1.
        self.assertEqual(modp(10, 11), 1)

    # Extends test_example_100_101: other exponents mod 101.

    def test_200_mod_101(self):
        # 2^200 = (2^100)^2 = 1 (mod 101), using the docstring value.
        self.assertEqual(modp(200, 101), 1)

    def test_50_mod_101(self):
        # Exact big-int power, then remainder.
        self.assertEqual(modp(50, 101), brute(50, 101))

    def test_99_mod_101(self):
        # 2^99 * 2 = 2^100 = 1 (mod 101), so 2^99 is the inverse of 2,
        # which is 51 (2 * 51 = 102 = 101 + 1).
        self.assertEqual(modp(99, 101), 51)

    # Extends test_power_exceeds_modulus: larger power, same modulus.

    def test_twenty_mod_thousand(self):
        # 2^20 = 1048576; 1048576 mod 1000 = 576.
        self.assertEqual(modp(20, 1000), 576)

    # Composite modulus with n beyond p - 1: catches a Fermat-style
    # shortcut that reduces n mod (p - 1), valid only for prime p.

    def test_composite_modulus_nine(self):
        # 2^20 = 1048576 = 116508 * 9 + 4. A Fermat shortcut gives
        # 2^(20 mod 8) = 16 = 7 (mod 9).
        self.assertEqual(modp(20, 9), 4)

    def test_composite_modulus_large_exponent(self):
        # 1000 = 2^3 * 125; exact big-int power, then remainder.
        self.assertEqual(modp(100003, 1000), brute(100003, 1000))

    # Extends test_power_equals_modulus: other powers of two.

    def test_power_equals_modulus_32(self):
        # 2^5 = 32; 32 mod 32 = 0.
        self.assertEqual(modp(5, 32), 0)

    def test_power_exceeds_power_of_two_modulus(self):
        # 16 divides 2^5 = 32, so the remainder is 0.
        self.assertEqual(modp(5, 16), 0)

    def test_modulus_two(self):
        # 2^1 = 2; 2 mod 2 = 0.
        self.assertEqual(modp(1, 2), 0)

    # Extends test_power_just_below_modulus: moduli that are not powers of two.

    def test_just_below_odd_modulus(self):
        # 2^10 = 1024 < 1025.
        self.assertEqual(modp(10, 1025), 1024)

    def test_just_above_modulus(self):
        # 2^9 = 512 = 511 + 1.
        self.assertEqual(modp(9, 511), 1)

    # Extends test_modulus_one: other exponents with p = 1.

    def test_modulus_one_large_exponent(self):
        # Every integer is 0 modulo 1.
        self.assertEqual(modp(5000, 1), 0)

    def test_modulus_one_exponent_one(self):
        # 2 mod 1 = 0.
        self.assertEqual(modp(1, 1), 0)

    # Extends test_large_exponent: large n with composite and big moduli.

    def test_large_exponent_composite_modulus(self):
        # Exact big-int power of 2^200000, then remainder.
        self.assertEqual(modp(200000, 999999), brute(200000, 999999))

    def test_large_exponent_beyond_64_bit_modulus(self):
        # Modulus above 2^64; exact big-int power, then remainder.
        p = 2 ** 64 + 13
        self.assertEqual(modp(150000, p), brute(150000, p))

    def test_mersenne_prime_modulus(self):
        # p = 2^61 - 1, so 2^61 = 1 (mod p) and 2^100 = 2^61 * 2^39 = 2^39.
        self.assertEqual(modp(100, 2 ** 61 - 1), 2 ** 39)

    def test_exponent_just_beyond_float_range(self):
        # 2^1024 overflows a float; 2^1024 = 2^1000 * 2^24 and
        # 2^1000 = (2^100)^10 = 1 (mod 101), so 2^1024 = 2^24 mod 101.
        self.assertEqual(modp(1024, 101), brute(24, 101))

    # Extends test_large_exponent_with_remainder: other remainders mod 101.

    def test_large_exponent_remainder_one(self):
        # 2^1000001 = (2^100)^10000 * 2 = 2 (mod 101).
        self.assertEqual(modp(1000001, 101), 2)

    def test_large_exponent_remainder_99(self):
        # 2^1000099 = (2^100)^10000 * 2^99 = 51 (mod 101); see test_99_mod_101.
        self.assertEqual(modp(1000099, 101), 51)

    # Extends test_large_exponent_power_of_two_modulus: modulus larger than
    # the power, and a power of two times an odd factor.

    def test_power_of_two_modulus_larger_than_power(self):
        # 2^1000 < 2^1001, so the remainder is 2^1000 itself.
        self.assertEqual(modp(1000, 2 ** 1001), 2 ** 1000)

    def test_mixed_power_of_two_modulus(self):
        # 3072 = 3 * 1024; exact big-int power, then remainder.
        self.assertEqual(modp(1000, 3072), brute(1000, 3072))


if __name__ == "__main__":
    unittest.main()
