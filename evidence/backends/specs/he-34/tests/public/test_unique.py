import unittest

from src.solution import unique


class TestUnique(unittest.TestCase):
    def test_docstring_example(self):
        self.assertEqual(
            unique([5, 3, 5, 2, 3, 3, 9, 0, 123]),
            [0, 2, 3, 5, 9, 123],
        )

    def test_sorts_distinct_elements(self):
        # All values are distinct; their ascending order is -8, -2, 0, 4, 11.
        self.assertEqual(unique([4, -2, 11, 0, -8]), [-8, -2, 0, 4, 11])

    def test_already_sorted_distinct_elements(self):
        # These elements are already sorted and each occurs once.
        self.assertEqual(unique([-3, 0, 2, 7]), [-3, 0, 2, 7])

    def test_removes_repeated_elements(self):
        # Keeping one copy of each value in this sorted input gives -2, 0, 5.
        self.assertEqual(unique([-2, -2, 0, 0, 0, 5, 5]), [-2, 0, 5])

    def test_all_elements_equal(self):
        # There is only one distinct value, so exactly one copy remains.
        self.assertEqual(unique([6, 6, 6, 6]), [6])

    def test_empty_list(self):
        # An empty input has no elements to retain or sort.
        self.assertEqual(unique([]), [])

    def test_single_element(self):
        # A single element is already sorted and has no duplicates.
        self.assertEqual(unique([9]), [9])
