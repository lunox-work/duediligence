import random
import unittest

from src.solution import common


def brute_common(l1, l2):
    # Obviously correct reference: keep each value of l1 that also occurs
    # in l2 (linear scan), skip values already kept, then sort ascending.
    kept = []
    for x in l1:
        if x in l2 and x not in kept:
            kept.append(x)
    return sorted(kept)


class TestCommonPrivate(unittest.TestCase):
    # Empty inputs: the empty list on either side, or both.

    # Extends test_common_empty_input: the empty list is the second argument.
    def test_empty_second_list(self):
        self.assertEqual(common([1, 2, 3], []), [])

    # Extends test_common_empty_input: both lists empty.
    def test_both_empty(self):
        self.assertEqual(common([], []), [])

    # Single elements.

    def test_single_elements_equal(self):
        self.assertEqual(common([5], [5]), [5])

    def test_single_elements_different(self):
        self.assertEqual(common([5], [6]), [])

    def test_single_negative_shared(self):
        self.assertEqual(common([-3], [-3]), [-3])

    def test_zero_shared(self):
        # 0 is falsy; it must still be reported as common.
        self.assertEqual(common([0, 1], [0, 2]), [0])

    # Extends test_common_typical: identical lists share everything.
    def test_identical_lists(self):
        self.assertEqual(common([3, 1, 2], [3, 1, 2]), [1, 2, 3])

    # Extends test_common_typical: l2 is a subset of l1 in another order.
    def test_second_is_subset(self):
        self.assertEqual(common([6, 1, 9, 4, 2], [9, 2]), [2, 9])

    # Extends test_common_typical: l1 is a subset of l2.
    def test_first_is_subset(self):
        self.assertEqual(common([9, 2], [6, 1, 9, 4, 2]), [2, 9])

    # Extends test_common_typical: swapping the arguments gives the same
    # result, since "common to both" is symmetric and the output is sorted.
    def test_symmetric_in_arguments(self):
        a = [10, -2, 7, 7, 3, 0, 15]
        b = [3, 15, 8, -2, -2, 11]
        # Shared values: -2, 3, 15.
        self.assertEqual(common(a, b), [-2, 3, 15])
        self.assertEqual(common(b, a), [-2, 3, 15])

    # Extends test_common_none_shared: disjoint lists that interleave in
    # value and contain duplicates.
    def test_none_shared_interleaved_with_duplicates(self):
        self.assertEqual(common([1, 3, 5, 3, 1], [2, 4, 6, 4, 2]), [])

    # Extends test_common_none_shared: negatives versus their positives.
    def test_none_shared_negatives_vs_positives(self):
        self.assertEqual(common([-1, -2, -3], [1, 2, 3]), [])

    # Extends test_unique_duplicated_in_one_list_only: the duplicates are in
    # l2, not l1.
    def test_unique_duplicated_in_second_only(self):
        self.assertEqual(common([7], [7, 7, 7]), [7])

    # Extends test_unique_duplicated_in_one_list_only: an element duplicated
    # in l1 but absent from l2 does not appear at all.
    def test_duplicates_absent_from_other_list(self):
        self.assertEqual(common([8, 8, 2, 8], [2, 3]), [2])

    # Extends test_unique_duplicates_in_both: many repeats of several values,
    # including negatives; each shared value once, ascending.
    def test_unique_many_repeats(self):
        l1 = [5, -1, 5, -1, 5, 0, 0, 12, 12, 12, 12]
        l2 = [12, -1, -1, 0, 5, 5, 5, 5, 99]
        # Shared: -1, 0, 5, 12.
        self.assertEqual(common(l1, l2), [-1, 0, 5, 12])

    # Extends test_unique_duplicates_in_both: one value repeated many times in
    # both lists.
    def test_unique_single_value_many_times(self):
        self.assertEqual(common([4] * 50, [4] * 30), [4])

    # Extends test_sorted_typical: inputs in neither ascending nor
    # descending order, and l1's order differs from l2's order, so neither
    # input order matches the sorted output.
    def test_sorted_shuffled_inputs(self):
        l1 = [6, 2, 9, 1, 4]
        l2 = [4, 9, 1, 6, 2]
        self.assertEqual(common(l1, l2), [1, 2, 4, 6, 9])

    # Extends test_sorted_typical: numeric, not lexicographic, order.
    # As strings, "100" < "20" < "3"; numerically 3 < 20 < 100.
    def test_sorted_numeric_not_lexicographic(self):
        self.assertEqual(common([100, 20, 3, 7], [3, 100, 20, 8]), [3, 20, 100])

    # Extends test_sorted_negative_and_zero: signed order, not by magnitude.
    # By absolute value the order would be 1, -2, 3, -10.
    def test_sorted_signed_not_by_magnitude(self):
        self.assertEqual(common([3, -10, 1, -2], [-2, 1, -10, 3]), [-10, -2, 1, 3])

    # Extends test_sorted_negative_and_zero: all negative.
    def test_sorted_all_negative(self):
        self.assertEqual(common([-5, -1, -9, -3], [-3, -9, -7, -5]), [-9, -5, -3])

    # Extends test_docstring_example_1: large magnitudes.
    def test_large_integers(self):
        big = 10 ** 18
        self.assertEqual(
            common([big, -big, 1, big + 1], [big + 1, -big, 2, big]),
            [-big, big, big + 1],
        )

    # Extends test_docstring_example_2: shared values at the start of l2
    # rather than at the end, and l2 longer than l1.
    def test_shorter_first_list(self):
        self.assertEqual(common([3, 2], [2, 8, 5, 3, 11]), [2, 3])

    # Strings are list elements too; sorted means ascending string order.
    def test_strings(self):
        self.assertEqual(
            common(["pear", "apple", "fig", "apple"], ["fig", "kiwi", "apple"]),
            ["apple", "fig"],
        )

    # The inputs are many and randomly ordered with duplicates; compare
    # against the brute-force reference above.
    def test_random_against_brute_force(self):
        rng = random.Random(58)
        for _ in range(20):
            l1 = [rng.randint(-50, 50) for _ in range(rng.randint(0, 60))]
            l2 = [rng.randint(-50, 50) for _ in range(rng.randint(0, 60))]
            self.assertEqual(common(l1, l2), brute_common(l1, l2))

    # Larger sizes: 600 elements each, compared against the brute force.
    def test_large_lists_against_brute_force(self):
        rng = random.Random(1234)
        l1 = [rng.randint(-1000, 1000) for _ in range(600)]
        l2 = [rng.randint(-1000, 1000) for _ in range(600)]
        self.assertEqual(common(l1, l2), brute_common(l1, l2))

    # Larger sizes with a known answer: evens 0..998 against multiples of 3
    # in 0..999, both reversed; the common values are the multiples of 6.
    def test_large_known_answer(self):
        l1 = list(range(998, -1, -2))
        l2 = list(range(999, -1, -3))
        self.assertEqual(common(l1, l2), list(range(0, 999, 6)))


if __name__ == "__main__":
    unittest.main()
