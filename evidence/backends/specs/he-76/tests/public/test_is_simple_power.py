import unittest

from src.solution import is_simple_power


class TestIsSimplePower(unittest.TestCase):
    def test_example_one_is_power_of_four(self):
        self.assertEqual(is_simple_power(1, 4), True)

    def test_example_two_is_power_of_two(self):
        self.assertEqual(is_simple_power(2, 2), True)

    def test_example_eight_is_power_of_two(self):
        self.assertEqual(is_simple_power(8, 2), True)

    def test_example_three_is_not_power_of_two(self):
        self.assertEqual(is_simple_power(3, 2), False)

    def test_example_three_is_not_power_of_one(self):
        self.assertEqual(is_simple_power(3, 1), False)

    def test_example_five_is_not_power_of_three(self):
        self.assertEqual(is_simple_power(5, 3), False)

    def test_zero_exponent(self):
        # 7**0 = 1.
        self.assertEqual(is_simple_power(1, 7), True)

    def test_exponent_one_for_another_base(self):
        # 7**1 = 7.
        self.assertEqual(is_simple_power(7, 7), True)

    def test_higher_power_of_another_base(self):
        # 3**4 = 3 * 3 * 3 * 3 = 81.
        self.assertEqual(is_simple_power(81, 3), True)

    def test_value_immediately_below_a_power(self):
        # 3**3 = 27 < 80 < 81 = 3**4; no integer exponent fits.
        self.assertEqual(is_simple_power(80, 3), False)

    def test_value_immediately_above_a_power(self):
        # 3**4 = 81 < 82 < 243 = 3**5; no integer exponent fits.
        self.assertEqual(is_simple_power(82, 3), False)

    def test_value_between_one_and_base(self):
        # 5**0 = 1 < 2 < 5 = 5**1; negative powers are below 1.
        self.assertEqual(is_simple_power(2, 5), False)

    def test_one_is_power_of_one(self):
        # 1**1 = 1, so a valid integer exponent exists for base 1.
        self.assertEqual(is_simple_power(1, 1), True)
