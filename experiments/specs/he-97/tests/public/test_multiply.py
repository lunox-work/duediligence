import unittest

from src.solution import multiply


class TestMultiply(unittest.TestCase):
    # Docstring examples.

    def test_example_148_412(self):
        self.assertEqual(multiply(148, 412), 16)

    def test_example_19_28(self):
        self.assertEqual(multiply(19, 28), 72)

    def test_example_2020_1851(self):
        self.assertEqual(multiply(2020, 1851), 0)

    def test_example_14_negative_15(self):
        self.assertEqual(multiply(14, -15), 20)

    # Rule: the result is the product of the two unit digits.

    def test_product_of_unit_digits_typical(self):
        # Unit digits are 3 and 7; 3 * 7 = 21.
        self.assertEqual(multiply(23, 47), 21)

    def test_product_single_digit_inputs_largest(self):
        # A single-digit number is its own unit digit; 9 * 9 = 81,
        # the largest possible product of two digits.
        self.assertEqual(multiply(9, 9), 81)

    def test_product_with_zero_unit_digit(self):
        # Unit digits are 0 and 7; 0 * 7 = 0.
        self.assertEqual(multiply(10, 7), 0)

    def test_product_of_zeros(self):
        # 0 has unit digit 0; 0 * 0 = 0.
        self.assertEqual(multiply(0, 0), 0)

    def test_product_large_numbers(self):
        # Unit digits are 9 and 1; 9 * 1 = 9.
        self.assertEqual(multiply(123456789, 987654321), 9)

    # Rule (from the example multiply(14, -15) == 20): a negative number's
    # unit digit is the last digit of its absolute value, and the result is
    # the non-negative product of those digits.

    def test_negative_first_argument(self):
        # -23 has unit digit 3, 47 has unit digit 7; 3 * 7 = 21.
        self.assertEqual(multiply(-23, 47), 21)

    def test_both_negative_single_digit(self):
        # -9 has unit digit 9 for both; 9 * 9 = 81.
        self.assertEqual(multiply(-9, -9), 81)


if __name__ == "__main__":
    unittest.main()
