import unittest

from src.solution import pairs_sum_to_zero


class TestPairsSumToZeroHidden(unittest.TestCase):
    # Covers test_empty_list's boundary; test_single_negative extends it below.
    def test_empty_input_has_no_pair(self):
        # There are no elements from which to choose two distinct elements.
        self.assertIs(pairs_sum_to_zero([]), False)

    # Extends test_example_positive_numbers_with_zero: zero comes first.
    def test_zero_before_only_positive_numbers(self):
        # One zero cannot pair with itself; every other value is positive.
        self.assertIs(pairs_sum_to_zero([0, 11, 29, 47, 83]), False)

    # Extends test_example_positive_numbers_with_zero: negatives surround zero.
    def test_one_zero_among_negative_numbers(self):
        # Each pair contains a negative number, so its sum is negative.
        self.assertIs(pairs_sum_to_zero([-21, -8, 0, -3, -55]), False)

    # Extends test_example_repeated_one_without_opposite: more duplicates.
    def test_many_repetitions_with_unmatched_signs(self):
        # Positive magnitudes {7, 19} and negative magnitudes {2, 13} differ.
        self.assertIs(pairs_sum_to_zero([7, -2, 7, -13, 19, -2, 7]), False)

    # Extends test_example_all_positive: unsorted and substantially longer.
    def test_long_positive_list(self):
        # Every pair of strictly positive integers has positive sum.
        self.assertIs(pairs_sum_to_zero(list(range(257, 0, -1))), False)

    # Extends test_example_contains_opposite_fives: the pair is at the ends.
    def test_pair_at_opposite_ends(self):
        # 37 + (-37) = 0.
        self.assertIs(pairs_sum_to_zero([37, 2, 11, -8, 16, -37]), True)

    # Extends test_example_contains_opposite_fives: the pair is not an extremum.
    def test_interior_pair_with_unmatched_extrema(self):
        # -23 + 23 = 0, although -100 and 200 do not cancel.
        self.assertIs(pairs_sum_to_zero([-100, 7, -23, 42, 23, 200]), True)

    # Extends test_example_single_positive: another value, beyond machine size.
    def test_single_large_positive(self):
        # A singleton supplies no two distinct elements.
        self.assertIs(pairs_sum_to_zero([10**120]), False)

    # Extends test_mixed_signs_with_opposite_pair: negative follows positive.
    def test_positive_before_its_opposite(self):
        # 41 + (-41) = 0; the total of the whole list is not zero.
        self.assertIs(pairs_sum_to_zero([41, -6, 13, -41, 9]), True)

    # Extends test_mixed_signs_with_opposite_pair: several possible pairs.
    def test_several_opposite_pairs(self):
        # Both 12 + (-12) and 31 + (-31) equal zero.
        self.assertIs(pairs_sum_to_zero([12, 31, -12, -31, 70]), True)

    # Extends test_two_elements_that_sum_to_zero: reverse order and new values.
    def test_positive_negative_two_element_pair(self):
        # 97 + (-97) = 0.
        self.assertIs(pairs_sum_to_zero([97, -97]), True)

    # Extends test_two_elements_that_sum_to_zero: signs alone do not suffice.
    def test_two_opposite_signs_without_zero_sum(self):
        # -17 + 18 = 1.
        self.assertIs(pairs_sum_to_zero([-17, 18]), False)

    # Extends test_all_negative_numbers: duplicates and a longer list.
    def test_long_negative_list_with_duplicates(self):
        # All values are strictly negative, including the repeated -1.
        self.assertIs(pairs_sum_to_zero([-1, -1] + list(range(-2, -130, -1))), False)

    # Extends test_empty_list and test_example_single_positive: one negative.
    def test_single_negative(self):
        # Like an empty list, a singleton has no pair of distinct elements.
        self.assertIs(pairs_sum_to_zero([-73]), False)

    # Extends test_single_zero_cannot_pair_with_itself: a distinct second zero.
    def test_two_zero_occurrences(self):
        # The two different list elements at indices 0 and 1 sum to zero.
        self.assertIs(pairs_sum_to_zero([0, 0]), True)

    # Covers test_single_zero_cannot_pair_with_itself's singleton boundary.
    def test_lone_zero_has_no_distinct_partner(self):
        # Index 0 cannot provide two distinct elements on its own.
        self.assertIs(pairs_sum_to_zero([0]), False)

    # Extends test_single_zero_cannot_pair_with_itself: an unmatched companion.
    def test_zero_and_one_nonzero_element(self):
        # The only pair has sum -29; the zero cannot be used twice.
        self.assertIs(pairs_sum_to_zero([-29, 0]), False)

    # Extends test_repeated_values_without_opposite: repeated negative values.
    def test_negative_duplicates_without_positive_opposite(self):
        # -14 + (-14) = -28 and -14 + 9 = -5.
        self.assertIs(pairs_sum_to_zero([-14, 9, -14]), False)

    # Extends test_repeated_values_without_opposite: a duplicated positive pair.
    def test_two_equal_positive_elements(self):
        # 32 + 32 = 64, so duplication alone is insufficient.
        self.assertIs(pairs_sum_to_zero([32, 32]), False)

    # Extends test_repeated_values_with_opposite: positive duplicates first.
    def test_positive_duplicates_with_negative_opposite(self):
        # Either occurrence of 22 can pair with -22.
        self.assertIs(pairs_sum_to_zero([22, 22, 5, -22]), True)

    # Extends test_repeated_values_with_opposite: both signs are duplicated.
    def test_duplicates_of_both_signs(self):
        # 64 + (-64) = 0 despite other repetitions.
        self.assertIs(pairs_sum_to_zero([9, -64, 9, 64, -64, 64]), True)

    # Extends test_example_positive_numbers_with_zero: separated zeros suffice.
    def test_separated_zero_occurrences(self):
        # The zeros at indices 1 and 5 are distinct elements summing to zero.
        self.assertIs(pairs_sum_to_zero([6, 0, -4, 15, -2, 0, 6]), True)

    # Extends test_single_zero_cannot_pair_with_itself: many zero occurrences.
    def test_many_zeros(self):
        # Any two of these 33 distinct positions provide a zero-sum pair.
        self.assertIs(pairs_sum_to_zero([0] * 33), True)

    # Extends test_mixed_signs_with_opposite_pair: three values cancel together.
    def test_zero_total_without_any_zero_sum_pair(self):
        # The three pair sums are -5, -4, and 9; only the triple sums to zero.
        self.assertIs(pairs_sum_to_zero([-9, 4, 5]), False)

    # Extends test_example_repeated_one_without_opposite: all values distinct.
    def test_many_mixed_signs_without_matching_magnitudes(self):
        # Negative magnitudes {2, 8, 20} miss positives {3, 7, 19, 31}.
        self.assertIs(pairs_sum_to_zero([-20, 3, -2, 19, -8, 7, 31]), False)

    # Extends test_example_contains_opposite_fives: adjacent pair at the start.
    def test_only_pair_in_first_two_positions(self):
        # -27 + 27 = 0; all later values are unmatched positive numbers.
        self.assertIs(pairs_sum_to_zero([-27, 27, 3, 8, 14, 62]), True)

    # Extends test_example_contains_opposite_fives: pair at the very end.
    def test_only_pair_in_last_two_positions(self):
        # 51 + (-51) = 0, after a prefix containing no pair.
        self.assertIs(pairs_sum_to_zero([2, 8, 19, 33, 51, -51]), True)

    # Extends test_mixed_signs_with_opposite_pair: search beyond a long prefix.
    def test_pair_after_many_unmatched_elements(self):
        # The final -399 cancels the earlier 399, and no other negative exists.
        self.assertIs(pairs_sum_to_zero(list(range(1, 401)) + [-399]), True)

    # Extends test_example_contains_opposite_fives: only the first value matches.
    def test_long_separated_pair(self):
        # -503 at the start pairs only with the final 503.
        self.assertIs(pairs_sum_to_zero([-503] + list(range(1, 401)) + [503]), True)

    # Extends test_two_elements_that_sum_to_zero: arbitrary precision integers.
    def test_pair_far_beyond_fixed_width_integer_range(self):
        # Exact integer opposites sum to zero at every magnitude.
        self.assertIs(pairs_sum_to_zero([10**200 + 37, -(10**200 + 37)]), True)

    # Extends test_two_elements_that_sum_to_zero: nearby large integers differ.
    def test_large_integers_that_only_approximately_cancel(self):
        # Their exact sum is 1, even though float conversion can lose that bit.
        self.assertIs(pairs_sum_to_zero([2**53 + 1, -(2**53)]), False)

    # Extends test_example_repeated_one_without_opposite: huge unmatched values.
    def test_huge_near_opposites_with_distractors(self):
        # Magnitudes 10**100 + 1 and 10**100 differ; 7 and 11 have no opposites.
        self.assertIs(pairs_sum_to_zero([-(10**100), 7, 10**100 + 1, 11]), False)

    # Extends test_all_negative_numbers: smallest nonzero magnitudes repeated.
    def test_two_equal_negative_elements(self):
        # -1 + (-1) = -2.
        self.assertIs(pairs_sum_to_zero([-1, -1]), False)

    # Extends test_example_positive_numbers_with_zero: one zero amid duplicates.
    def test_single_zero_among_repeated_nonzero_values(self):
        # Nonzero magnitudes 5 and 12 differ, and there is just one zero.
        self.assertIs(pairs_sum_to_zero([5, -12, 5, 0, -12, 5]), False)

    # Extends test_mixed_signs_with_opposite_pair: zero precedes a valid pair.
    def test_single_zero_does_not_hide_nonzero_pair(self):
        # 18 + (-18) = 0 regardless of the unmatched zero.
        self.assertIs(pairs_sum_to_zero([0, 18, 7, -18, 31]), True)

    # Extends test_example_all_positive: odd cardinality with a central pair.
    def test_nonadjacent_pair_in_odd_length_list(self):
        # 26 + (-26) = 0; no adjacent pair or endpoint pair cancels.
        self.assertIs(pairs_sum_to_zero([13, 26, 4, -26, 81]), True)
