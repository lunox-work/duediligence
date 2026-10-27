import unittest

from src.solution import filter_integers


class TestFilterIntegers(unittest.TestCase):
    # Docstring examples.

    def test_docstring_example_string_float_int(self):
        self.assertEqual(filter_integers(['a', 3.14, 5]), [5])

    def test_docstring_example_ints_with_containers(self):
        self.assertEqual(filter_integers([1, 2, 3, 'abc', {}, []]), [1, 2, 3])

    # Rule: keep only the integers, in their original order.

    def test_mixed_values_keep_integers_in_order(self):
        # By hand: the ints in the input, read left to right, are 7, -2, 0, 42.
        # Filtering drops every other element and does not reorder.
        values = [7, 'x', -2, 1.5, None, 0, (1,), 42]
        self.assertEqual(filter_integers(values), [7, -2, 0, 42])

    def test_repeated_integers_are_all_kept(self):
        # By hand: filtering keeps each matching element, so both 4s stay.
        self.assertEqual(filter_integers([4, 'a', 4]), [4, 4])

    # Boundary cases.

    def test_empty_list(self):
        # By hand: nothing to keep from an empty list.
        self.assertEqual(filter_integers([]), [])

    def test_no_integers(self):
        # By hand: none of a str, a float, None, a dict, a list is an int.
        self.assertEqual(filter_integers(['1', 2.5, None, {}, []]), [])

    def test_all_integers(self):
        # By hand: every element is an int, so nothing is dropped.
        self.assertEqual(filter_integers([0, -1, 10]), [0, -1, 10])


if __name__ == '__main__':
    unittest.main()
