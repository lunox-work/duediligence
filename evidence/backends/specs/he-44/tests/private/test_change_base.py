import unittest

from src.solution import change_base


class TestChangeBaseHidden(unittest.TestCase):
    # Extends test_example_eight_in_base_three: unequal digits expose reversed output.
    def test_ternary_asymmetric_digits(self):
        # 34 = 1 * 3**3 + 0 * 3**2 + 2 * 3 + 1.
        self.assertEqual(change_base(34, 3), "1021")

    # Extends test_example_eight_in_base_three: the leading digit need not be one.
    def test_ternary_leading_two(self):
        # 59 = 2 * 3**3 + 0 * 3**2 + 1 * 3 + 2.
        self.assertEqual(change_base(59, 3), "2012")

    # Extends test_example_eight_in_base_three: a carry across several digits.
    def test_ternary_before_power(self):
        # 80 = 2 * (27 + 9 + 3 + 1).
        self.assertEqual(change_base(80, 3), "2222")

    # Extends test_example_eight_in_base_three: a larger exact power.
    def test_ternary_power(self):
        # 81 = 3**4.
        self.assertEqual(change_base(81, 3), "10000")

    # Extends test_example_eight_in_base_two: a non-power with a trailing zero.
    def test_binary_two_separated_ones(self):
        # 10 = 2**3 + 2**1.
        self.assertEqual(change_base(10, 2), "1010")

    # Extends test_example_eight_in_base_two: conversion cannot truncate to 64 bits.
    def test_binary_large_exact_power(self):
        # A radix raised to 80 is one followed by 80 zero digits.
        self.assertEqual(change_base(2**80, 2), "1" + "0" * 80)

    # Extends test_example_eight_in_base_two: float division can lose the low bit.
    def test_binary_large_power_plus_one(self):
        # 2**80 + 1 has ones at positions 80 and zero.
        self.assertEqual(change_base(2**80 + 1, 2), "1" + "0" * 79 + "1")

    # Extends test_example_seven_in_base_two: much more than three all-one digits.
    def test_binary_large_all_ones(self):
        # Sum(2**k, k=0..64) = 2**65 - 1.
        self.assertEqual(change_base(2**65 - 1, 2), "1" * 65)

    # Extends test_example_seven_in_base_two: nearby values are not all ones.
    def test_binary_before_all_ones(self):
        # Sum(2**k, k=1..11) = 2**12 - 2.
        self.assertEqual(change_base(4094, 2), "1" * 11 + "0")

    # Extends test_conversion_in_base_five: every digit and a trailing zero.
    def test_base_five_descending_digits(self):
        # 2930 = 4 * 625 + 3 * 125 + 2 * 25 + 1 * 5.
        self.assertEqual(change_base(2930, 5), "43210")

    # Extends test_conversion_in_base_five: several separated zero digits.
    def test_base_five_multiple_zeros(self):
        # Positional expansion of 403204 in base five.
        value = 4 * 5**5 + 3 * 5**3 + 2 * 5**2 + 4
        self.assertEqual(change_base(value, 5), "403204")

    # Extends test_conversion_in_base_five: a long result beyond float precision.
    def test_base_five_long_mixed_digits(self):
        expected = "4301204032140123043210412304"
        # Construct the input from the stated digits and their place values.
        value = sum(int(digit) * 5**power
                    for power, digit in enumerate(reversed(expected)))
        self.assertEqual(change_base(value, 5), expected)

    # Extends test_zero: zero must also terminate and return a digit in base three.
    def test_zero_in_base_three(self):
        # Zero has the single-digit representation "0" in every radix.
        self.assertEqual(change_base(0, 3), "0")

    # Extends test_zero: a different odd base.
    def test_zero_in_base_five(self):
        # Zero has the single-digit representation "0" in every radix.
        self.assertEqual(change_base(0, 5), "0")

    # Extends test_zero: the greatest permitted radix.
    def test_zero_in_base_nine(self):
        # Zero has the single-digit representation "0" in every radix.
        self.assertEqual(change_base(0, 9), "0")

    # Extends test_one_in_base_two: the identity digit in base four.
    def test_one_in_base_four(self):
        # 1 < 4, so there is just the units digit.
        self.assertEqual(change_base(1, 4), "1")

    # Extends test_one_in_base_two: the identity digit in base six.
    def test_one_in_base_six(self):
        # 1 < 6, so there is just the units digit.
        self.assertEqual(change_base(1, 6), "1")

    # Extends test_one_in_base_two: the identity digit at the largest radix.
    def test_one_in_base_nine(self):
        # 1 < 9, so there is just the units digit.
        self.assertEqual(change_base(1, 9), "1")

    # Extends test_largest_single_digit_in_base_nine: the boundary in base three.
    def test_largest_digit_in_base_three(self):
        # The largest digit is base - 1 = 2.
        self.assertEqual(change_base(2, 3), "2")

    # Extends test_largest_single_digit_in_base_nine: the boundary in base five.
    def test_largest_digit_in_base_five(self):
        # The largest digit is base - 1 = 4.
        self.assertEqual(change_base(4, 5), "4")

    # Extends test_largest_single_digit_in_base_nine: the boundary in base six.
    def test_largest_digit_in_base_six(self):
        # The largest digit is base - 1 = 5.
        self.assertEqual(change_base(5, 6), "5")

    # Extends test_largest_single_digit_in_base_nine: the boundary in base eight.
    def test_largest_digit_in_base_eight(self):
        # The largest digit is base - 1 = 7.
        self.assertEqual(change_base(7, 8), "7")

    # Extends test_number_equal_to_base: the smallest ordinary positional radix.
    def test_number_equal_to_base_two(self):
        # 2 = 1 * 2 + 0.
        self.assertEqual(change_base(2, 2), "10")

    # Extends test_number_equal_to_base: the corresponding ternary boundary.
    def test_number_equal_to_base_three(self):
        # 3 = 1 * 3 + 0.
        self.assertEqual(change_base(3, 3), "10")

    # Extends test_number_equal_to_base: base four is absent from the public suite.
    def test_number_equal_to_base_four(self):
        # 4 = 1 * 4 + 0.
        self.assertEqual(change_base(4, 4), "10")

    # Extends test_number_equal_to_base: base five at its first carry.
    def test_number_equal_to_base_five(self):
        # 5 = 1 * 5 + 0.
        self.assertEqual(change_base(5, 5), "10")

    # Extends test_number_equal_to_base: base six is absent from the public suite.
    def test_number_equal_to_base_six(self):
        # 6 = 1 * 6 + 0.
        self.assertEqual(change_base(6, 6), "10")

    # Extends test_number_equal_to_base: base seven is absent from the public suite.
    def test_number_equal_to_base_seven(self):
        # 7 = 1 * 7 + 0.
        self.assertEqual(change_base(7, 7), "10")

    # Extends test_number_equal_to_base: base eight at its first carry.
    def test_number_equal_to_base_eight(self):
        # 8 = 1 * 8 + 0.
        self.assertEqual(change_base(8, 8), "10")

    # Extends test_internal_zero_digit: multiple internal zeros in base four.
    def test_base_four_multiple_internal_zeros(self):
        # Positional expansion of 3000201 in base four.
        value = 3 * 4**6 + 2 * 4**2 + 1
        self.assertEqual(change_base(value, 4), "3000201")

    # Extends test_internal_zero_digit: asymmetry and several zero runs.
    def test_base_six_multiple_internal_zeros(self):
        # Positional expansion of 50400302 in base six.
        value = 5 * 6**7 + 4 * 6**5 + 3 * 6**2 + 2
        self.assertEqual(change_base(value, 6), "50400302")

    # Extends test_internal_zero_digit: an entire suffix consists of zero digits.
    def test_base_seven_power(self):
        # 7**5 is one followed by five zero digits.
        self.assertEqual(change_base(7**5, 7), "100000")

    # Extends test_internal_zero_digit: distinct nonzero digits expose reversal.
    def test_base_eight_long_zero_runs(self):
        # Positional expansion of 70001002 in base eight.
        value = 7 * 8**7 + 1 * 8**3 + 2
        self.assertEqual(change_base(value, 8), "70001002")

    # Extends test_largest_allowed_base_with_multiple_digits: all nonzero digits.
    def test_base_nine_all_nonzero_digits(self):
        expected = "12345678"
        # Construct the input by the positional definition of base nine.
        value = sum(int(digit) * 9**power
                    for power, digit in enumerate(reversed(expected)))
        self.assertEqual(change_base(value, 9), expected)

    # Extends test_largest_allowed_base_with_multiple_digits: a long carry boundary.
    def test_base_nine_long_maximal_digits(self):
        # Sum(8 * 9**k, k=0..19) = 9**20 - 1.
        self.assertEqual(change_base(9**20 - 1, 9), "8" * 20)

    # Extends test_largest_allowed_base_with_multiple_digits: exact large power.
    def test_base_nine_large_power(self):
        # 9**20 has one at position 20 and zero at every lower position.
        self.assertEqual(change_base(9**20, 9), "1" + "0" * 20)

    # Extends test_largest_allowed_base_with_multiple_digits: low digit must survive.
    def test_base_nine_large_power_plus_digit(self):
        # 9**20 + 7 has a leading one, 19 zero digits, and units digit seven.
        self.assertEqual(change_base(9**20 + 7, 9), "1" + "0" * 19 + "7")

    # Extends test_conversion_in_base_five: conversion must honor another radix.
    def test_base_four_mixed_digits(self):
        # 27 = 1 * 4**2 + 2 * 4 + 3.
        self.assertEqual(change_base(27, 4), "123")

    # Extends test_conversion_in_base_five: base six must allow its digit five.
    def test_base_six_descending_digits(self):
        # Positional expansion of 543210 in base six.
        value = 5 * 6**5 + 4 * 6**4 + 3 * 6**3 + 2 * 6**2 + 6
        self.assertEqual(change_base(value, 6), "543210")

    # Extends test_conversion_in_base_five: base seven must allow its digit six.
    def test_base_seven_all_nonzero_digits(self):
        # Positional expansion of 123456 in base seven.
        value = 7**5 + 2 * 7**4 + 3 * 7**3 + 4 * 7**2 + 5 * 7 + 6
        self.assertEqual(change_base(value, 7), "123456")
