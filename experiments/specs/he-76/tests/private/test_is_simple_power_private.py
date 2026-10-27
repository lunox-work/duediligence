import unittest

from src.solution import is_simple_power


class TestIsSimplePowerPrivate(unittest.TestCase):
    # Extends test_example_1_4: 1 = n**0 for every n, not just n = 4.

    def test_one_is_power_of_two(self):
        # 2**0 = 1.
        self.assertEqual(is_simple_power(1, 2), True)

    def test_one_is_power_of_large_base(self):
        # 12345**0 = 1.
        self.assertEqual(is_simple_power(1, 12345), True)

    # Extends test_example_2_2: x == n (k = 1) for other bases, so a
    # shortcut keyed to n = 2 fails.

    def test_x_equals_n_five(self):
        # 5**1 = 5.
        self.assertEqual(is_simple_power(5, 5), True)

    def test_x_equals_n_large(self):
        # 1000003**1 = 1000003.
        self.assertEqual(is_simple_power(1000003, 1000003), True)

    # Extends test_example_8_2: cubes and higher powers of other bases.

    def test_cube_of_three(self):
        # 3**3 = 27.
        self.assertEqual(is_simple_power(27, 3), True)

    def test_fifth_power_of_four(self):
        # 4**5 = 1024.
        self.assertEqual(is_simple_power(1024, 4), True)

    def test_power_of_large_base(self):
        # (10**6)**3 = 10**18.
        self.assertEqual(is_simple_power(10 ** 18, 10 ** 6), True)

    # Extends test_example_3_2: other non-powers of 2.

    def test_not_power_of_two_24(self):
        # 24 lies strictly between 2**4 = 16 and 2**5 = 32.
        self.assertEqual(is_simple_power(24, 2), False)

    def test_not_power_of_two_6(self):
        # 6 lies strictly between 2**2 = 4 and 2**3 = 8.
        self.assertEqual(is_simple_power(6, 2), False)

    # Extends test_example_3_1: with n = 1 every power is 1, so any other x
    # is false; a loop multiplying by n must not run forever on large x.

    def test_base_one_x_two(self):
        # 1**k = 1 for every integer k, never 2.
        self.assertEqual(is_simple_power(2, 1), False)

    def test_base_one_large_x(self):
        # 1**k = 1 for every integer k, never 10**100.
        self.assertEqual(is_simple_power(10 ** 100, 1), False)

    # Extends test_example_5_3: other non-powers of 3, and swapped args.

    def test_not_power_of_three_10(self):
        # 10 lies strictly between 3**2 = 9 and 3**3 = 27.
        self.assertEqual(is_simple_power(10, 3), False)

    def test_swapped_arguments(self):
        # 2**3 = 8 so (8, 2) is true, but 2 lies strictly between
        # 8**0 = 1 and 8**1 = 8, so (2, 8) is false.
        self.assertEqual(is_simple_power(8, 2), True)
        self.assertEqual(is_simple_power(2, 8), False)

    # Extends test_power_typical: exact powers whose float logarithm is
    # slightly below the integer exponent (math.log(243, 3) and
    # math.log(1000, 10) both evaluate just under 5 and 3), so truncating
    # the log gives the wrong answer.

    def test_power_243_of_3(self):
        # 3**5 = 243.
        self.assertEqual(is_simple_power(243, 3), True)

    def test_power_1000_of_10(self):
        # 10**3 = 1000.
        self.assertEqual(is_simple_power(1000, 10), True)

    def test_square_of_four(self):
        # 4**2 = 16.
        self.assertEqual(is_simple_power(16, 4), True)

    # Extends test_power_large_exponent: large powers of an odd base, which
    # are not exactly representable as floats (3**40 > 2**53 and is odd).

    def test_large_power_of_three(self):
        # x is built as 3**40, so k = 40 satisfies n**k == x.
        self.assertEqual(is_simple_power(3 ** 40, 3), True)

    def test_very_large_power_of_two(self):
        # x is built as 2**1000, so k = 1000 satisfies n**k == x.
        self.assertEqual(is_simple_power(2 ** 1000, 2), True)

    # Extends test_not_power_typical: powers of a smaller base that are not
    # powers of n (a "divides out by sqrt" or "power of 2" shortcut fails).

    def test_power_of_two_not_power_of_four(self):
        # 128 = 2**7 lies strictly between 4**3 = 64 and 4**4 = 256.
        self.assertEqual(is_simple_power(128, 4), False)

    def test_power_of_two_not_power_of_eight(self):
        # 32 = 2**5 lies strictly between 8**1 = 8 and 8**2 = 64.
        self.assertEqual(is_simple_power(32, 8), False)

    # Extends test_not_power_one_below_power: just below a large power of an
    # odd base, where float arithmetic cannot tell the values apart.

    def test_one_below_large_power_of_three(self):
        # 3**40 - 1 lies strictly between 3**39 and 3**40.
        self.assertEqual(is_simple_power(3 ** 40 - 1, 3), False)

    # Extends test_not_power_one_above_large_power: just above a large power
    # of an odd base.

    def test_one_above_large_power_of_three(self):
        # 3**40 + 1 lies strictly between 3**40 and 3**41.
        self.assertEqual(is_simple_power(3 ** 40 + 1, 3), False)

    def test_one_above_large_power_of_ten(self):
        # 10**30 + 1 lies strictly between 10**30 and 10**31.
        self.assertEqual(is_simple_power(10 ** 30 + 1, 10), False)

    # Extends test_not_power_divisible_by_n: x divisible by n, even by n**2,
    # yet not a power of n.

    def test_divisible_by_n_12_6(self):
        # 12 = 2 * 6 lies strictly between 6**1 = 6 and 6**2 = 36.
        self.assertEqual(is_simple_power(12, 6), False)

    def test_divisible_by_n_squared(self):
        # 50 = 2 * 5**2 lies strictly between 5**2 = 25 and 5**3 = 125.
        self.assertEqual(is_simple_power(50, 5), False)

    # Extends test_not_power_x_between_one_and_n: n is a power of x, not the
    # other way round.

    def test_root_of_n_is_not_power(self):
        # 3 lies strictly between 9**0 = 1 and 9**1 = 9.
        self.assertEqual(is_simple_power(3, 9), False)

    def test_fourth_root_of_n_is_not_power(self):
        # 2 lies strictly between 16**0 = 1 and 16**1 = 16.
        self.assertEqual(is_simple_power(2, 16), False)

    # Extends test_base_one_with_x_one: x = 1 is true for base 1 only;
    # x = 0 is never a power of 1.

    def test_base_one_x_zero(self):
        # 1**k = 1 for every integer k, never 0.
        self.assertEqual(is_simple_power(0, 1), False)

    # Rule "false in other cases" for x <= 0 with a positive base: n**k > 0
    # for every integer k when n >= 2.

    def test_zero_not_power_of_two(self):
        self.assertEqual(is_simple_power(0, 2), False)

    def test_negative_not_power_of_two(self):
        self.assertEqual(is_simple_power(-8, 2), False)

    # Brute force over a grid: for n in 2..12 and 1 <= x <= 200, the integer
    # powers of n that can equal x are n**0..n**7 (n**8 >= 256 > 200, and
    # negative k gives values strictly between 0 and 1).

    def test_brute_force_grid(self):
        for n in range(2, 13):
            powers = {n ** k for k in range(8)}
            for x in range(1, 201):
                with self.subTest(x=x, n=n):
                    self.assertEqual(is_simple_power(x, n), x in powers)


if __name__ == "__main__":
    unittest.main()
