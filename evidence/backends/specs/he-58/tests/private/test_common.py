import unittest

from src.solution import common


class TestCommonPrivate(unittest.TestCase):
    # Extends test_first_docstring_example: many shared values, in reverse order.
    def test_many_shared_multiples(self):
        # Multiples of both 3 and 5 are multiples of 15; overlap is [-90, 90].
        self.assertEqual(
            common(list(range(90, -91, -3)), list(range(-100, 101, 5))),
            list(range(-90, 91, 15)),
        )

    # Extends test_second_docstring_example: a longer, reordered proper subset.
    def test_longer_subset(self):
        # All five second-list values occur in the first list.
        self.assertEqual(
            common([81, 4, 25, -7, 16, 0, 90], [16, 25, 0, 4, -7]),
            [-7, 0, 4, 16, 25],
        )

    # Extends test_partial_overlap_excludes_elements_present_in_only_one_list.
    def test_repeated_exclusive_values_are_excluded(self):
        # Repetition does not make 8 or 9 shared; only -4 and 12 are shared.
        self.assertEqual(
            common([8, 8, 8, 12, -4], [9, -4, 9, 12, 9]), [-4, 12]
        )

    # Extends test_disjoint_lists: overlapping numeric ranges still may be disjoint.
    def test_disjoint_interleaved_signed_values(self):
        # One list contains even integers; the other contains odd integers.
        self.assertEqual(common([-4, 0, 4, -2, 2], [3, -3, 1, -1]), [])

    # Extends test_disjoint_lists and test_lists_containing_only_one_repeated_value.
    def test_different_repeated_values(self):
        # Neither repeated value occurs in the other list.
        self.assertEqual(common([-8, -8, -8], [8, 8, 8, 8]), [])

    # Extends test_common_elements_are_sorted_numerically: longer signed ordering.
    def test_numeric_order_with_different_digit_lengths(self):
        # These eight shared integers are listed in increasing numeric order.
        self.assertEqual(
            common(
                [101, -2, 20, -1000000, 3, -11, 0, -100],
                [-100, 0, -11, 3, -1000000, 20, -2, 101],
            ),
            [-1000000, -100, -11, -2, 0, 3, 20, 101],
        )

    # Extends test_single_common_element: a false-valued element is still shared.
    def test_zero_is_the_only_common_value(self):
        # Zero occurs in both lists; all other values occur on only one side.
        self.assertEqual(common([-2, 0, 7, 0], [0, 4, 0, -9]), [0])

    # Extends test_single_common_element: both inputs have exactly one element.
    def test_equal_negative_singletons(self):
        # The single shared negative integer must appear once.
        self.assertEqual(common([-37], [-37]), [-37])

    # Extends test_disjoint_lists: the smallest nonempty disjoint inputs.
    def test_distinct_singletons(self):
        # The two singleton values differ.
        self.assertEqual(common([11], [-11]), [])

    # Extends test_second_docstring_example: the first list is the smaller subset.
    def test_first_list_is_singleton_subset(self):
        # Only -6 can be shared because it is the entire first list.
        self.assertEqual(common([-6], [8, 4, -6, 19, -6]), [-6])

    # Extends test_duplicates_in_both_lists_are_removed: unequal multiplicities.
    def test_heavy_asymmetric_duplicates(self):
        # The shared distinct values are -3, 0, and 12, regardless of counts.
        self.assertEqual(
            common([12] * 17 + [-3] * 2 + [0] * 9 + [7] * 4,
                   [0] * 2 + [-3] * 23 + [12] + [8] * 6),
            [-3, 0, 12],
        )

    # Extends test_duplicates_in_both_lists_are_removed: only the first repeats.
    def test_duplicates_only_in_first_list(self):
        # Each of the three distinct shared values must be emitted once.
        self.assertEqual(common([9, -1, 9, 4, -1, 4], [4, 9, -1]), [-1, 4, 9])

    # Extends test_duplicates_in_both_lists_are_removed: only the second repeats.
    def test_duplicates_only_in_second_list(self):
        # Scanning the repeated second list must not duplicate output values.
        self.assertEqual(common([4, 9, -1], [9, -1, 9, 4, -1, 4]), [-1, 4, 9])

    # Extends test_lists_containing_only_one_repeated_value: repeated zero.
    def test_only_repeated_zero(self):
        # Zero is shared and represents exactly one unique element.
        self.assertEqual(common([0] * 12, [0] * 7), [0])

    # Extends test_lists_containing_only_one_repeated_value: negative values.
    def test_only_repeated_negative(self):
        # All occurrences represent the same shared integer, -19.
        self.assertEqual(common([-19] * 8, [-19] * 13), [-19])

    # Extends test_empty_first_list: the other list contains sortable list values.
    def test_empty_first_with_nested_lists(self):
        # An empty list cannot share any elements, including list-valued ones.
        self.assertEqual(common([], [[2], [], [2], [1, 3]]), [])

    # Extends test_empty_second_list: the other list contains strings.
    def test_empty_second_with_strings(self):
        # No string can be shared with an empty second list.
        self.assertEqual(common(["z", "", "a", "z"], []), [])

    # Extends test_both_lists_empty: empty calls following a populated result.
    def test_both_empty_after_populated_call(self):
        # The first intersection is [5, 8]; the next call has no shared values.
        self.assertEqual(common([8, 5, 8], [5, 8]), [5, 8])
        self.assertEqual(common([], []), [])

    # Extends test_first_docstring_example: nonnumeric values and an empty string.
    def test_string_intersection(self):
        # Shared strings sort lexicographically: empty, uppercase, then lowercase.
        self.assertEqual(
            common(["z", "aa", "", "A", "aa", "left"],
                   ["right", "A", "z", "", "aa", "z"]),
            ["", "A", "aa", "z"],
        )

    # Extends test_common_elements_are_sorted_numerically: strings use string order.
    def test_numeric_strings_sort_lexicographically(self):
        # For strings, "10" and "100" precede "2"; no numeric conversion applies.
        self.assertEqual(common(["2", "100", "10"], ["10", "2", "100"]),
                         ["10", "100", "2"])

    # Extends test_duplicates_in_both_lists_are_removed: finite fractional values.
    def test_float_intersection(self):
        # Only -7.5, -0.25, 0.0, and 2.75 occur in both, in that numeric order.
        result = common([2.75, -7.5, 0.0, -0.25, 2.75, 8.5],
                        [-0.25, 2.75, -7.5, -0.25, 0.0, 9.5])
        self.assertEqual(len(result), 4)
        for actual, expected in zip(result, [-7.5, -0.25, 0.0, 2.75]):
            self.assertAlmostEqual(actual, expected)

    # Extends test_second_docstring_example: sortable tuple elements.
    def test_tuple_elements(self):
        # Tuple ordering compares elements, placing a prefix before its extension.
        self.assertEqual(
            common([(2, -1), (1, 2), (1,), (1, 0), (9,)],
                   [(1, 0), (1,), (2, -1), (1, 2), (1,)]),
            [(1,), (1, 0), (1, 2), (2, -1)],
        )

    # Extends test_duplicates_in_both_lists_are_removed: unhashable sortable values.
    def test_list_elements(self):
        # Lists compare lexicographically and equality identifies repeated lists.
        self.assertEqual(
            common([[2], [1, 0], [], [1], [2], [8]],
                   [[1], [2], [], [1, 0], [1], [9]]),
            [[], [1], [1, 0], [2]],
        )

    # Extends test_lists_containing_only_one_repeated_value: unhashable duplicates.
    def test_repeated_empty_list_elements(self):
        # Each empty inner list is equal, so the intersection contains one [].
        self.assertEqual(common([[], [], []], [[], []]), [[]])

    # Extends test_common_elements_are_sorted_numerically: boolean values.
    def test_boolean_elements(self):
        # Both boolean values are shared, and False sorts before True.
        self.assertEqual(common([True, False, True], [False, True, False]),
                         [False, True])

    # Extends test_first_docstring_example: identical inputs with many duplicates.
    def test_same_list_as_both_arguments(self):
        values = [14, -2, 14, 6, -2, 0, 6]
        # Every distinct input value is shared, even when the arguments alias.
        self.assertEqual(common(values, values), [-2, 0, 6, 14])
