import unittest

from src.solution import greatest_common_divisor


class TestGreatestCommonDivisor(unittest.TestCase):
    def test_docstring_coprime_example(self):
        self.assertEqual(greatest_common_divisor(3, 5), 1)

    def test_docstring_common_factor_example(self):
        self.assertEqual(greatest_common_divisor(25, 15), 5)

    def test_multiple_shared_prime_factors(self):
        # 72 = 2^3 * 3^2 and 120 = 2^3 * 3 * 5; gcd = 2^3 * 3 = 24.
        self.assertEqual(greatest_common_divisor(72, 120), 24)

    def test_equal_positive_inputs(self):
        # 18 divides both inputs, and no divisor of 18 can exceed 18.
        self.assertEqual(greatest_common_divisor(18, 18), 18)

    def test_first_input_divides_second(self):
        # 12 divides 36, and every common divisor must divide 12.
        self.assertEqual(greatest_common_divisor(12, 36), 12)

    def test_second_input_divides_first(self):
        # 12 divides 36, and every common divisor must divide 12.
        self.assertEqual(greatest_common_divisor(36, 12), 12)

    def test_one_as_an_input(self):
        # The only positive divisor of 1 is 1, which also divides 37.
        self.assertEqual(greatest_common_divisor(1, 37), 1)

    def test_zero_first_input(self):
        # Every positive divisor of 14 divides 0, and the largest is 14.
        self.assertEqual(greatest_common_divisor(0, 14), 14)

    def test_zero_second_input(self):
        # Every positive divisor of 14 divides 0, and the largest is 14.
        self.assertEqual(greatest_common_divisor(14, 0), 14)

    def test_negative_first_input(self):
        # Signs do not change divisibility; 18 and 24 share greatest divisor 6.
        self.assertEqual(greatest_common_divisor(-18, 24), 6)

    def test_negative_second_input(self):
        # Signs do not change divisibility; 18 and 24 share greatest divisor 6.
        self.assertEqual(greatest_common_divisor(18, -24), 6)

    def test_both_inputs_negative(self):
        # Signs do not change divisibility; 18 and 24 share greatest divisor 6.
        self.assertEqual(greatest_common_divisor(-18, -24), 6)
