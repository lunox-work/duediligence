import unittest

from src.solution import add


class TestAddPrivate(unittest.TestCase):
    # Extends test_example_2_plus_3: the doctest shows the result printed
    # as `5`, so its repr is "5" (a float 5.0 or a string would not match).

    def test_doctest_repr_2_plus_3(self):
        self.assertEqual(repr(add(2, 3)), "5")

    # Extends test_example_5_plus_7: same doctest repr rule.

    def test_doctest_repr_5_plus_7(self):
        self.assertEqual(repr(add(5, 7)), "12")

    # Extends test_example_2_plus_3: operands swapped. By hand: 3 + 2 = 5.

    def test_swapped_3_plus_2(self):
        self.assertEqual(add(3, 2), 5)

    # Extends test_example_5_plus_7: operands swapped. By hand: 7 + 5 = 12.

    def test_swapped_7_plus_5(self):
        self.assertEqual(add(7, 5), 12)

    # Extends test_typical_sum_of_two_positive_ints: values not in the
    # public suite, so a lookup table of the visible cases fails.
    # By hand: 123 + 456 = 579.

    def test_unseen_positive_pair(self):
        self.assertEqual(add(123, 456), 579)

    # Extends test_typical_sum_of_two_positive_ints: operands with
    # overlapping bits, so x | y or x ^ y in place of x + y fails.
    # By hand: 6 + 6 = 12 (6 | 6 = 6, 6 ^ 6 = 0).

    def test_equal_operands_overlapping_bits(self):
        self.assertEqual(add(6, 6), 12)

    # Extends test_typical_sum_of_two_positive_ints: second operand larger
    # than the first, so x - y or max(x, y) fails. By hand: 1 + 99 = 100.

    def test_second_operand_larger(self):
        self.assertEqual(add(1, 99), 100)

    # Extends test_boundary_both_zero: zero with a nonzero operand on each
    # side. By hand: 0 + 9 = 9 and 9 + 0 = 9.

    def test_zero_left_identity(self):
        self.assertEqual(add(0, 9), 9)

    def test_zero_right_identity(self):
        self.assertEqual(add(9, 0), 9)

    # Extends test_boundary_both_zero: zero with a negative operand.
    # By hand: 0 + (-4) = -4.

    def test_zero_plus_negative(self):
        self.assertEqual(add(0, -4), -4)

    # Extends test_boundary_negative_operand_cancels: mixed signs that do
    # not cancel, so abs(x) - abs(y) or returning 0 for mixed signs fails.
    # By hand: 10 + (-3) = 7.

    def test_mixed_signs_positive_result(self):
        self.assertEqual(add(10, -3), 7)

    # By hand: 3 + (-10) = -7.

    def test_mixed_signs_negative_result(self):
        self.assertEqual(add(3, -10), -7)

    # By hand: -7 + 7 = 0 (negative operand first).

    def test_negative_first_cancels(self):
        self.assertEqual(add(-7, 7), 0)

    # Extends test_boundary_negative_operand_cancels: both negative, so
    # abs-based shortcuts fail. By hand: -8 + (-5) = -13.

    def test_both_negative(self):
        self.assertEqual(add(-8, -5), -13)

    # Extends test_typical_sum_of_two_positive_ints: Python ints are
    # unbounded, so a 64-bit wrapping sum fails. By hand:
    # (2**63 - 1) + 1 = 2**63.

    def test_past_signed_64_bit_max(self):
        self.assertEqual(add(2**63 - 1, 1), 2**63)

    # By hand: -2**63 + (-1) = -(2**63) - 1.

    def test_past_signed_64_bit_min(self):
        self.assertEqual(add(-(2**63), -1), -(2**63) - 1)

    # By hand: 10**30 + 10**30 = 2 * 10**30.

    def test_very_large_operands(self):
        self.assertEqual(add(10**30, 10**30), 2 * 10**30)

    # By hand: 10**30 + (-(10**30) + 1) = 1.

    def test_very_large_mixed_signs(self):
        self.assertEqual(add(10**30, -(10**30) + 1), 1)

    # Extends every public test: a grid of pairs over [-20, 20] in both
    # orders, each checked against Python's built-in x + y.

    def test_grid_matches_builtin_sum(self):
        for x in range(-20, 21):
            for y in range(-20, 21):
                with self.subTest(x=x, y=y):
                    self.assertEqual(add(x, y), x + y)


if __name__ == "__main__":
    unittest.main()
