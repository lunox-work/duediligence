import unittest

from src.solution import change_base


class TestChangeBase(unittest.TestCase):
    def test_example_eight_in_base_three(self):
        self.assertEqual(change_base(8, 3), "22")

    def test_example_eight_in_base_two(self):
        self.assertEqual(change_base(8, 2), "1000")

    def test_example_seven_in_base_two(self):
        self.assertEqual(change_base(7, 2), "111")

    def test_conversion_in_base_five(self):
        # 42 = 1 * 5**2 + 3 * 5 + 2.
        self.assertEqual(change_base(42, 5), "132")

    def test_zero(self):
        # Zero is represented by the single digit 0 in base two.
        self.assertEqual(change_base(0, 2), "0")

    def test_one_in_base_two(self):
        # 1 is smaller than 2, so its representation is the single digit 1.
        self.assertEqual(change_base(1, 2), "1")

    def test_largest_single_digit_in_base_nine(self):
        # 8 < 9, so 8 is a single digit in base nine.
        self.assertEqual(change_base(8, 9), "8")

    def test_number_equal_to_base(self):
        # 9 = 1 * 9 + 0, the first two-digit number in base nine.
        self.assertEqual(change_base(9, 9), "10")

    def test_internal_zero_digit(self):
        # 65 = 1 * 8**2 + 0 * 8 + 1; the middle zero holds its place.
        self.assertEqual(change_base(65, 8), "101")

    def test_largest_allowed_base_with_multiple_digits(self):
        # 9 is the greatest integer base below 10, and 80 = 8 * 9 + 8.
        self.assertEqual(change_base(80, 9), "88")
