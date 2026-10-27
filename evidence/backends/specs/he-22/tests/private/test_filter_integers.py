import unittest
from decimal import Decimal
from fractions import Fraction

from src.solution import filter_integers


class TestFilterIntegersPrivate(unittest.TestCase):
    # Extends test_docstring_example_mixed_scalars: multiple integer positions.
    def test_mixed_scalars_with_negative_and_zero(self):
        # Deleting the strings, float, and None leaves these four integers.
        values = ["left", -17, 0, "29", 2.75, 29, None, -6]
        self.assertEqual(filter_integers(values), [-17, 0, 29, -6])

    # Extends test_docstring_example_mixed_scalars: integer comes first.
    def test_integer_before_all_nonintegers(self):
        # Only the leading value is an integer.
        self.assertEqual(filter_integers([42, "42", 4.2, None]), [42])

    # Extends test_docstring_example_with_containers: containers surround ints.
    def test_containers_before_between_and_after_integers(self):
        # Integers inside containers are not elements of the outer list.
        values = [[91], -8, {"n": 92}, (93,), 12, {94}, [], 0, {}]
        self.assertEqual(filter_integers(values), [-8, 12, 0])

    # Extends test_docstring_example_with_containers: deep nesting is opaque.
    def test_deeply_nested_containers_are_removed(self):
        # Only 13 and -2 occur as integers at the outer level.
        values = [[[1, [2]]], {3: [4, {5: 6}]}, 13, ((7,),), -2]
        self.assertEqual(filter_integers(values), [13, -2])

    # Extends test_retains_positive_negative_and_zero_integers: many and repeats.
    def test_all_integer_signs_and_duplicates(self):
        # Every element is an integer and must survive in its original place.
        values = [-12, 0, 45, -12, 9, 0, -1, 45, 1]
        self.assertEqual(filter_integers(values), [-12, 0, 45, -12, 9, 0, -1, 45, 1])

    # Extends test_retains_positive_negative_and_zero_integers: no size bound.
    def test_arbitrary_precision_integers(self):
        # Python integers have no stated magnitude limit in this specification.
        values = [2**2048, -(2**2048), 2**63, -(2**63) - 1, 0]
        self.assertEqual(
            filter_integers(values),
            [2**2048, -(2**2048), 2**63, -(2**63) - 1, 0],
        )

    # Extends test_single_integer: a nonzero positive singleton.
    def test_single_positive_integer(self):
        # The only element is an integer.
        self.assertEqual(filter_integers([73]), [73])

    # Extends test_single_integer: a negative singleton.
    def test_single_negative_integer(self):
        # The only element is an integer.
        self.assertEqual(filter_integers([-91]), [-91])

    # Extends test_single_integer: a singleton larger than machine integers.
    def test_single_large_integer(self):
        # The magnitude does not change the element's integer type.
        self.assertEqual(filter_integers([10**150]), [10**150])

    # Extends test_removes_non_integer_types: many convertible strings.
    def test_numeric_text_and_byte_sequences_are_not_coerced(self):
        # These are all text or byte sequences, never integer elements.
        values = ["0", "-19", "+7", " 42 ", "0x10", "٣", b"12", bytearray(b"8")]
        self.assertEqual(filter_integers(values), [])

    # Extends test_removes_non_integer_types: additional container types.
    def test_ranges_frozen_sets_and_memory_views(self):
        # Containing or yielding integers does not make a value an integer.
        values = [range(4), frozenset({5, 6}), memoryview(b"7"), iter([8, 9])]
        self.assertEqual(filter_integers(values), [])

    # Extends test_removes_non_integer_types: arbitrary nonnumeric objects.
    def test_objects_callables_types_and_slices(self):
        # Each value is a noninteger Python object, including the int class.
        values = [object(), lambda: 5, int, str, slice(1, 5), ValueError("7"), ...]
        self.assertEqual(filter_integers(values), [])

    # Extends test_removes_non_integer_types: numeric types beyond float/complex.
    def test_integral_decimal_and_fraction_values_are_removed(self):
        # Integral numerical value alone does not make these objects integers.
        values = [Decimal("12"), Fraction(-9, 1), Decimal("0"), Fraction(1, 3), 8]
        self.assertEqual(filter_integers(values), [8])

    # Extends test_removes_non_integer_types: conversion protocols are not type.
    def test_integer_conversion_protocols_do_not_make_integers(self):
        class Convertible:
            def __int__(self):
                return 17

            def __index__(self):
                return 17

        # The two instances are not integers; only the literal 17 is retained.
        self.assertEqual(filter_integers([Convertible(), 17, Convertible()]), [17])

    # Extends test_integer_valued_floats_are_removed: floats equal retained ints.
    def test_equal_float_and_integer_values_are_distinguished(self):
        # The integer occurrences are 4, 0, -7, and 4, in that order.
        values = [4.0, 4, 0.0, 0, -7.0, -7, 4, 4.0]
        self.assertEqual(filter_integers(values), [4, 0, -7, 4])

    # Extends test_integer_valued_floats_are_removed: negative zero/large float.
    def test_signed_zero_and_large_integral_floats(self):
        # All four values have float type, regardless of sign or magnitude.
        self.assertEqual(filter_integers([-0.0, 1e100, -1e100, 2.0**53]), [])

    # Extends test_integer_valued_floats_are_removed: nonfinite floats allowed.
    def test_nonfinite_floats_interleaved_with_integers(self):
        # NaN and infinities are floats; the outer integer elements are -3, 0, 8.
        values = [float("nan"), -3, float("inf"), 0, float("-inf"), 8]
        self.assertEqual(filter_integers(values), [-3, 0, 8])

    # Extends test_empty_list: empty input after a successful nonempty call.
    def test_empty_input_after_nonempty_input(self):
        # Filtering each given list determines its own result.
        self.assertEqual(filter_integers([21, "x", -4]), [21, -4])
        self.assertEqual(filter_integers([]), [])

    # Extends test_empty_list: nonempty input also produces an empty result.
    def test_empty_containers_and_other_false_values(self):
        # None of these empty or null values is an integer.
        self.assertEqual(filter_integers([[], {}, (), set(), "", b"", None]), [])

    # Extends test_preserves_integer_order: unsorted integers in many positions.
    def test_longer_unsorted_integer_order(self):
        # Read the integer elements from left to right without sorting them.
        values = ["a", 14, [], -20, 3.5, 7, {}, 0, None, -1, b"b", 12, 2]
        self.assertEqual(filter_integers(values), [14, -20, 7, 0, -1, 12, 2])

    # Extends test_preserves_integer_order: descending order of a longer input.
    def test_descending_sequence_with_noise(self):
        # Each descending integer is followed by two noninteger elements.
        values = []
        for integer in range(40, -41, -1):
            values.extend([integer, str(integer), float(integer)])
        self.assertEqual(filter_integers(values), list(range(40, -41, -1)))

    # Extends test_preserves_repeated_integers: repeated zeros and negatives.
    def test_repeated_zero_and_negative_integers(self):
        # Keep every occurrence of each integer and remove only the text/None.
        values = [0, "0", -5, 0, None, -5, "-5", -5, 0]
        self.assertEqual(filter_integers(values), [0, -5, 0, -5, -5, 0])

    # Extends test_preserves_repeated_integers: repetitions of several values.
    def test_repeated_pattern_with_equal_noninteger_numbers(self):
        # Each block contributes exactly the three integer entries 6, -2, 6.
        values = [6, 6.0, -2, "-2", 6, 6 + 0j] * 37
        self.assertEqual(filter_integers(values), [6, -2, 6] * 37)

    # Extends test_preserves_repeated_integers: long input with no removed items.
    def test_many_identical_integers(self):
        # All 513 occurrences must remain; filtering is not deduplication.
        self.assertEqual(filter_integers([-23] * 513), [-23] * 513)

    # Extends test_docstring_example_mixed_scalars: many rejected items first.
    def test_integer_after_long_noninteger_prefix(self):
        # Only the final element is an integer, even though others resemble it.
        values = ["11", 11.0, [11], {11: 11}, None] * 100 + [-11]
        self.assertEqual(filter_integers(values), [-11])

    # Extends test_docstring_example_with_containers: integer dictionary keys.
    def test_integer_keys_and_container_contents_are_not_extracted(self):
        # Containers remain outer noninteger elements, regardless of contents.
        values = [{1: 2, -3: 4}, [5, 6], (7, 8), {9, 10}, -12, {13: 14}]
        self.assertEqual(filter_integers(values), [-12])
