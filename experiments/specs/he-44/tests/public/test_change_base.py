import unittest

from src.solution import change_base


class TestChangeBase(unittest.TestCase):
    # Docstring examples.

    def test_example_8_base_3(self):
        self.assertEqual(change_base(8, 3), '22')

    def test_example_8_base_2(self):
        self.assertEqual(change_base(8, 2), '1000')

    def test_example_7_base_2(self):
        self.assertEqual(change_base(7, 2), '111')

    # Rule: x is converted to its representation in the given base.

    def test_conversion_typical(self):
        # 10 = 1*9 + 0*3 + 1 -> digits 1, 0, 1.
        self.assertEqual(change_base(10, 3), '101')

    def test_conversion_x_equals_base(self):
        # 4 = 1*4 + 0 -> the first two-digit number in base 4.
        self.assertEqual(change_base(4, 4), '10')

    # Rule: base numbers are less than 10.

    def test_base_below_10_typical(self):
        # 38 = 1*25 + 2*5 + 3 -> digits 1, 2, 3.
        self.assertEqual(change_base(38, 5), '123')

    def test_base_9_largest_allowed(self):
        # 80 = 8*9 + 8 -> digits 8, 8.
        self.assertEqual(change_base(80, 9), '88')

    # Rule: the result is returned as a string.

    def test_returns_string_typical(self):
        result = change_base(8, 3)
        self.assertIsInstance(result, str)
        self.assertEqual(result, '22')

    def test_returns_string_single_digit(self):
        # 1 < 2, so it is a single digit: '1', still a string, not int 1.
        result = change_base(1, 2)
        self.assertIsInstance(result, str)
        self.assertEqual(result, '1')


if __name__ == '__main__':
    unittest.main()
