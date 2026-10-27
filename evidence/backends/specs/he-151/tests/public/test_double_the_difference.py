import unittest

from src.solution import double_the_difference


class TestDoubleTheDifference(unittest.TestCase):
    def test_example_mixed_odd_even_and_zero(self):
        self.assertEqual(double_the_difference([1, 3, 2, 0]), 10)

    def test_example_negative_numbers_and_zero(self):
        self.assertEqual(double_the_difference([-1, -2, 0]), 0)

    def test_example_positive_odd_and_negative_even(self):
        self.assertEqual(double_the_difference([9, -2]), 81)

    def test_example_zero_only(self):
        self.assertEqual(double_the_difference([0]), 0)

    def test_sums_squares_including_repeated_odd_numbers(self):
        # Each occurrence contributes: 3**2 + 3**2 + 5**2 = 43.
        self.assertEqual(double_the_difference([3, 3, 5]), 43)

    def test_smallest_positive_odd_integer(self):
        # The smallest eligible integer is 1, whose square is 1.
        self.assertEqual(double_the_difference([1]), 1)

    def test_positive_even_integers_contribute_nothing(self):
        # None of 2, 4, or 6 is odd, so the sum has no terms.
        self.assertEqual(double_the_difference([2, 4, 6]), 0)

    def test_negative_odd_integers_are_ignored(self):
        # Discard -7 and -3 before squaring; only 5**2 = 25 remains.
        self.assertEqual(double_the_difference([-7, -3, 5]), 25)

    def test_integers_around_zero(self):
        # -1 is negative and 0 is even; only 1**2 = 1 contributes.
        self.assertEqual(double_the_difference([-1, 0, 1]), 1)

    def test_fractional_numbers_are_ignored(self):
        # 1.5 and 3.5 are not integers; only 5**2 = 25 contributes.
        self.assertEqual(double_the_difference([1.5, 3.5, 5]), 25)

    def test_fractions_on_either_side_of_an_odd_integer(self):
        # Neither 0.999 nor 1.001 is an integer; only 1**2 = 1 remains.
        self.assertEqual(double_the_difference([0.999, 1, 1.001]), 1)

    def test_empty_list(self):
        self.assertEqual(double_the_difference([]), 0)
