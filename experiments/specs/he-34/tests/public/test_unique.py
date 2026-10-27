import unittest

from src.solution import unique


class TestUnique(unittest.TestCase):
    # Docstring example.
    def test_docstring_example(self):
        self.assertEqual(unique([5, 3, 5, 2, 3, 3, 9, 0, 123]), [0, 2, 3, 5, 9, 123])

    # Rule: duplicates are removed, each value appears once.
    # Typical: several values repeated; distinct values are {1, 2, 4}, sorted -> [1, 2, 4].
    def test_duplicates_removed_typical(self):
        self.assertEqual(unique([4, 1, 4, 2, 1, 4]), [1, 2, 4])

    # Boundary: every element is the same; one distinct value -> [7].
    def test_duplicates_removed_all_equal(self):
        self.assertEqual(unique([7, 7, 7, 7]), [7])

    # Rule: the result is sorted ascending.
    # Typical: distinct values in reverse order, no duplicates -> same values ascending.
    def test_sorted_typical(self):
        self.assertEqual(unique([9, 6, 3, 1]), [1, 3, 6, 9])

    # Boundary: negatives and zero sort below positives: {-3, -1, 0, 2} -> [-3, -1, 0, 2].
    def test_sorted_with_negatives(self):
        self.assertEqual(unique([0, -1, 2, -3, -1]), [-3, -1, 0, 2])

    # Boundary: an empty list has no elements, so no unique elements -> [].
    def test_empty_list(self):
        self.assertEqual(unique([]), [])

    # Boundary: a single element is already unique and sorted -> [42].
    def test_single_element(self):
        self.assertEqual(unique([42]), [42])


if __name__ == "__main__":
    unittest.main()
