import unittest

from src.solution import sort_numbers


class TestSortNumbers(unittest.TestCase):
    def test_docstring_example(self):
        self.assertEqual(sort_numbers("three one five"), "one three five")

    def test_all_valid_words_in_reverse_order(self):
        # The words represent 9 down to 0; ascending order is 0 through 9.
        self.assertEqual(
            sort_numbers("nine eight seven six five four three two one zero"),
            "zero one two three four five six seven eight nine",
        )

    def test_numeric_order_for_mixed_words(self):
        # These values are 8, 4, 2, 7, 6; numerically, 2 < 4 < 6 < 7 < 8.
        self.assertEqual(
            sort_numbers("eight four two seven six"),
            "two four six seven eight",
        )

    def test_single_zero(self):
        # A one-element sequence containing the smallest valid value stays as is.
        self.assertEqual(sort_numbers("zero"), "zero")

    def test_single_nine(self):
        # A one-element sequence containing the largest valid value stays as is.
        self.assertEqual(sort_numbers("nine"), "nine")

    def test_repeated_values_are_preserved(self):
        # Sorting 5, 1, 5, 0, 1 gives 0, 1, 1, 5, 5, retaining each occurrence.
        self.assertEqual(
            sort_numbers("five one five zero one"),
            "zero one one five five",
        )

    def test_all_values_equal(self):
        # All three entries represent 4, so sorting leaves all three in place.
        self.assertEqual(sort_numbers("four four four"), "four four four")

    def test_already_sorted_values(self):
        # The values 1, 3, 6, 9 are already increasing, so the output is unchanged.
        self.assertEqual(
            sort_numbers("one three six nine"),
            "one three six nine",
        )
