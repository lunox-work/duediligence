import random
import unittest

from src.solution import unique


def _brute(l):
    # Obviously correct reference: collect each value once by linear
    # membership check, then sort ascending with the built-in sort.
    seen = []
    for x in l:
        if x not in seen:
            seen.append(x)
    return sorted(seen)


class TestUniquePrivate(unittest.TestCase):
    # Extends test_docstring_example: same values, another order.
    # Distinct {0, 2, 3, 5, 9, 123} -> [0, 2, 3, 5, 9, 123].
    def test_docstring_values_reordered(self):
        self.assertEqual(unique([123, 0, 9, 3, 3, 2, 5, 3, 5]), [0, 2, 3, 5, 9, 123])

    # Extends test_docstring_example: multi-digit values where string
    # order differs from numeric order ("100" < "20" < "3" as strings).
    def test_numeric_not_lexicographic_order(self):
        self.assertEqual(unique([20, 3, 100, 3, 20, 1000]), [3, 20, 100, 1000])

    # Extends test_docstring_example: the result is a list.
    def test_result_is_list(self):
        self.assertIsInstance(unique([2, 1, 2]), list)

    # Extends test_duplicates_removed_typical: a value appearing exactly
    # once must be kept alongside values that appeared several times
    # (catches "keep only non-repeated" and "drop only repeated").
    # Distinct {1, 5, 8, 9} -> [1, 5, 8, 9].
    def test_kept_once_and_repeated_values(self):
        self.assertEqual(unique([8, 1, 8, 5, 9, 9, 9]), [1, 5, 8, 9])

    # Extends test_duplicates_removed_typical: duplicates far apart, not
    # adjacent in the input. Distinct {1, 2, 3} -> [1, 2, 3].
    def test_non_adjacent_duplicates(self):
        self.assertEqual(unique([3, 1, 2, 3, 1, 2, 3, 1, 2]), [1, 2, 3])

    # Extends test_duplicates_removed_typical: duplicates at both ends.
    # Distinct {5, 6} -> [5, 6].
    def test_duplicates_at_ends(self):
        self.assertEqual(unique([5, 6, 6, 6, 5]), [5, 6])

    # Extends test_duplicates_removed_typical: larger random input,
    # checked against the brute-force reference _brute.
    def test_random_large_against_brute(self):
        rng = random.Random(12345)
        l = [rng.randint(-50, 50) for _ in range(2000)]
        self.assertEqual(unique(l), _brute(l))

    # Extends test_duplicates_removed_all_equal: many copies of a
    # negative value -> one element.
    def test_all_equal_negative_many(self):
        self.assertEqual(unique([-4] * 500), [-4])

    # Extends test_duplicates_removed_all_equal: all zeros, two copies
    # (smallest list that has a duplicate).
    def test_all_equal_zero_pair(self):
        self.assertEqual(unique([0, 0]), [0])

    # Extends test_sorted_typical: distinct values in a shuffled order,
    # not just reversed. Hand-sorted -> [1, 2, 4, 7, 8, 10].
    def test_sorted_shuffled_distinct(self):
        self.assertEqual(unique([7, 2, 10, 1, 8, 4]), [1, 2, 4, 7, 8, 10])

    # Extends test_sorted_typical: already sorted input with duplicates
    # stays sorted: {1, 2, 3, 4} -> [1, 2, 3, 4].
    def test_already_sorted_with_duplicates(self):
        self.assertEqual(unique([1, 1, 2, 3, 3, 3, 4]), [1, 2, 3, 4])

    # Extends test_sorted_typical: two distinct values in reverse order.
    def test_two_elements_reversed(self):
        self.assertEqual(unique([2, 1]), [1, 2])

    # Extends test_sorted_typical: large permutation, distinct values
    # 0..999 shuffled; sorted unique is range(1000).
    def test_large_shuffled_permutation(self):
        l = list(range(1000))
        random.Random(7).shuffle(l)
        self.assertEqual(unique(l), list(range(1000)))

    # Extends test_sorted_with_negatives: negatives sort by value, not by
    # absolute value (|-10| > |5| but -10 < 5). {-10, -2, 5} -> [-10, -2, 5].
    def test_negatives_not_by_absolute_value(self):
        self.assertEqual(unique([5, -2, -10, 5, -10]), [-10, -2, 5])

    # Extends test_sorted_with_negatives: very large magnitudes, outside
    # any small fixed range. Hand-sorted.
    def test_large_magnitudes(self):
        big = 10 ** 18
        self.assertEqual(
            unique([big, -big, 0, big, -big, 1]),
            [-big, 0, 1, big],
        )

    # Extends test_sorted_with_negatives: all negative values with
    # duplicates. {-9, -5, -1} -> [-9, -5, -1].
    def test_all_negative(self):
        self.assertEqual(unique([-1, -9, -5, -1, -9]), [-9, -5, -1])

    # Extends test_empty_list: the smallest non-empty inputs next to
    # empty: one value twice -> that value once.
    def test_pair_of_equal_values(self):
        self.assertEqual(unique([3, 3]), [3])

    # Extends test_single_element: a single negative value.
    def test_single_negative_element(self):
        self.assertEqual(unique([-8]), [-8])

    # Extends test_single_element: a single zero.
    def test_single_zero_element(self):
        self.assertEqual(unique([0]), [0])

    # Rule applies to any sortable elements: strings sort lexicographically.
    # Distinct {"apple", "banana", "cherry"} -> ascending.
    def test_strings(self):
        self.assertEqual(
            unique(["cherry", "apple", "banana", "apple", "cherry"]),
            ["apple", "banana", "cherry"],
        )

    # Rule applies to floats: distinct {-0.5, 1.25, 3.5}, ascending.
    def test_floats(self):
        result = unique([3.5, -0.5, 1.25, 3.5, -0.5])
        expected = [-0.5, 1.25, 3.5]
        self.assertEqual(len(result), len(expected))
        for got, want in zip(result, expected):
            self.assertAlmostEqual(got, want)


if __name__ == "__main__":
    unittest.main()
