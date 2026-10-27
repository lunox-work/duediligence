import unittest

from src.solution import modp


class TestModpPrivate(unittest.TestCase):
    # Extends test_example_three_modulo_five: a different exponent must wrap.
    def test_four_modulo_five(self):
        # 2^4 = 16 = 3 * 5 + 1.
        self.assertEqual(modp(4, 5), 1)

    # Extends test_example_three_modulo_five: changing only p changes the result.
    def test_three_modulo_seven(self):
        # 2^3 = 8 = 7 + 1.
        self.assertEqual(modp(3, 7), 1)

    # Extends test_example_large_exponent: check the preceding exponent.
    def test_large_exponent_preceding_example(self):
        # Compute the defining power exactly, then take its integer remainder.
        self.assertEqual(modp(1100, 101), (1 << 1100) % 101)

    # Extends test_example_large_exponent: neither argument is the example's.
    def test_large_exponent_other_prime(self):
        # An exact integer power provides an independent, direct oracle.
        self.assertEqual(modp(2345, 97), (1 << 2345) % 97)

    # Extends test_example_zero_exponent: the base is divisible by p.
    def test_zero_exponent_modulo_two(self):
        # 2^0 = 1, including when p divides every positive power of two.
        self.assertEqual(modp(0, 2), 1)

    # Extends test_example_zero_exponent: a modulus beyond machine integers.
    def test_zero_exponent_large_modulus(self):
        # 1 is smaller than this positive modulus.
        self.assertEqual(modp(0, (1 << 200) + 123), 1)

    # Extends test_example_power_below_modulus: just below a larger modulus.
    def test_power_one_below_modulus(self):
        # 2^8 = 256 < 257.
        self.assertEqual(modp(8, 257), 256)

    # Extends test_example_power_below_modulus: an unreduced, very large result.
    def test_large_power_below_large_modulus(self):
        # 2^80 is less than 2^80 + 7, so the power itself is the remainder.
        self.assertEqual(modp(80, (1 << 80) + 7), 1 << 80)

    # Extends test_example_exponent_one_hundred: p - 1 no longer equals n.
    def test_one_hundred_other_prime(self):
        # Compute the defining integer power without floating point.
        self.assertEqual(modp(100, 103), (1 << 100) % 103)

    # Extends test_example_exponent_one_hundred: move one exponent past p - 1.
    def test_exponent_equal_to_odd_prime(self):
        # The documented 2^100 mod 101 = 1 implies 2^101 mod 101 = 2.
        self.assertEqual(modp(101, 101), 2)

    # Extends test_typical_remainder: a larger power and different modulus.
    def test_typical_remainder_larger_inputs(self):
        # 2^17 = 131072 = 10082 * 13 + 6.
        self.assertEqual(modp(17, 13), 6)

    # Extends test_typical_remainder: reducing n modulo p would be incorrect.
    def test_exponent_equal_to_odd_composite(self):
        # 2^9 = 512 = 56 * 9 + 8; n modulo p would instead give exponent 0.
        self.assertEqual(modp(9, 9), 8)

    # Extends test_smallest_positive_exponent: the power equals the modulus.
    def test_one_modulo_two(self):
        # 2^1 = 2 has remainder zero modulo 2.
        self.assertEqual(modp(1, 2), 0)

    # Extends test_smallest_positive_exponent: combine n = 1 with p = 1.
    def test_one_modulo_one(self):
        # 2^1 = 2 is divisible by 1.
        self.assertEqual(modp(1, 1), 0)

    # Extends test_smallest_positive_exponent: modulus exceeds float precision.
    def test_one_with_large_modulus(self):
        # The integer power 2 is smaller than this modulus.
        self.assertEqual(modp(1, (1 << 100) + 3), 2)

    # Extends test_modulus_one: combine the special modulus with a large n.
    def test_large_exponent_modulo_one(self):
        # Every integer power is divisible by 1.
        self.assertEqual(modp(4097, 1), 0)

    # Extends test_modulus_one: a small even exponent still gives zero.
    def test_two_modulo_one(self):
        # 2^2 = 4 is divisible by 1.
        self.assertEqual(modp(2, 1), 0)

    # Extends test_zero_exponent_with_modulus_one: zero n does not always give 0.
    def test_zero_exponent_even_composite(self):
        # 2^0 = 1, whose remainder modulo 12 is 1.
        self.assertEqual(modp(0, 12), 1)

    # Extends test_zero_exponent_with_modulus_one: a power-of-two modulus.
    def test_zero_exponent_power_of_two_modulus(self):
        # 1 is smaller than 2^64.
        self.assertEqual(modp(0, 1 << 64), 1)

    # Extends test_even_composite_modulus: prime-only exponent reduction fails.
    def test_even_composite_with_repeated_prime_factor(self):
        # 2^12 = 4096 = 341 * 12 + 4; reducing n modulo 11 would give 2.
        self.assertEqual(modp(12, 12), 4)

    # Extends test_even_composite_modulus: n = p also defeats n modulo p - 1.
    def test_even_composite_exponent_equal_to_modulus(self):
        # 2^6 = 64 = 10 * 6 + 4; reducing n modulo 5 would give 2 instead.
        self.assertEqual(modp(6, 6), 4)

    # Extends test_power_equal_to_modulus: equality at another power of two.
    def test_larger_power_equal_to_modulus(self):
        # 2^7 = 128.
        self.assertEqual(modp(7, 128), 0)

    # Extends test_power_equal_to_modulus: the power is twice the modulus.
    def test_power_above_power_of_two_modulus(self):
        # 2^9 = 512 = 2 * 256.
        self.assertEqual(modp(9, 256), 0)

    # Extends test_power_equal_to_modulus: a power-of-two modulus need not give 0.
    def test_power_below_power_of_two_modulus(self):
        # 2^7 = 128 < 256.
        self.assertEqual(modp(7, 256), 128)

    # Extends test_large_power_requires_exact_remainder: odd composite modulus.
    def test_large_power_odd_composite(self):
        # Direct exact exponentiation and remainder is the definition.
        self.assertEqual(modp(137, 945), (1 << 137) % 945)

    # Extends test_large_power_requires_exact_remainder: exceeds float range.
    def test_power_far_beyond_float_range(self):
        # This direct integer oracle uses only about 13 KB for the full power.
        self.assertEqual(modp(100003, 1000000007), (1 << 100003) % 1000000007)

    # Extends test_large_power_requires_exact_remainder: adjacent huge integers.
    def test_modulus_one_above_large_power(self):
        # Exact integers distinguish 2^63 from 2^63 + 1; floats may not.
        self.assertEqual(modp(63, (1 << 63) + 1), 1 << 63)

    # Extends test_large_even_exponent: parity changes the remainder modulo 3.
    def test_large_odd_exponent_modulo_three(self):
        # 2^2 is 1 modulo 3, so 2^(2 * 512 + 1) is 2 modulo 3.
        self.assertEqual(modp(1025, 3), 2)

    # Extends test_large_even_exponent: even n does not imply remainder 1.
    def test_large_even_exponent_modulo_nine(self):
        # 2^6 = 64 is 1 modulo 9; 1024 = 6 * 170 + 4 and 2^4 mod 9 = 7.
        self.assertEqual(modp(1024, 9), 7)

    # Extends test_large_even_exponent: same parity, different cycle position.
    def test_large_even_exponent_modulo_five(self):
        # 2^4 is 1 modulo 5; 1026 = 4 * 256 + 2, so the remainder is 4.
        self.assertEqual(modp(1026, 5), 4)
