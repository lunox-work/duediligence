import unittest

from src.solution import is_simple_power


class TestIsSimplePower(unittest.TestCase):
    # Docstring examples, one test each.

    def test_example_1_4(self):
        self.assertEqual(is_simple_power(1, 4), True)

    def test_example_2_2(self):
        self.assertEqual(is_simple_power(2, 2), True)

    def test_example_8_2(self):
        self.assertEqual(is_simple_power(8, 2), True)

    def test_example_3_2(self):
        self.assertEqual(is_simple_power(3, 2), False)

    def test_example_3_1(self):
        self.assertEqual(is_simple_power(3, 1), False)

    def test_example_5_3(self):
        self.assertEqual(is_simple_power(5, 3), False)

    # Rule: x is a simple power of n when n**k == x for some integer k.

    def test_power_typical(self):
        # 3**4 = 3 * 3 * 3 * 3 = 81.
        self.assertEqual(is_simple_power(81, 3), True)

    def test_power_large_exponent(self):
        # x is built as 2**64, so k = 64 satisfies n**k == x.
        self.assertEqual(is_simple_power(2 ** 64, 2), True)

    # Rule: otherwise the result is false.

    def test_not_power_typical(self):
        # Powers of 2 are 1, 2, 4, 8, 16, ...; 12 lies strictly between 8 and
        # 16, so no integer k gives 2**k == 12 (negative k gives fractions).
        self.assertEqual(is_simple_power(12, 2), False)

    def test_not_power_one_below_power(self):
        # 4**3 = 64, and 63 lies strictly between 4**2 = 16 and 4**3 = 64,
        # so no integer k gives 4**k == 63.
        self.assertEqual(is_simple_power(63, 4), False)

    def test_not_power_one_above_large_power(self):
        # 2**64 + 1 lies strictly between 2**64 and 2**65, so no integer k
        # gives 2**k == 2**64 + 1.
        self.assertEqual(is_simple_power(2 ** 64 + 1, 2), False)

    def test_not_power_divisible_by_n(self):
        # 18 = 2 * 3**2 is divisible by 3 but lies strictly between
        # 3**2 = 9 and 3**3 = 27, so no integer k gives 3**k == 18.
        self.assertEqual(is_simple_power(18, 3), False)

    def test_not_power_x_between_one_and_n(self):
        # 4**0 = 1 and 4**1 = 4; 2 lies strictly between them, and negative
        # k gives values below 1, so no integer k gives 4**k == 2.
        self.assertEqual(is_simple_power(2, 4), False)

    # Rule applied to n = 1: every integer power of 1 is 1.

    def test_base_one_with_x_one(self):
        # 1**0 = 1 (indeed 1**k = 1 for every integer k), so x = 1 qualifies.
        self.assertEqual(is_simple_power(1, 1), True)


if __name__ == "__main__":
    unittest.main()
