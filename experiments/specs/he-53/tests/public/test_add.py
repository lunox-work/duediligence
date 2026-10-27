import unittest

from src.solution import add


class TestAdd(unittest.TestCase):
    # Docstring examples.

    def test_example_2_plus_3(self):
        self.assertEqual(add(2, 3), 5)

    def test_example_5_plus_7(self):
        self.assertEqual(add(5, 7), 12)

    # Rule: the result is the sum x + y.

    def test_typical_sum_of_two_positive_ints(self):
        # By hand: 40 + 2 = 42.
        self.assertEqual(add(40, 2), 42)

    def test_boundary_both_zero(self):
        # By hand: 0 + 0 = 0, the smallest-magnitude sum.
        self.assertEqual(add(0, 0), 0)

    def test_boundary_negative_operand_cancels(self):
        # By hand: 7 + (-7) = 0; the int type admits negatives.
        self.assertEqual(add(7, -7), 0)


if __name__ == "__main__":
    unittest.main()
