import unittest

from src.solution import modp


class TestModp(unittest.TestCase):
    # Docstring examples, one test each.

    def test_example_3_5(self):
        self.assertEqual(modp(3, 5), 3)

    def test_example_1101_101(self):
        self.assertEqual(modp(1101, 101), 2)

    def test_example_0_101(self):
        self.assertEqual(modp(0, 101), 1)

    def test_example_3_11(self):
        self.assertEqual(modp(3, 11), 8)

    def test_example_100_101(self):
        self.assertEqual(modp(100, 101), 1)

    # Rule: return 2^n modulo p.

    def test_power_exceeds_modulus(self):
        # 2^10 = 1024; 1024 mod 1000 = 24.
        self.assertEqual(modp(10, 1000), 24)

    def test_power_equals_modulus(self):
        # 2^4 = 16; 16 mod 16 = 0.
        self.assertEqual(modp(4, 16), 0)

    def test_power_just_below_modulus(self):
        # 2^9 = 512 < 1024, so 512 mod 1024 = 512.
        self.assertEqual(modp(9, 1024), 512)

    def test_modulus_one(self):
        # Every integer is 0 modulo 1: 2^5 = 32, 32 mod 1 = 0.
        self.assertEqual(modp(5, 1), 0)

    # Rule: be aware of numerics (large n, where 2^n is huge).

    def test_large_exponent(self):
        # The docstring gives 2^100 mod 101 = 1, so
        # 2^1000000 = (2^100)^10000 = 1^10000 = 1 (mod 101).
        self.assertEqual(modp(1000000, 101), 1)

    def test_large_exponent_with_remainder(self):
        # 2^1000003 = (2^100)^10000 * 2^3 = 1 * 8 = 8 (mod 101).
        self.assertEqual(modp(1000003, 101), 8)

    def test_large_exponent_power_of_two_modulus(self):
        # 1024 = 2^10 divides 2^1000, so 2^1000 mod 1024 = 0.
        self.assertEqual(modp(1000, 1024), 0)


if __name__ == "__main__":
    unittest.main()
