import unittest

from src.solution import common


class TestCommon(unittest.TestCase):
    # Docstring examples.

    def test_docstring_example_1(self):
        self.assertEqual(
            common([1, 4, 3, 34, 653, 2, 5], [5, 7, 1, 5, 9, 653, 121]),
            [1, 5, 653],
        )

    def test_docstring_example_2(self):
        self.assertEqual(common([5, 3, 2, 8], [3, 2]), [2, 3])

    # Rule: the result holds the elements present in both lists.

    def test_common_typical(self):
        # 2 and 3 are in both lists; 1 is only in l1, 4 only in l2.
        self.assertEqual(common([1, 2, 3], [2, 3, 4]), [2, 3])

    def test_common_none_shared(self):
        # No value appears in both lists, so there is nothing to return.
        self.assertEqual(common([1, 2, 3], [4, 5, 6]), [])

    def test_common_empty_input(self):
        # An empty list shares no element with any list.
        self.assertEqual(common([], [1, 2, 3]), [])

    # Rule: each common element appears once.

    def test_unique_duplicates_in_both(self):
        # 4 appears twice in l1 and three times in l2, 9 twice in each;
        # each is listed once, in ascending order.
        self.assertEqual(common([4, 9, 4, 9], [9, 4, 4, 9, 4]), [4, 9])

    def test_unique_duplicated_in_one_list_only(self):
        # 7 appears three times in l1 and once in l2: still listed once.
        self.assertEqual(common([7, 7, 7], [7]), [7])

    # Rule: the result is sorted (ascending, as both examples show).

    def test_sorted_typical(self):
        # Both inputs are in descending order; the common values 2, 5, 8
        # must come out ascending.
        self.assertEqual(common([9, 8, 5, 2, 1], [8, 6, 5, 2]), [2, 5, 8])

    def test_sorted_negative_and_zero(self):
        # Common values are 3, 0, -4; ascending order is -4, 0, 3.
        self.assertEqual(common([3, -4, 0, 7], [0, 3, -4, -7]), [-4, 0, 3])


if __name__ == "__main__":
    unittest.main()
