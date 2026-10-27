import unittest

from src.solution import add_elements


class TestAddElementsPrivate(unittest.TestCase):
    # Extends test_docstring_example: a longer prefix includes a negative term.
    def test_mixed_prefix_with_negative_term(self):
        # Only 14, -6, and 82 qualify: 14 - 6 + 82 = 90.
        self.assertEqual(add_elements([809, 14, -6, 10000, 82, 5], 5), 90)

    # Extends test_docstring_example: move qualifying entries to other positions.
    def test_reordered_mixed_prefix(self):
        # The first four contribute 82 - 6 + 14 = 90; the final 5 is outside.
        self.assertEqual(add_elements([82, 10000, -6, 14, 809, 5], 4), 90)

    # Extends test_sums_one_and_two_digit_elements: the sum may exceed two digits.
    def test_qualifying_values_sum_above_ninety_nine(self):
        # 8 + 18 + 28 + 38 + 48 = 140; digit limits apply to each element.
        self.assertEqual(add_elements([8, 18, 28, 38, 48], 5), 140)

    # Extends test_sums_one_and_two_digit_elements: duplicates count separately.
    def test_duplicate_positive_and_negative_values(self):
        # Three copies of 17 and two copies of -8 contribute 51 - 16 = 35.
        self.assertEqual(add_elements([17, 17, 17, -8, -8], 5), 35)

    # Extends test_positive_digit_boundaries: boundary values in a different order.
    def test_positive_boundary_neighbors_reordered(self):
        # 98 + 99 + 9 + 10 = 216; 100 and 101 are excluded.
        self.assertEqual(add_elements([98, 99, 100, 101, 9, 10], 6), 216)

    # Extends test_positive_digit_boundaries: exclude every larger digit length.
    def test_positive_powers_of_ten_and_three_digit_values(self):
        # Every entry has at least three digits, so the sum is zero.
        self.assertEqual(add_elements([100, 999, 1000, 10000, 100000], 5), 0)

    # Extends test_negative_values_and_digit_boundary: both negative boundaries.
    def test_negative_boundary_neighbors(self):
        # -9 - 10 - 98 - 99 = -216; -100 and -101 are excluded.
        self.assertEqual(add_elements([-9, -10, -98, -99, -100, -101], 6), -216)

    # Extends test_negative_values_and_digit_boundary: a two-digit negative alone.
    def test_single_negative_ninety_nine(self):
        # The sign is not a digit, so the sole contribution is -99.
        self.assertEqual(add_elements([-99], 1), -99)

    # Extends test_zero: repeated zeros coexist with included and excluded values.
    def test_zeros_among_other_values(self):
        # The three zeros and 7 qualify; neither 100 nor -100 qualifies.
        self.assertEqual(add_elements([0, 0, 100, -100, 7, 0], 6), 7)

    # Extends test_zero: zero still occupies one of the k prefix positions.
    def test_zero_at_only_included_position(self):
        # Only the leading zero is in the prefix; 43 and -99 are outside.
        self.assertEqual(add_elements([0, 43, -99], 1), 0)

    # Extends test_signed_values_can_cancel: several terms cancel exactly.
    def test_signed_values_cancel_to_zero(self):
        # -99 + 98 - 10 + 9 + 2 = 0, with every element qualifying.
        self.assertEqual(add_elements([-99, 98, -10, 9, 2], 5), 0)

    # Extends test_signed_values_can_cancel: the final sum can remain negative.
    def test_mixed_sign_sum_is_negative(self):
        # -90 + 4 + 5 = -81.
        self.assertEqual(add_elements([-90, 4, 5], 3), -81)

    # Extends test_ignores_qualifying_values_after_prefix: signed prefix and suffix.
    def test_signed_suffix_is_excluded(self):
        # Only 11 - 4 = 7 contributes, regardless of the three later values.
        self.assertEqual(add_elements([11, -4, 99, -99, 8], 2), 7)

    # Extends test_ignores_qualifying_values_after_prefix: exact end of the prefix.
    def test_last_prefix_value_counts_but_next_value_does_not(self):
        # Including the second entry gives 99 - 99 = 0; the third 99 is outside.
        self.assertEqual(add_elements([99, -99, 99], 2), 0)

    # Extends test_large_values_still_take_up_prefix_positions: negative exclusions.
    def test_rejected_signed_values_consume_positions(self):
        # The first four contribute -7 + 11 = 4; 77 is outside the prefix.
        self.assertEqual(add_elements([1234, -7, -100, 11, 77], 4), 4)

    # Extends test_large_values_still_take_up_prefix_positions: no prefix survivors.
    def test_all_prefix_positions_rejected_before_small_suffix(self):
        # All three prefix entries have at least three digits; later 5 is ignored.
        self.assertEqual(add_elements([100, -100, 1000, 5], 3), 0)

    # Extends test_k_one_in_longer_array: the first entry does not qualify.
    def test_k_one_rejects_first_value(self):
        # 100 is excluded, and neither later qualifying entry is in the prefix.
        self.assertEqual(add_elements([100, 4, -9], 1), 0)

    # Extends test_k_one_in_longer_array: the first qualifying entry is negative.
    def test_k_one_keeps_negative_first_value(self):
        # Only -73 contributes; the two later 99s are outside the prefix.
        self.assertEqual(add_elements([-73, 99, 99], 1), -73)

    # Extends test_minimum_array_length: the positive two-digit endpoint.
    def test_single_positive_ninety_nine(self):
        # A two-digit singleton contributes its own value.
        self.assertEqual(add_elements([99], 1), 99)

    # Extends test_minimum_array_length: a negative one-digit singleton.
    def test_single_negative_one(self):
        # The sole integer has one digit and contributes -1.
        self.assertEqual(add_elements([-1], 1), -1)

    # Extends test_minimum_array_length: the sole entry can be excluded.
    def test_single_positive_one_hundred(self):
        # 100 has three digits, leaving an empty qualifying sum.
        self.assertEqual(add_elements([100], 1), 0)

    # Extends test_minimum_array_length: the negative exclusion boundary.
    def test_single_negative_one_hundred(self):
        # -100 has three digits, leaving an empty qualifying sum.
        self.assertEqual(add_elements([-100], 1), 0)

    # Extends test_no_qualifying_elements: all excluded values are negative.
    def test_only_large_negative_values(self):
        # Each magnitude has at least three digits, so none contributes.
        self.assertEqual(add_elements([-100, -999, -1000], 3), 0)

    # Extends test_no_qualifying_elements: integers have no stated magnitude limit.
    def test_very_large_signed_integers_are_excluded(self):
        # All four magnitudes have far more than two digits.
        values = [10**60, -(10**60), 10**60 + 73, -(10**60 + 17)]
        self.assertEqual(add_elements(values, 4), 0)

    # Extends test_docstring_example: huge signed values interleaved with survivors.
    def test_small_values_between_very_large_integers(self):
        # Only 31 - 12 - 99 contributes, giving -80.
        values = [10**60, 31, -(10**60), -12, 10**60 + 9, -99]
        self.assertEqual(add_elements(values, 6), -80)

    # Extends test_maximum_array_length_and_full_prefix: larger repeated addends.
    def test_maximum_length_repeated_positive_boundary(self):
        # All 100 copies qualify: 100 * 99 = 9900.
        self.assertEqual(add_elements([99] * 100, 100), 9900)

    # Extends test_maximum_array_length_and_full_prefix: negative repeated addends.
    def test_maximum_length_repeated_negative_boundary(self):
        # All 100 copies qualify: 100 * -99 = -9900.
        self.assertEqual(add_elements([-99] * 100, 100), -9900)

    # Extends test_maximum_array_length_and_full_prefix: mixed eligibility and signs.
    def test_maximum_length_mixed_pattern(self):
        # Each five-entry block contributes 99 - 98 + 0 = 1; 20 blocks give 20.
        self.assertEqual(add_elements([99, -98, 100, -100, 0] * 20, 100), 20)

    # Extends test_maximum_array_length_and_full_prefix: only the last entry counts.
    def test_maximum_length_last_position_is_included(self):
        # The first 99 entries are excluded; position 100 contributes -99.
        self.assertEqual(add_elements([100] * 99 + [-99], 100), -99)

    # Extends test_maximum_array_length_and_full_prefix: k just below its maximum.
    def test_maximum_length_prefix_ends_before_last_position(self):
        # Positions 1 through 98 are excluded; position 99 gives 23, not 23 + 77.
        self.assertEqual(add_elements([100] * 98 + [23, 77], 99), 23)
