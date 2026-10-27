import unittest

from src.solution import is_simple_power


class TestIsSimplePowerPrivate(unittest.TestCase):
    # Extends test_example_one_is_power_of_four: use a much larger base.
    def test_one_with_large_base(self):
        # 1000003**0 = 1.
        self.assertEqual(is_simple_power(1, 1000003), True)

    # Extends test_example_two_is_power_of_two: use a composite base.
    def test_exponent_one_composite_base(self):
        # 12**1 = 12.
        self.assertEqual(is_simple_power(12, 12), True)

    # Extends test_example_eight_is_power_of_two: exceed small exponent limits.
    def test_power_of_two_exponent_257(self):
        # The input is constructed as an exact integer power.
        self.assertEqual(is_simple_power(2**257, 2), True)

    # Extends test_example_three_is_not_power_of_two: divisibility is insufficient.
    def test_even_nonpower_of_two(self):
        # 2**3 = 8 < 12 < 16 = 2**4.
        self.assertEqual(is_simple_power(12, 2), False)

    # Extends test_example_three_is_not_power_of_one: all powers of 1 equal 1.
    def test_large_value_with_base_one(self):
        self.assertEqual(is_simple_power(10**30, 1), False)

    # Extends test_example_five_is_not_power_of_three: even a multiple can fail.
    def test_multiple_of_three_that_is_not_a_power(self):
        # 3**2 = 9 < 18 < 27 = 3**3.
        self.assertEqual(is_simple_power(18, 3), False)

    # Extends test_zero_exponent: include a negative base.
    def test_zero_exponent_negative_base(self):
        # (-7)**0 = 1.
        self.assertEqual(is_simple_power(1, -7), True)

    # Extends test_exponent_one_for_another_base: include a negative base/value.
    def test_exponent_one_negative_base(self):
        # (-11)**1 = -11.
        self.assertEqual(is_simple_power(-11, -11), True)

    # Extends test_higher_power_of_another_base: use a composite base and larger k.
    def test_high_power_composite_base(self):
        # The input is constructed as exactly 12**17.
        self.assertEqual(is_simple_power(12**17, 12), True)

    # Extends test_value_immediately_below_a_power: catch floating-point rounding.
    def test_one_below_large_power(self):
        # 10**39 < 10**40 - 1 < 10**40.
        self.assertEqual(is_simple_power(10**40 - 1, 10), False)

    # Extends test_value_immediately_above_a_power: preserve exact integer values.
    def test_one_above_large_power(self):
        # 10**40 < 10**40 + 1 < 10**41.
        self.assertEqual(is_simple_power(10**40 + 1, 10), False)

    # Extends test_value_between_one_and_base: check the upper end of this gap.
    def test_value_just_below_large_base(self):
        # Negative powers are below 1; 1 < 1008 < 1009.
        self.assertEqual(is_simple_power(1008, 1009), False)

    # Extends test_one_is_power_of_one: base 1 cannot produce a negative value.
    def test_negative_one_is_not_power_of_one(self):
        # 1**k = 1 for every integer k.
        self.assertEqual(is_simple_power(-1, 1), False)

    def test_square_of_composite_base(self):
        # 6 * 6 = 36.
        self.assertEqual(is_simple_power(36, 6), True)

    def test_same_prime_factors_do_not_make_power(self):
        # 12**2 = 144 < 288 < 1728 = 12**3.
        self.assertEqual(is_simple_power(288, 12), False)

    def test_square_with_wrong_base(self):
        # 8**1 = 8 < 16 < 64 = 8**2; being a square is insufficient.
        self.assertEqual(is_simple_power(16, 8), False)

    def test_smaller_base_is_not_power_of_larger_base(self):
        # 4**0 = 1 < 2 < 4**1; reversing x and n changes the question.
        self.assertEqual(is_simple_power(2, 4), False)

    def test_large_exact_decimal_power(self):
        # Exact construction of a power, beyond floating-point integer precision.
        self.assertEqual(is_simple_power(10**40, 10), True)

    def test_negative_value_positive_base(self):
        # All integer powers of a positive base are positive.
        self.assertEqual(is_simple_power(-8, 2), False)

    def test_negative_base_odd_exponent(self):
        # (-3)**5 = -243.
        self.assertEqual(is_simple_power(-243, -3), True)

    def test_negative_base_even_exponent(self):
        # (-3)**6 = 729.
        self.assertEqual(is_simple_power(729, -3), True)

    def test_negative_base_wrong_sign_for_odd_exponent(self):
        # Magnitude 27 requires exponent 3, but (-3)**3 = -27.
        self.assertEqual(is_simple_power(27, -3), False)

    def test_negative_base_wrong_sign_for_even_exponent(self):
        # Magnitude 81 requires exponent 4, but (-3)**4 = 81.
        self.assertEqual(is_simple_power(-81, -3), False)

    def test_negative_nonpower_with_negative_base(self):
        # 3**2 = 9 < 18 < 27 = 3**3, so no magnitude matches.
        self.assertEqual(is_simple_power(-18, -3), False)

    def test_negative_one_base_negative_one(self):
        # (-1)**1 = -1.
        self.assertEqual(is_simple_power(-1, -1), True)

    def test_negative_one_base_one(self):
        # (-1)**2 = 1.
        self.assertEqual(is_simple_power(1, -1), True)

    def test_negative_one_base_other_positive_value(self):
        # Integer powers of -1 are only -1 and 1.
        self.assertEqual(is_simple_power(2, -1), False)

    def test_negative_one_base_other_negative_value(self):
        # Integer powers of -1 are only -1 and 1.
        self.assertEqual(is_simple_power(-2, -1), False)

    def test_zero_is_power_of_zero(self):
        # 0**1 = 0; this does not depend on the meaning of 0**0.
        self.assertEqual(is_simple_power(0, 0), True)

    def test_nonzero_nonunit_value_with_zero_base(self):
        # Positive exponents give 0; zero/negative exponents cannot give 2.
        self.assertEqual(is_simple_power(2, 0), False)

    def test_zero_with_positive_base(self):
        # Every integer power of 5 is strictly positive.
        self.assertEqual(is_simple_power(0, 5), False)

    def test_zero_with_negative_base(self):
        # Every integer power of -5 is nonzero.
        self.assertEqual(is_simple_power(0, -5), False)

    def test_zero_with_base_one(self):
        # Every integer power of 1 equals 1.
        self.assertEqual(is_simple_power(0, 1), False)

    def test_negative_exponent_positive_base(self):
        # 2**(-3) = 1/8, exactly representable as a float.
        self.assertEqual(is_simple_power(0.125, 2), True)

    def test_fraction_is_not_power_of_positive_integer(self):
        # 2**(-1) = 0.5 < 0.75 < 1 = 2**0.
        self.assertEqual(is_simple_power(0.75, 2), False)

    def test_negative_exponent_negative_base_odd(self):
        # (-2)**(-3) = -1/8, exactly representable as a float.
        self.assertEqual(is_simple_power(-0.125, -2), True)

    def test_negative_exponent_negative_base_even(self):
        # (-2)**(-4) = 1/16, exactly representable as a float.
        self.assertEqual(is_simple_power(0.0625, -2), True)

    def test_negative_exponent_negative_base_wrong_sign(self):
        # Magnitude 1/8 requires exponent -3, which produces -1/8.
        self.assertEqual(is_simple_power(0.125, -2), False)

    def test_fractional_base_positive_exponent(self):
        # (1/2)**3 = 1/8; both fractions are exactly representable.
        self.assertEqual(is_simple_power(0.125, 0.5), True)

    def test_fractional_base_negative_exponent(self):
        # (1/2)**(-3) = 8.
        self.assertEqual(is_simple_power(8, 0.5), True)

    def test_fractional_base_nonpower(self):
        # (1/2)**(-1) = 2 < 3 < 4 = (1/2)**(-2).
        self.assertEqual(is_simple_power(3, 0.5), False)

    def test_negative_fractional_base_even_exponent(self):
        # (-1/2)**2 = 1/4.
        self.assertEqual(is_simple_power(0.25, -0.5), True)

    def test_negative_fractional_base_negative_odd_exponent(self):
        # (-1/2)**(-3) = -8.
        self.assertEqual(is_simple_power(-8, -0.5), True)

    def test_negative_fractional_base_wrong_sign(self):
        # Magnitude 8 requires exponent -3, which produces -8.
        self.assertEqual(is_simple_power(8, -0.5), False)
