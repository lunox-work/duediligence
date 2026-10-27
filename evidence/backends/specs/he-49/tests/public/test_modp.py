import unittest

from src.solution import modp


class TestModp(unittest.TestCase):
    def test_example_three_modulo_five(self):
        self.assertEqual(modp(3, 5), 3)

    def test_example_large_exponent(self):
        self.assertEqual(modp(1101, 101), 2)

    def test_example_zero_exponent(self):
        self.assertEqual(modp(0, 101), 1)

    def test_example_power_below_modulus(self):
        self.assertEqual(modp(3, 11), 8)

    def test_example_exponent_one_hundred(self):
        self.assertEqual(modp(100, 101), 1)

    def test_typical_remainder(self):
        # 2^5 = 32 = 4 * 7 + 4.
        self.assertEqual(modp(5, 7), 4)

    def test_smallest_positive_exponent(self):
        # 2^1 = 2, which is less than 5.
        self.assertEqual(modp(1, 5), 2)

    def test_modulus_one(self):
        # Every integer, including 2^7 = 128, has remainder 0 modulo 1.
        self.assertEqual(modp(7, 1), 0)

    def test_zero_exponent_with_modulus_one(self):
        # 2^0 = 1, and 1 modulo 1 is 0.
        self.assertEqual(modp(0, 1), 0)

    def test_even_composite_modulus(self):
        # 2^5 = 32 = 5 * 6 + 2.
        self.assertEqual(modp(5, 6), 2)

    def test_power_equal_to_modulus(self):
        # 2^4 = 16, so division by 16 leaves remainder 0.
        self.assertEqual(modp(4, 16), 0)

    def test_large_power_requires_exact_remainder(self):
        # Modulo 1000: 2^10 = 1024 -> 24; squaring gives
        # 2^20 -> 576, 2^40 -> 776, and 2^80 -> 176.
        # Thus 2^100 -> 176 * 576 = 101376 -> 376.
        self.assertEqual(modp(100, 1000), 376)

    def test_large_even_exponent(self):
        # 2^2 = 4 is 1 modulo 3, so 2^1024 = (2^2)^512
        # also has remainder 1 modulo 3.
        self.assertEqual(modp(1024, 3), 1)
