import unittest

from src.solution import add


class TestAdd(unittest.TestCase):
    def test_docstring_example_two_plus_three(self):
        self.assertEqual(add(2, 3), 5)

    def test_docstring_example_five_plus_seven(self):
        self.assertEqual(add(5, 7), 12)

    def test_two_negative_integers(self):
        # Adding two negatives gives -(4 + 9) = -13.
        self.assertEqual(add(-4, -9), -13)

    def test_mixed_sign_integers(self):
        # 11 + (-4) = 11 - 4 = 7.
        self.assertEqual(add(11, -4), 7)

    def test_opposite_integers_cancel(self):
        # -8 + 8 = 0 because the operands are additive inverses.
        self.assertEqual(add(-8, 8), 0)

    def test_zero_first_operand(self):
        # Adding zero leaves the other operand unchanged: 0 + 6 = 6.
        self.assertEqual(add(0, 6), 6)

    def test_zero_second_operand(self):
        # Adding zero leaves the other operand unchanged: -6 + 0 = -6.
        self.assertEqual(add(-6, 0), -6)

    def test_both_operands_zero(self):
        # The sum of zero and zero is zero.
        self.assertEqual(add(0, 0), 0)
