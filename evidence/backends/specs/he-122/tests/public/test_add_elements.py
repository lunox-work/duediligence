import unittest

from src.solution import add_elements


class TestAddElements(unittest.TestCase):
    def test_docstring_example(self):
        self.assertEqual(add_elements([111, 21, 3, 4000, 5, 6, 7, 8, 9], 4), 24)

    def test_sums_one_and_two_digit_elements(self):
        # All three values qualify: 4 + 12 + 35 = 51.
        self.assertEqual(add_elements([4, 12, 35], 3), 51)

    def test_positive_digit_boundaries(self):
        # 9, 10, and 99 qualify; 100 and 101 do not: 9 + 10 + 99 = 118.
        self.assertEqual(add_elements([9, 10, 99, 100, 101], 5), 118)

    def test_negative_values_and_digit_boundary(self):
        # A minus sign is not a digit; -100 and -1000 have too many digits.
        # The qualifying sum is -5 - 21 - 99 = -125.
        self.assertEqual(add_elements([-5, -21, -99, -100, -1000], 5), -125)

    def test_zero(self):
        # Zero has one digit, and its sum is zero.
        self.assertEqual(add_elements([0], 1), 0)

    def test_signed_values_can_cancel(self):
        # Every value qualifies: -20 + 5 + 16 = 1.
        self.assertEqual(add_elements([-20, 5, 16], 3), 1)

    def test_ignores_qualifying_values_after_prefix(self):
        # Only the first two entries count: 10 + 20 = 30.
        self.assertEqual(add_elements([10, 20, 90, 8], 2), 30)

    def test_large_values_still_take_up_prefix_positions(self):
        # The first four entries contribute only 3 + 7 = 10; 12 is outside.
        self.assertEqual(add_elements([100, 3, 1000, 7, 12], 4), 10)

    def test_k_one_in_longer_array(self):
        # With k = 1, only the first value, 42, contributes.
        self.assertEqual(add_elements([42, 9, 10], 1), 42)

    def test_minimum_array_length(self):
        # The sole element has one digit, so its sum is 7.
        self.assertEqual(add_elements([7], 1), 7)

    def test_no_qualifying_elements(self):
        # Every element has at least three digits; the empty sum is zero.
        self.assertEqual(add_elements([100, 111, 4000], 3), 0)

    def test_maximum_array_length_and_full_prefix(self):
        # All 100 entries qualify, and k includes them all: 100 * 1 = 100.
        self.assertEqual(add_elements([1] * 100, 100), 100)
