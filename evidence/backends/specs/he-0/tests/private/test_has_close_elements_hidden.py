import unittest

from src.solution import has_close_elements


class TestHasCloseElementsHidden(unittest.TestCase):
    # Extends test_empty_list: zero still cannot create a pair.
    def test_empty_zero_threshold(self):
        self.assertEqual(has_close_elements([], 0.0), False)

    # Extends test_empty_list: a negative threshold also has no qualifying pair.
    def test_empty_negative_threshold(self):
        self.assertEqual(has_close_elements([], -8.0), False)

    # Extends test_single_element: even an enormous threshold cannot use self-pairs.
    def test_single_zero_enormous_threshold(self):
        self.assertEqual(has_close_elements([0.0], 1e100), False)

    # Extends test_single_element: a negative value is still only one entry.
    def test_single_negative_value(self):
        self.assertEqual(has_close_elements([-1e9], 2e9), False)

    # Extends test_two_elements_within_threshold: descending order, new values.
    def test_descending_close_pair(self):
        # Distance 0.25 < 0.5.
        self.assertEqual(has_close_elements([4.75, 4.5], 0.5), True)

    # Extends test_two_elements_outside_threshold: a negative signed difference
    # must not be mistaken for a small distance; the distance is 16.
    def test_descending_distant_pair(self):
        self.assertEqual(has_close_elements([7.0, -9.0], 0.5), False)

    # Extends test_distance_equal_to_threshold: equality across zero.
    def test_opposite_signs_equal_threshold(self):
        # Distance 8 equals the threshold.
        self.assertEqual(has_close_elements([-4.0, 4.0], 8.0), False)

    # Extends test_distance_equal_to_threshold: several tied minimum distances.
    def test_many_equal_minimum_distances(self):
        # Sorted values are 0, 2, 4, 6; every distance is at least 2.
        self.assertEqual(has_close_elements([6.0, 0.0, 4.0, 2.0], 2.0), False)

    # Extends test_two_elements_within_threshold: no tolerance at the boundary.
    def test_distance_just_below_threshold(self):
        # Both operands and their difference are exact binary fractions.
        self.assertEqual(has_close_elements([0.0, 1.0 - 2.0**-40], 1.0), True)

    # Extends test_two_elements_outside_threshold: no tolerance above the boundary.
    def test_distance_just_above_threshold(self):
        # Distance is exactly 1 + 2**-40, greater than 1.
        self.assertEqual(has_close_elements([0.0, 1.0 + 2.0**-40], 1.0), False)

    # Extends test_duplicate_values_with_positive_threshold: duplicates separated
    # by unrelated entries must not be discarded or checked only adjacently.
    def test_separated_duplicates(self):
        # Two entries equal 5, hence their distance is zero.
        self.assertEqual(has_close_elements([5.0, -8.0, 12.0, 5.0], 2.0**-10), True)

    # Extends test_duplicate_values_with_positive_threshold: many negative copies.
    def test_many_identical_negative_values(self):
        # Any two distinct entries have distance zero < 0.125.
        self.assertEqual(has_close_elements([-7.0] * 16, 0.125), True)

    # Extends test_zero_threshold_with_duplicates: multiple separated duplicates.
    def test_zero_threshold_multiple_duplicate_groups(self):
        # All distances are nonnegative, including duplicate distances of zero.
        self.assertEqual(has_close_elements([4.0, -2.0, 4.0, -2.0], 0.0), False)

    # Extends test_zero_threshold_with_duplicates: distinct values around zero.
    def test_zero_threshold_distinct_values(self):
        # No nonnegative distance is strictly below zero.
        self.assertEqual(has_close_elements([0.0, -1.0, 1.0], 0.0), False)

    # Extends test_zero_threshold_with_duplicates: a negative threshold also
    # excludes duplicates; zero is not less than -0.5.
    def test_negative_threshold_with_duplicates(self):
        self.assertEqual(has_close_elements([-2.0, -2.0, 3.0], -0.5), False)

    # Extends test_two_elements_outside_threshold: do not take abs(threshold).
    def test_negative_threshold_distinct_pair(self):
        # Distance 200 is not less than -1000.
        self.assertEqual(has_close_elements([100.0, -100.0], -1000.0), False)

    # Extends test_docstring_example_false: longer, descending, mixed signs.
    def test_descending_widely_spaced_values(self):
        # Minimum distance is 8, greater than 0.125.
        self.assertEqual(has_close_elements([24.0, 16.0, 8.0, 0.0, -8.0], 0.125), False)

    # Extends test_docstring_example_false: a value near zero does not imply
    # that two entries are close; the minimum pair distance exceeds 31.
    def test_small_value_without_close_neighbor(self):
        self.assertEqual(has_close_elements([2.0**-9, 32.0, 64.0], 0.125), False)

    # Extends test_docstring_example_true: only the final pair qualifies.
    def test_only_final_pair_is_close(self):
        # The last two entries differ by 0.125; all other distances exceed 0.25.
        self.assertEqual(has_close_elements([32.0, 0.0, 16.0, 8.0, 8.125], 0.25), True)

    # Extends test_close_pair_is_nonadjacent_in_unsorted_list: the qualifying
    # entries are interior, separated, negative, and far from the first entry.
    def test_only_interior_nonadjacent_pair_is_close(self):
        # -8 and -7.875 differ by 0.125; all other distances exceed 0.25.
        self.assertEqual(
            has_close_elements([64.0, -8.0, 13.0, 32.0, -7.875, 1.0], 0.25), True
        )

    # Extends test_close_pair_is_nonadjacent_in_unsorted_list: first and last
    # entries are the only qualifying pair, in descending order.
    def test_only_first_and_last_entries_are_close(self):
        # 8.125 and 8 differ by 0.125; other distances exceed 0.25.
        self.assertEqual(has_close_elements([8.125, 40.0, -10.0, 8.0], 0.25), True)

    # Extends test_close_negative_values: fractions close to zero, unsorted.
    def test_close_negative_fractions(self):
        # -0.0625 and -0.125 differ by 0.0625 < 0.125.
        self.assertEqual(has_close_elements([-0.0625, -4.0, -0.125], 0.125), True)

    # Extends test_close_negative_values: negative values can all be far apart.
    def test_all_negative_values_distant(self):
        # Sorted neighboring distances are both 4.
        self.assertEqual(has_close_elements([-9.0, -1.0, -5.0], 0.5), False)

    # Extends test_values_on_opposite_sides_of_zero: a crossing pair can qualify.
    def test_close_pair_crossing_zero(self):
        # Distance is 0.125 + 0.0625 = 0.1875 < 0.25.
        self.assertEqual(has_close_elements([-0.125, 0.0625], 0.25), True)

    # Extends test_values_on_opposite_sides_of_zero: equal magnitudes must not
    # be compared by subtracting their absolute values; distance is 24.
    def test_equal_magnitudes_opposite_signs(self):
        self.assertEqual(has_close_elements([-12.0, 12.0], 0.5), False)

    # Extends test_two_elements_within_threshold: small positive thresholds
    # must not be rounded to zero or replaced with a fixed tolerance.
    def test_tiny_positive_distance(self):
        # Distance 2**-500 < 2**-499, both exactly representable.
        self.assertEqual(has_close_elements([0.0, 2.0**-500], 2.0**-499), True)

    # Extends test_distance_equal_to_threshold: equality at a tiny scale.
    def test_tiny_distance_equal_threshold(self):
        # Distance is exactly the threshold, 2**-500.
        self.assertEqual(has_close_elements([0.0, 2.0**-500], 2.0**-500), False)

    # Extends test_two_elements_within_threshold: the smallest positive binary
    # float is still a positive distance, below twice that value.
    def test_subnormal_distance(self):
        self.assertEqual(has_close_elements([0.0, 2.0**-1074], 2.0**-1073), True)

    # Extends test_duplicate_values_with_positive_threshold: signed zeros are
    # equal numbers, so two entries have zero distance.
    def test_signed_zero_duplicate(self):
        self.assertEqual(has_close_elements([-0.0, 0.0], 2.0**-500), True)

    # Extends test_docstring_example_true: a close pair at a large magnitude.
    def test_large_magnitude_close_pair(self):
        # At 2**50, 0.25 is representable; the two positive entries differ by
        # exactly 0.25, while the negative entry is far away.
        base = float(2**50)
        self.assertEqual(has_close_elements([-base, base, base + 0.25], 0.5), True)

    # Extends test_two_elements_outside_threshold: finite inputs whose distance
    # exceeds the largest finite float must still be classified as far apart.
    def test_very_large_opposite_values(self):
        # Mathematical distance 2e308 exceeds threshold 1e308.
        self.assertEqual(has_close_elements([1e308, -1e308], 1e308), False)

    # Extends test_two_elements_within_threshold: a large threshold and distance.
    def test_large_threshold(self):
        # Distance 2**501 < 2**502; all input floats are finite and exact.
        self.assertEqual(has_close_elements([-2.0**500, 2.0**500], 2.0**502), True)

    # Extends test_docstring_example_true: several equally close pairs.
    def test_tied_minimum_distances_below_threshold(self):
        # Sorted neighboring distances are all 4, less than 4.5.
        self.assertEqual(has_close_elements([12.0, 4.0, 8.0, 0.0], 4.5), True)

    # Extends test_docstring_example_false: many unsorted, distinct values.
    def test_many_values_without_close_pair(self):
        # Multiplication by 73 modulo prime 257 permutes 0..256. Distinct
        # multiples of 4 have distances at least 4, exceeding threshold 2.
        numbers = [float(4 * ((index * 73) % 257)) for index in range(257)]
        self.assertEqual(has_close_elements(numbers, 2.0), False)

    # Extends test_close_pair_is_nonadjacent_in_unsorted_list: a large list with
    # just one qualifying pair involving the last entry.
    def test_many_values_with_one_close_pair(self):
        # The first 257 entries permute multiples of 4 from 0 through 1024.
        # Appending 1024.5 creates exactly one distance below 0.75: 0.5.
        numbers = [float(4 * ((index * 73) % 257)) for index in range(257)]
        numbers.append(1024.5)
        self.assertEqual(has_close_elements(numbers, 0.75), True)


if __name__ == "__main__":
    unittest.main()
