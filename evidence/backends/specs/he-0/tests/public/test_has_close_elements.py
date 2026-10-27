import unittest

from src.solution import has_close_elements


class TestHasCloseElements(unittest.TestCase):
    def test_docstring_example_false(self):
        self.assertEqual(has_close_elements([1.0, 2.0, 3.0], 0.5), False)

    def test_docstring_example_true(self):
        self.assertEqual(
            has_close_elements([1.0, 2.8, 3.0, 4.0, 5.0, 2.0], 0.3), True
        )

    def test_two_elements_within_threshold(self):
        # The only pair has distance 0.25, which is less than 0.5.
        self.assertEqual(has_close_elements([1.0, 1.25], 0.5), True)

    def test_two_elements_outside_threshold(self):
        # The only pair has distance 2.0, which exceeds 0.5.
        self.assertEqual(has_close_elements([1.0, 3.0], 0.5), False)

    def test_distance_equal_to_threshold(self):
        # Distance 0.5 equals the threshold, so it is not strictly closer.
        self.assertEqual(has_close_elements([1.0, 1.5], 0.5), False)

    def test_duplicate_values_with_positive_threshold(self):
        # Two different entries have distance 0.0, which is less than 0.25.
        self.assertEqual(has_close_elements([2.0, 2.0], 0.25), True)

    def test_zero_threshold_with_duplicates(self):
        # Even distance 0.0 is not strictly less than a threshold of 0.0.
        self.assertEqual(has_close_elements([2.0, 2.0], 0.0), False)

    def test_empty_list(self):
        # An empty list contains no pair of entries.
        self.assertEqual(has_close_elements([], 1.0), False)

    def test_single_element(self):
        # One entry cannot supply the two entries required for a pair.
        self.assertEqual(has_close_elements([3.0], 1.0), False)

    def test_close_pair_is_nonadjacent_in_unsorted_list(self):
        # Only 8.0 and 8.25 are within 0.5; they are not adjacent in the list.
        self.assertEqual(has_close_elements([8.0, 1.0, 8.25, 4.0], 0.5), True)

    def test_close_negative_values(self):
        # The distance between -3.0 and -3.25 is 0.25, less than 0.5.
        self.assertEqual(has_close_elements([-3.0, -3.25, -7.0], 0.5), True)

    def test_values_on_opposite_sides_of_zero(self):
        # The distance from -0.25 to 0.25 is 0.5, greater than 0.375.
        self.assertEqual(has_close_elements([-0.25, 0.25], 0.375), False)


if __name__ == "__main__":
    unittest.main()
