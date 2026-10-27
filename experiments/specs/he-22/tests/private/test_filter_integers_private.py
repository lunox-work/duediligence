import unittest

from src.solution import filter_integers


class TestFilterIntegersPrivate(unittest.TestCase):
    # Extends test_docstring_example_string_float_int: the int is first,
    # not last, so a "keep the last element" shortcut fails.
    def test_int_first_then_string_and_float(self):
        # By hand: only 9 is an int.
        self.assertEqual(filter_integers([9, 'a', 3.14]), [9])

    # Extends test_docstring_example_string_float_int: an integral float is
    # still a float, and the result is List[int], so 5.0 must be dropped.
    def test_integral_float_is_not_kept(self):
        # By hand: 5.0 and -2.0 are floats; only 7 is an int.
        result = filter_integers([5.0, 7, -2.0])
        self.assertEqual(result, [7])
        self.assertTrue(all(type(x) is int for x in result))

    # Extends test_docstring_example_ints_with_containers: ints inside
    # containers are not themselves elements, so nothing is flattened.
    def test_ints_nested_in_containers_are_not_extracted(self):
        # By hand: the top-level elements are a list, a dict, a set, a tuple
        # and 6; only 6 is an int.
        values = [[1, 2], {3: 4}, {5}, (8, 9), 6]
        self.assertEqual(filter_integers(values), [6])

    # Extends test_mixed_values_keep_integers_in_order: order is input order,
    # not sorted, so a sorting shortcut fails.
    def test_order_preserved_when_not_sorted(self):
        # By hand: ints left to right are 30, -5, 10, 0, 2.
        values = [30, 'z', -5, 2.2, 10, None, 0, 'q', 2]
        self.assertEqual(filter_integers(values), [30, -5, 10, 0, 2])

    # Extends test_mixed_values_keep_integers_in_order: a larger input,
    # expected value computed with an obviously correct type check.
    def test_large_mixed_input(self):
        values = []
        for i in range(3000):
            values.extend([i - 1500, str(i), i + 0.5, None])
        # Brute force: the ints are exactly the i - 1500 values, in order.
        expected = [i - 1500 for i in range(3000)]
        self.assertEqual(filter_integers(values), expected)

    # Extends test_repeated_integers_are_all_kept: duplicates that are not
    # adjacent and in several groups, so a set or dedup shortcut fails.
    def test_many_duplicates_kept_with_multiplicity(self):
        # By hand: ints left to right are 1, 2, 1, 1, 2, 3, 3.
        values = [1, 'a', 2, 1, 1.0, 1, 2, 'b', 3, 3]
        self.assertEqual(filter_integers(values), [1, 2, 1, 1, 2, 3, 3])

    # Extends test_repeated_integers_are_all_kept: a single value repeated.
    def test_same_int_repeated_many_times(self):
        # By hand: 500 zeros interleaved with 500 strings leave 500 zeros.
        values = [0, '0'] * 500
        self.assertEqual(filter_integers(values), [0] * 500)

    # Extends test_empty_list: a single-element list holding an int.
    def test_single_int(self):
        # By hand: the only element is an int.
        self.assertEqual(filter_integers([-7]), [-7])

    # Extends test_empty_list: a single-element list holding a non-int.
    def test_single_non_int(self):
        # By hand: 'x' is not an int.
        self.assertEqual(filter_integers(['x']), [])

    # Extends test_no_integers: other non-int types, including strings of
    # digits, integral floats, complex numbers and bytes.
    def test_no_integers_other_types(self):
        # By hand: none of these is an int.
        values = ['42', '-3', 0.0, 3.0, 1j, 2 + 0j, b'1', (), set(), float('inf')]
        self.assertEqual(filter_integers(values), [])

    # Extends test_all_integers: large magnitude ints are still ints.
    def test_all_integers_large_magnitudes(self):
        # By hand: every element is an int, so all are kept in order.
        values = [10 ** 30, -(10 ** 25), 2 ** 63, -(2 ** 63) - 1, 1]
        self.assertEqual(filter_integers(values), values)

    # Extends test_all_integers: a longer all-int list in descending order.
    def test_all_integers_long_descending(self):
        values = list(range(1000, -1000, -1))
        # By hand: nothing is dropped and nothing is reordered.
        self.assertEqual(filter_integers(values), values)

    # Rule: the result holds only ints, even when ints are surrounded by
    # floats and int-like strings at both ends.
    def test_ints_between_int_like_non_ints(self):
        # By hand: ints left to right are 4 and -4.
        values = ['4', 4.0, 4, '-4', -4, -4.0]
        self.assertEqual(filter_integers(values), [4, -4])


if __name__ == '__main__':
    unittest.main()
