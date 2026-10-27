import unittest

from src.solution import filter_integers


class TestFilterIntegers(unittest.TestCase):
    def test_docstring_example_mixed_scalars(self):
        self.assertEqual(filter_integers(['a', 3.14, 5]), [5])

    def test_docstring_example_with_containers(self):
        self.assertEqual(
            filter_integers([1, 2, 3, 'abc', {}, []]), [1, 2, 3]
        )

    def test_retains_positive_negative_and_zero_integers(self):
        # Every element is an integer, so filtering retains the whole list.
        self.assertEqual(filter_integers([8, -4, 0]), [8, -4, 0])

    def test_single_integer(self):
        # The sole element is an integer, so it is retained.
        self.assertEqual(filter_integers([0]), [0])

    def test_removes_non_integer_types(self):
        # None of these values is an integer; nested integers are containers.
        values = ['12', None, 2.5, 3 + 0j, b'4', [5], (6,), {7}, {'x': 8}]
        self.assertEqual(filter_integers(values), [])

    def test_integer_valued_floats_are_removed(self):
        # These numbers have type float even though their values are integral.
        self.assertEqual(filter_integers([0.0, -2.0, 7.0]), [])

    def test_empty_list(self):
        # An empty input contains no integers to retain.
        self.assertEqual(filter_integers([]), [])

    def test_preserves_integer_order(self):
        # Removing the string, float, and None leaves 9, -2, 4 in that order.
        self.assertEqual(
            filter_integers(['start', 9, 1.5, -2, None, 4]), [9, -2, 4]
        )

    def test_preserves_repeated_integers(self):
        # Filtering removes only the string; each occurrence of 3 remains.
        self.assertEqual(filter_integers([3, '3', 3, 3]), [3, 3, 3])
