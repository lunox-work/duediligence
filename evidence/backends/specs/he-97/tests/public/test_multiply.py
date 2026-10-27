import unittest

from src.solution import multiply


class TestMultiply(unittest.TestCase):
    def test_example_148_and_412(self):
        self.assertEqual(multiply(148, 412), 16)

    def test_example_19_and_28(self):
        self.assertEqual(multiply(19, 28), 72)

    def test_example_2020_and_1851(self):
        self.assertEqual(multiply(2020, 1851), 0)

    def test_example_14_and_negative_15(self):
        self.assertEqual(multiply(14, -15), 20)

    def test_higher_digits_do_not_affect_product(self):
        # Only the unit digits contribute: 6 * 4 = 24.
        self.assertEqual(multiply(123456, 987654), 24)

    def test_single_digit_inputs(self):
        # Single-digit integers are their own unit digits: 3 * 7 = 21.
        self.assertEqual(multiply(3, 7), 21)

    def test_largest_unit_digit_product(self):
        # Each unit digit can be at most 9, so the maximum is 9 * 9 = 81.
        self.assertEqual(multiply(9, 9), 81)

    def test_first_input_is_zero(self):
        # Zero has unit digit 0: 0 * 7 = 0.
        self.assertEqual(multiply(0, 37), 0)

    def test_second_input_is_zero(self):
        # Zero has unit digit 0: 2 * 0 = 0.
        self.assertEqual(multiply(62, 0), 0)

    def test_both_inputs_are_zero(self):
        # Both unit digits are 0: 0 * 0 = 0.
        self.assertEqual(multiply(0, 0), 0)

    def test_second_input_ends_in_zero(self):
        # A nonzero multiple of ten has unit digit 0: 7 * 0 = 0.
        self.assertEqual(multiply(37, 120), 0)

    def test_first_input_is_negative(self):
        # As in the negative example, use the digit without its sign: 3 * 7 = 21.
        self.assertEqual(multiply(-23, 47), 21)

    def test_both_inputs_are_negative(self):
        # The unit digits are 2 and 6 regardless of the signs: 2 * 6 = 12.
        self.assertEqual(multiply(-32, -46), 12)

    def test_negative_single_digit_inputs(self):
        # The unsigned unit digits of -1 and -9 are 1 and 9: 1 * 9 = 9.
        self.assertEqual(multiply(-1, -9), 9)

    def test_negative_multiple_of_ten(self):
        # The unit digit of -120 is 0: 0 * 3 = 0.
        self.assertEqual(multiply(-120, 33), 0)
