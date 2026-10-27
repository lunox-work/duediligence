import unittest

from src.solution import add


class TestAddPrivate(unittest.TestCase):
    # Extends test_docstring_example_two_plus_three: larger, reversed magnitudes.
    def test_positive_operands_in_descending_order(self):
        # By hand: 83 + 19 = 83 + 20 - 1 = 102.
        self.assertEqual(add(83, 19), 102)

    # Extends test_docstring_example_two_plus_three: equal operands must both count.
    def test_equal_positive_operands(self):
        # By hand: twice 27 is 54.
        self.assertEqual(add(27, 27), 54)

    # Extends test_docstring_example_two_plus_three: smallest positive integers.
    def test_two_ones(self):
        # By hand: 1 + 1 = 2.
        self.assertEqual(add(1, 1), 2)

    # Extends test_docstring_example_five_plus_seven: carry across many digits.
    def test_decimal_carry(self):
        # By hand: one more than 999999 is 1000000.
        self.assertEqual(add(999999, 1), 1000000)

    # Extends test_docstring_example_five_plus_seven: no fixed integer width.
    def test_sum_crosses_signed_64_bit_boundary(self):
        # By hand: 2**63 - 1 plus 1 is 2**63.
        self.assertEqual(add(9223372036854775807, 1), 9223372036854775808)

    # Extends test_docstring_example_five_plus_seven: preserve low digits of huge ints.
    def test_huge_positive_sum(self):
        # Algebra: (10**100 + 7) + (10**100 + 9) = 2*10**100 + 16.
        self.assertEqual(add(10**100 + 7, 10**100 + 9), 2 * 10**100 + 16)

    # Extends test_two_negative_integers: opposite magnitude order to the public case.
    def test_negative_operands_in_descending_magnitude_order(self):
        # By hand: -(81 + 12) = -93.
        self.assertEqual(add(-81, -12), -93)

    # Extends test_two_negative_integers: equal negative operands.
    def test_equal_negative_operands(self):
        # By hand: twice -31 is -62.
        self.assertEqual(add(-31, -31), -62)

    # Extends test_two_negative_integers: magnitude exceeds a machine integer.
    def test_huge_negative_sum(self):
        # Algebra: -(10**100 + 3) - (10**100 + 8) = -2*10**100 - 11.
        self.assertEqual(add(-(10**100 + 3), -(10**100 + 8)), -2 * 10**100 - 11)

    # Extends test_mixed_sign_integers: negative first, positive result.
    def test_negative_first_with_positive_result(self):
        # By hand: -14 + 39 = 39 - 14 = 25.
        self.assertEqual(add(-14, 39), 25)

    # Extends test_mixed_sign_integers: negative first, negative result.
    def test_negative_first_with_negative_result(self):
        # By hand: -39 + 14 = -(39 - 14) = -25.
        self.assertEqual(add(-39, 14), -25)

    # Extends test_mixed_sign_integers: positive first, negative result.
    def test_positive_first_with_negative_result(self):
        # By hand: 14 - 39 = -25.
        self.assertEqual(add(14, -39), -25)

    # Extends test_mixed_sign_integers: a tiny residual between huge operands.
    def test_huge_mixed_sign_operands_leave_small_residual(self):
        # Algebra: (10**100 + 23) - (10**100 + 30) = 23 - 30 = -7.
        self.assertEqual(add(10**100 + 23, -(10**100 + 30)), -7)

    # Extends test_opposite_integers_cancel: reverse the signs' public order.
    def test_positive_first_cancellation(self):
        # By hand: an integer plus its negative is zero.
        self.assertEqual(add(73, -73), 0)

    # Extends test_opposite_integers_cancel: cancellation at arbitrary precision.
    def test_huge_cancellation(self):
        # Algebra: -(10**150 + 1) + (10**150 + 1) = 0.
        self.assertEqual(add(-(10**150 + 1), 10**150 + 1), 0)

    # Extends test_zero_first_operand: the nonzero operand is negative.
    def test_zero_first_negative_second(self):
        # By the additive identity: 0 + (-47) = -47.
        self.assertEqual(add(0, -47), -47)

    # Extends test_zero_first_operand: preserve a huge positive integer exactly.
    def test_zero_first_huge_second(self):
        # By the additive identity: zero leaves 10**120 + 1 unchanged.
        self.assertEqual(add(0, 10**120 + 1), 10**120 + 1)

    # Extends test_zero_second_operand: the nonzero operand is positive.
    def test_positive_first_zero_second(self):
        # By the additive identity: 58 + 0 = 58.
        self.assertEqual(add(58, 0), 58)

    # Extends test_zero_second_operand: preserve a huge negative integer exactly.
    def test_huge_negative_first_zero_second(self):
        # By the additive identity: zero leaves -(10**120 + 1) unchanged.
        self.assertEqual(add(-(10**120 + 1), 0), -(10**120 + 1))

    # Extends test_both_operands_zero: distinguish two zeros from either single zero.
    def test_both_zero_and_single_zero_combinations(self):
        # By hand: 0 + 0 = 0; adding zero to either side of -1 gives -1.
        self.assertEqual(add(0, 0), 0)
        self.assertEqual(add(0, -1), -1)
        self.assertEqual(add(-1, 0), -1)
