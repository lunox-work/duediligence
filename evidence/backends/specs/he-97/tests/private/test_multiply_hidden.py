import unittest

from src.solution import multiply


class TestMultiplyHidden(unittest.TestCase):
    # Extends test_example_148_and_412 with different digits and operand lengths.
    def test_different_lengths_and_unit_digits(self):
        # The unit digits are 7 and 3, so 7 * 3 = 21.
        self.assertEqual(multiply(827, 41653), 21)

    # Extends test_example_19_and_28 beyond the visible operands.
    def test_large_product_of_two_unit_digits(self):
        # The unit digits are 8 and 7, so 8 * 7 = 56.
        self.assertEqual(multiply(1238, 4567), 56)

    # Extends test_example_2020_and_1851 with two negative operands.
    def test_negative_first_operand_ending_in_zero(self):
        # The unit digits are 0 and 9, so 0 * 9 = 0.
        self.assertEqual(multiply(-9870, -12349), 0)

    # Extends test_example_14_and_negative_15 with a nonsymmetric negative digit.
    def test_negative_second_operand_ending_in_four(self):
        # The unit digits are 7 and 4, so 7 * 4 = 28.
        self.assertEqual(multiply(127, -34), 28)

    # Extends test_higher_digits_do_not_affect_product to arbitrary-size integers.
    def test_thousands_of_digits_in_both_operands(self):
        # Each power of ten ends in 0; adding 7 and 8 gives 7 * 8 = 56.
        self.assertEqual(multiply(10**5000 + 7, 10**5001 + 8), 56)

    # Extends test_single_digit_inputs with a different pair and product.
    def test_single_digit_eight_and_four(self):
        # Both operands are their unit digits: 8 * 4 = 32.
        self.assertEqual(multiply(8, 4), 32)

    # Extends test_largest_unit_digit_product to signed multidigit operands.
    def test_maximum_product_from_multidigit_operands(self):
        # Both unsigned unit digits are 9, so 9 * 9 = 81.
        self.assertEqual(multiply(12349, -789), 81)

    # Extends test_first_input_is_zero with a negative second operand.
    def test_zero_first_and_negative_multidigit_second(self):
        # The unit digits are 0 and 8, so 0 * 8 = 0.
        self.assertEqual(multiply(0, -998), 0)

    # Extends test_second_input_is_zero with a negative first operand.
    def test_negative_multidigit_first_and_zero_second(self):
        # The unit digits are 3 and 0, so 3 * 0 = 0.
        self.assertEqual(multiply(-543, 0), 0)

    # Extends test_both_inputs_are_zero to zero paired with a negative unit digit.
    def test_zero_and_negative_single_digit(self):
        # The unit digits are 0 and 8, so 0 * 8 = 0.
        self.assertEqual(multiply(0, -8), 0)

    # Extends test_second_input_ends_in_zero to a negative second operand.
    def test_negative_nonzero_second_operand_ending_in_zero(self):
        # The unit digits are 9 and 0, so 9 * 0 = 0.
        self.assertEqual(multiply(149, -230), 0)

    # Extends test_first_input_is_negative with a different unsigned unit digit.
    def test_negative_first_operand_ending_in_eight(self):
        # The unit digits are 8 and 4, so 8 * 4 = 32.
        self.assertEqual(multiply(-108, 64), 32)

    # Extends test_both_inputs_are_negative with digits whose product ends in 0.
    def test_both_negative_with_product_thirty(self):
        # The unit digits are 5 and 6; return all of 5 * 6 = 30.
        self.assertEqual(multiply(-75, -86), 30)

    # Extends test_negative_single_digit_inputs with a different pair.
    def test_negative_single_digit_four_and_seven(self):
        # The unsigned unit digits are 4 and 7, so 4 * 7 = 28.
        self.assertEqual(multiply(-4, -7), 28)

    # Extends test_negative_multiple_of_ten with zero in the second position.
    def test_both_negative_with_second_multiple_of_ten(self):
        # The unit digits are 7 and 0, so 7 * 0 = 0.
        self.assertEqual(multiply(-47, -980), 0)

    # Extends test_higher_digits_do_not_affect_product past exact float integers.
    def test_operands_beyond_exact_binary_float_integer_range(self):
        # Reading the decimal endings gives 3 * 7 = 21.
        self.assertEqual(multiply(9007199254740993, -9007199254740997), 21)

    # Extends test_higher_digits_do_not_affect_product across a decimal boundary.
    def test_opposite_sides_of_large_power_of_ten(self):
        # 10**100 - 1 ends in 9 and 10**100 + 1 ends in 1: 9 * 1 = 9.
        self.assertEqual(multiply(10**100 - 1, 10**100 + 1), 9)

    # Extends test_first_input_is_negative to negative arbitrary-size integers.
    def test_negative_operand_with_thousands_of_digits(self):
        # The absolute first operand ends in 2; 2 * 9 = 18.
        self.assertEqual(multiply(-(10**5000 + 2), 39), 18)

    # Extends test_single_digit_inputs to the smallest nonzero unit digit.
    def test_unit_digit_one(self):
        # The unit digits are 1 and 6, so 1 * 6 = 6.
        self.assertEqual(multiply(1, 876), 6)

    # Extends test_negative_single_digit_inputs to two repeated minimum digits.
    def test_repeated_negative_one(self):
        # Both unsigned unit digits are 1, so 1 * 1 = 1.
        self.assertEqual(multiply(-1, -1), 1)

    # Extends test_largest_unit_digit_product to repeated nonmaximum operands.
    def test_repeated_multidigit_operand(self):
        # Each unit digit is 6, so 6 * 6 = 36.
        self.assertEqual(multiply(246, 246), 36)

    # Extends test_both_inputs_are_negative to repeated negative operands.
    def test_repeated_negative_multidigit_operand(self):
        # Both unsigned unit digits are 3, so 3 * 3 = 9.
        self.assertEqual(multiply(-123, -123), 9)

    # Extends test_example_14_and_negative_15 by reversing the operand signs.
    def test_negative_single_digit_first_positive_second(self):
        # The unsigned unit digits are 2 and 9, so 2 * 9 = 18.
        self.assertEqual(multiply(-2, 9), 18)

    # Extends test_negative_single_digit_inputs to mixed signs in reverse order.
    def test_positive_single_digit_first_negative_second(self):
        # The unsigned unit digits are 9 and 2, so 9 * 2 = 18.
        self.assertEqual(multiply(9, -2), 18)

    # Extends test_second_input_ends_in_zero to two nonzero multiples of ten.
    def test_two_nonzero_multiples_of_ten(self):
        # Both unit digits are 0, so 0 * 0 = 0.
        self.assertEqual(multiply(430, 270), 0)

    # Extends test_negative_multiple_of_ten to an arbitrary-size multiple of ten.
    def test_huge_negative_multiple_of_ten(self):
        # A power of ten has unit digit 0, so 0 * 8 = 0.
        self.assertEqual(multiply(-(10**5000), 18), 0)

    # Extends test_both_inputs_are_zero with zero in the opposite signed pairing.
    def test_negative_single_digit_and_zero(self):
        # The unsigned unit digits are 9 and 0, so 9 * 0 = 0.
        self.assertEqual(multiply(-9, 0), 0)

    # Extends test_example_148_and_412 where leading and unit digits differ.
    def test_first_digits_and_last_digits_give_different_products(self):
        # Only the trailing 2 and 5 contribute: 2 * 5 = 10.
        self.assertEqual(multiply(92, 85), 10)

    # Extends test_single_digit_inputs with the same unit digits on larger inputs.
    def test_different_operands_with_equal_unit_digits(self):
        # Both unit digits are 4, so 4 * 4 = 16.
        self.assertEqual(multiply(104, 9004), 16)

    # Extends test_example_19_and_28 to a large product in reversed digit order.
    def test_reversed_eight_and_nine_unit_digits(self):
        # The unit digits are 8 and 9, so 8 * 9 = 72.
        self.assertEqual(multiply(1008, 2009), 72)
