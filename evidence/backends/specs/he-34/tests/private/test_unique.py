import unittest

from src.solution import unique


class TestUniquePrivate(unittest.TestCase):
    # Extends test_docstring_example: separated duplicates include negatives.
    def test_unsorted_signed_duplicates(self):
        # Enumerating distinct values in ascending order gives this list.
        self.assertEqual(
            unique([12, -7, 0, 12, -19, -7, 4, 0, -19, 12]),
            [-19, -7, 0, 4, 12],
        )

    # Extends test_sorts_distinct_elements: a larger, entirely reversed input.
    def test_descending_distinct_sequence(self):
        # Every integer from -150 through 150 occurs exactly once.
        self.assertEqual(unique(list(range(150, -151, -1))), list(range(-150, 151)))

    # Extends test_already_sorted_distinct_elements: no integer bounds are stated.
    def test_sorted_distinct_large_integers(self):
        # The signs and magnitudes establish the displayed ascending order.
        expected = [-(10**80), -(10**40), -1, 0, 1, 10**40, 10**80]
        self.assertEqual(unique(list(expected)), expected)

    # Extends test_removes_repeated_elements: longer runs at both ends and middle.
    def test_sorted_runs_with_different_lengths(self):
        # Each run contributes exactly its one value.
        values = [-31] * 17 + [-4] * 2 + [0] * 23 + [8] + [29] * 13
        self.assertEqual(unique(values), [-31, -4, 0, 8, 29])

    # Extends test_all_elements_equal: a negative value and many more copies.
    def test_many_equal_negative_elements(self):
        # The only distinct value is -17.
        self.assertEqual(unique([-17] * 257), [-17])

    # Extends test_empty_list: an empty list produced by slicing is still empty.
    def test_empty_slice(self):
        # The slice has no elements to retain.
        self.assertEqual(unique([3, 2, 1][1:1]), [])

    # Extends test_single_element: a negative integer far outside machine ranges.
    def test_single_large_negative_integer(self):
        # A singleton must retain its sole element.
        self.assertEqual(unique([-(10**100)]), [-(10**100)])

    # Extends test_all_elements_equal and test_empty_list: zero must be retained.
    def test_only_zero_duplicates(self):
        # Zero is an element even though it is false in a Boolean context.
        self.assertEqual(unique([0, 0, 0, 0, 0]), [0])

    # Extends test_docstring_example: two values with alternating occurrences.
    def test_alternating_two_values(self):
        # Only -6 and 14 occur, in that ascending order.
        self.assertEqual(unique([14, -6] * 80), [-6, 14])

    # Extends test_sorts_distinct_elements: numeric sorting must not be lexical.
    def test_multi_digit_numeric_order(self):
        # Numeric order places 2 before 10 and -100 before -11.
        self.assertEqual(unique([100, 2, -11, 10, -2, -100]), [-100, -11, -2, 2, 10, 100])

    # Extends test_removes_repeated_elements: each value recurs in distant blocks.
    def test_large_interleaved_duplicate_blocks(self):
        # All four blocks contain exactly the integers -75 through 75.
        values = list(range(75, -76, -1)) + list(range(-75, 76)) * 3
        self.assertEqual(unique(values), list(range(-75, 76)))

    # Extends test_docstring_example: sortable finite floats are also elements.
    def test_fractional_values_are_sorted_and_deduplicated(self):
        # These binary fractions have exact values; enumerate them numerically.
        result = unique([2.5, -0.25, 2.5, 0.0, -3.75, 0.125, -0.25])
        expected = [-3.75, -0.25, 0.0, 0.125, 2.5]
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), len(expected))
        for actual, wanted in zip(result, expected):
            self.assertAlmostEqual(actual, wanted)

    # Extends test_removes_repeated_elements: strings use lexicographic order.
    def test_string_duplicates_and_prefixes(self):
        # Empty string precedes 'a'; a prefix precedes its extensions.
        self.assertEqual(
            unique(['bee', 'aa', '', 'a', 'bee', 'ab', '', 'aa']),
            ['', 'a', 'aa', 'ab', 'bee'],
        )

    # Extends test_all_elements_equal: the repeated element can be an empty string.
    def test_all_empty_strings(self):
        # An empty string is still one distinct element.
        self.assertEqual(unique(['', '', '']), [''])

    # Extends test_single_element: a singleton string must remain one element.
    def test_single_multicharacter_string(self):
        # The list has one string, not separate character elements.
        self.assertEqual(unique(['cab']), ['cab'])

    # Extends test_sorts_distinct_elements: tuples compare component by component.
    def test_tuple_elements(self):
        # () is first; equal prefixes compare by length, then differing components.
        self.assertEqual(
            unique([(2,), (1, 3), (), (1,), (1, -2), (1, 3), (2,)]),
            [(), (1,), (1, -2), (1, 3), (2,)],
        )

    # Extends test_docstring_example: sortable elements need not be hashable.
    def test_list_elements_with_separated_equal_values(self):
        # List comparison is lexicographic; equal lists contribute one copy.
        self.assertEqual(
            unique([[2], [1, 3], [], [1], [1, -2], [1, 3], [], [2]]),
            [[], [1], [1, -2], [1, 3], [2]],
        )

    # Extends test_all_elements_equal and test_empty_list: retain an empty element.
    def test_repeated_empty_list_elements(self):
        # There are three equal elements, so the result contains one empty list.
        self.assertEqual(unique([[], [], []]), [[]])

    # Extends test_already_sorted_distinct_elements: comparable Boolean elements.
    def test_boolean_values(self):
        # False sorts before True; there is one distinct value of each kind.
        self.assertEqual(unique([True, False, True, False]), [False, True])

    # Extends test_removes_repeated_elements: large integers must stay distinct.
    def test_adjacent_large_integers(self):
        # These are distinct exact integers even beyond floating-point precision.
        base = 10**100
        self.assertEqual(
            unique([base + 2, base, base + 1, base + 2, base, base + 1]),
            [base, base + 1, base + 2],
        )


if __name__ == '__main__':
    unittest.main()
