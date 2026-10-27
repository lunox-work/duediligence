import unittest

from src.solution import common


class TestCommon(unittest.TestCase):
    def test_first_docstring_example(self):
        self.assertEqual(
            common([1, 4, 3, 34, 653, 2, 5], [5, 7, 1, 5, 9, 653, 121]),
            [1, 5, 653],
        )

    def test_second_docstring_example(self):
        self.assertEqual(common([5, 3, 2, 8], [3, 2]), [2, 3])

    def test_partial_overlap_excludes_elements_present_in_only_one_list(self):
        # Only 4 and 7 occur in both lists; their sorted order is [4, 7].
        self.assertEqual(common([9, 4, 7, 1], [7, 2, 4, 8]), [4, 7])

    def test_disjoint_lists(self):
        # No value occurs in both lists, so there are no common elements.
        self.assertEqual(common([1, 3, 5], [2, 4, 6]), [])

    def test_common_elements_are_sorted_numerically(self):
        # Shared values 10, -5, 0, and 2 sort numerically to [-5, 0, 2, 10].
        self.assertEqual(common([10, -5, 0, 2, 99], [2, 10, -5, 0, 8]),
                         [-5, 0, 2, 10])

    def test_single_common_element(self):
        # Only 4 is shared; a one-element result is already sorted and unique.
        self.assertEqual(common([9, -3, 4], [7, 4, 6]), [4])

    def test_duplicates_in_both_lists_are_removed(self):
        # Shared values are 1, 2, and 3; repeated occurrences add no elements.
        self.assertEqual(common([3, 1, 3, 2, 1, 5], [2, 3, 3, 1, 1, 8]),
                         [1, 2, 3])

    def test_lists_containing_only_one_repeated_value(self):
        # Every occurrence represents the same shared value, 6, included once.
        self.assertEqual(common([6, 6, 6], [6, 6]), [6])

    def test_empty_first_list(self):
        # An empty first list has no elements to share with the second list.
        self.assertEqual(common([], [3, 1, 3]), [])

    def test_empty_second_list(self):
        # An empty second list has no elements to share with the first list.
        self.assertEqual(common([3, 1, 3], []), [])

    def test_both_lists_empty(self):
        # Neither list contains an element, so their common result is empty.
        self.assertEqual(common([], []), [])
