import unittest

from src.solution import double_the_difference


class TestDoubleTheDifferencePrivate(unittest.TestCase):
    # Extends test_example_mixed_odd_even_and_zero with descending, larger values.
    def test_descending_mixed_integers(self):
        # 11**2 + 9**2 + 7**2 + 5**2 + 3**2 + 1**2 = 286.
        self.assertEqual(
            double_the_difference([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]),
            286,
        )

    # Extends test_example_negative_numbers_and_zero beyond -1 and -2.
    def test_negative_values_and_zero_only(self):
        # All nonzero entries are negative, so no entry contributes.
        self.assertEqual(double_the_difference([-999, -8, -5, -2, 0, -1]), 0)

    # Extends test_example_positive_odd_and_negative_even with other values/order.
    def test_positive_odd_between_negative_evens(self):
        # Only 13**2 = 169 contributes.
        self.assertEqual(double_the_difference([-14, 13, -22]), 169)

    # Extends test_example_zero_only with multiple zero entries.
    def test_repeated_zeros(self):
        # Every zero is even, so the sum is empty.
        self.assertEqual(double_the_difference([0, 0, 0, 0]), 0)

    # Extends test_sums_squares_including_repeated_odd_numbers with separated repeats.
    def test_separated_repeated_odds(self):
        # Three 7s, two 1s, and one 9 contribute 147 + 2 + 81 = 230.
        self.assertEqual(double_the_difference([7, 1, 7, 9, 1, 7]), 230)

    # Extends test_smallest_positive_odd_integer with repeated minimal entries.
    def test_repeated_ones(self):
        # Each of the five occurrences contributes 1.
        self.assertEqual(double_the_difference([1, 1, 1, 1, 1]), 5)

    # Extends test_positive_even_integers_contribute_nothing with larger evens.
    def test_unsorted_larger_positive_evens(self):
        # None of these positive integers is odd.
        self.assertEqual(double_the_difference([100, 8, 2, 1024, 18]), 0)

    # Extends test_negative_odd_integers_are_ignored with interleaved signs.
    def test_interleaved_negative_and_positive_odds(self):
        # Only 7**2 + 3**2 + 11**2 = 49 + 9 + 121 = 179 remain.
        self.assertEqual(double_the_difference([-101, 7, -9, 3, -1, 11]), 179)

    # Extends test_integers_around_zero across both parities and both signs.
    def test_both_sides_of_zero_in_scrambled_order(self):
        # Only 1 and 3 are nonnegative odd integers: 1 + 9 = 10.
        self.assertEqual(double_the_difference([-2, -1, 0, 1, 2, 3, -3]), 10)

    # Extends test_fractional_numbers_are_ignored with more values and signs.
    def test_mixed_fractional_values_and_integers(self):
        # All fractions are ignored, 4 is even, and 9**2 = 81 remains.
        self.assertEqual(double_the_difference([7.5, 2.5, 0.5, 9, 4, -3.5]), 81)

    # Extends test_fractions_on_either_side_of_an_odd_integer around 3 and 5.
    def test_fractional_neighbors_of_multiple_odds(self):
        # Neither rounding nor truncation is allowed: only 3**2 + 5**2 = 34.
        self.assertEqual(
            double_the_difference([2.999, 3, 3.001, 4.999, 5, 5.001]), 34
        )

    # Extends test_empty_list with empty inputs between nonempty calls.
    def test_empty_lists_between_nonempty_calls(self):
        # Each invocation has its own sum, including zero for an empty list.
        self.assertEqual(double_the_difference([5]), 25)
        self.assertEqual(double_the_difference([]), 0)
        self.assertEqual(double_the_difference([1]), 1)
        self.assertEqual(double_the_difference([]), 0)

    # Extends test_smallest_positive_odd_integer beyond machine float precision.
    def test_very_large_odd_integer(self):
        # (2**100 + 1)**2 expands exactly to 2**200 + 2**101 + 1.
        self.assertEqual(
            double_the_difference([2**100 + 1]), 2**200 + 2**101 + 1
        )

    # Extends test_positive_even_integers_contribute_nothing to a huge singleton.
    def test_very_large_even_integer(self):
        # A positive power of two is even, regardless of its magnitude.
        self.assertEqual(double_the_difference([2**100]), 0)

    # Extends test_fractional_numbers_are_ignored to a singleton near an odd value.
    def test_single_positive_fraction(self):
        # 11.25 is not an integer, even though truncating it would produce 11.
        self.assertEqual(double_the_difference([11.25]), 0)

    # Extends test_example_negative_numbers_and_zero to negative fractions only.
    def test_negative_fractions_only(self):
        # Every entry is both negative and nonintegral.
        self.assertEqual(double_the_difference([-0.5, -1.5, -2.5, -7.75]), 0)

    # Extends test_integers_around_zero with fractional values around zero.
    def test_zero_with_fractional_neighbors(self):
        # Fractions are ignored, and the only integer, zero, is even.
        self.assertEqual(double_the_difference([-0.125, 0, 0.125, 0.75]), 0)

    # Extends test_example_mixed_odd_even_and_zero to a longer consecutive list.
    def test_long_consecutive_integer_list(self):
        # Eligible values are 1, 3, ..., 99. The first n odd squares sum to
        # n * (4*n*n - 1) / 3, giving 50 * 9999 / 3 = 166650.
        self.assertEqual(double_the_difference(list(range(-50, 101))), 166650)

    # Extends test_sums_squares_including_repeated_odd_numbers to hundreds of entries.
    def test_many_repeats_with_ineligible_blocks(self):
        # Exactly the 200 copies of 5 contribute: 200 * 25 = 5000.
        values = [5] * 200 + [2] * 100 + [-3] * 100 + [1.5] * 100
        self.assertEqual(double_the_difference(values), 5000)

    # Extends test_fractions_on_either_side_of_an_odd_integer without any integers.
    def test_only_fractions_near_small_integers(self):
        # Every value has a nonzero fractional part; the sum has no terms.
        self.assertEqual(
            double_the_difference([0.1, 0.9, 1.1, 1.9, 2.1, 2.9, 3.1, 3.9]),
            0,
        )

    # Extends test_example_positive_odd_and_negative_even with a late eligible entry.
    def test_only_last_entry_contributes(self):
        # Skip every preceding entry; the final 17 contributes 17**2 = 289.
        self.assertEqual(double_the_difference([2, 4, -7, 2.5, 0, 17]), 289)

    # Extends test_sums_squares_including_repeated_odd_numbers with similar exclusions.
    def test_duplicates_among_negative_and_fractional_lookalikes(self):
        # Only the three positive integer 11s contribute: 3 * 121 = 363.
        self.assertEqual(
            double_the_difference([11, -11, 11.5, 11, 10, -10, 11.25, 0, 11]),
            363,
        )
