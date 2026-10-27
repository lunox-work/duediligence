import unittest

from src.solution import change_base


def _is_canonical(s, x, base):
    # A string is the base-`base` representation of x > 0 exactly when it is
    # non-empty, every character is a digit 0..base-1, it has no leading zero,
    # and Python's own int(s, base) parses it back to x.
    if not isinstance(s, str) or not s:
        return False
    if any(c not in '0123456789'[:base] for c in s):
        return False
    if s[0] == '0':
        return False
    return int(s, base) == x


class TestChangeBasePrivate(unittest.TestCase):
    # Extends test_example_8_base_3 / test_conversion_typical: those results
    # ('22', '101') are palindromes, so an implementation that emits digits
    # least-significant first passes them. 11 = 1*9 + 0*3 + 2 -> '102'.
    def test_base_3_non_palindrome_digit_order(self):
        self.assertEqual(change_base(11, 3), '102')

    # Extends test_example_7_base_2: '111' is a palindrome.
    # 6 = 1*4 + 1*2 + 0 -> '110' (reversed would be '011').
    def test_base_2_non_palindrome_digit_order(self):
        self.assertEqual(change_base(6, 2), '110')

    # Extends test_example_8_base_2: other powers of two and their
    # predecessors. 255 = 2^8 - 1 -> eight 1s; 256 = 2^8 -> 1 then eight 0s.
    def test_base_2_power_boundaries(self):
        self.assertEqual(change_base(2, 2), '10')
        self.assertEqual(change_base(3, 2), '11')
        self.assertEqual(change_base(255, 2), '11111111')
        self.assertEqual(change_base(256, 2), '100000000')

    # Extends test_example_8_base_2: 10 = 8 + 2 -> '1010'.
    def test_base_2_ten(self):
        self.assertEqual(change_base(10, 2), '1010')

    # Extends test_conversion_x_equals_base: x == base for every allowed base
    # other than 4 gives '10'.
    def test_x_equals_base_all_bases(self):
        for base in (2, 3, 5, 6, 7, 8, 9):
            with self.subTest(base=base):
                self.assertEqual(change_base(base, base), '10')

    # Extends test_conversion_x_equals_base: x == base*base gives '100'.
    def test_x_equals_base_squared_all_bases(self):
        for base in range(2, 10):
            with self.subTest(base=base):
                self.assertEqual(change_base(base * base, base), '100')

    # Extends test_conversion_x_equals_base: x == base - 1 is the largest
    # single digit, x == base*base - 1 is two copies of the largest digit.
    def test_just_below_base_powers_all_bases(self):
        for base in range(2, 10):
            d = str(base - 1)
            with self.subTest(base=base):
                self.assertEqual(change_base(base - 1, base), d)
                self.assertEqual(change_base(base * base - 1, base), d + d)
                self.assertEqual(change_base(base ** 3 - 1, base), d * 3)
                self.assertEqual(change_base(base ** 3, base), '1000')

    # Extends test_base_below_10_typical: '123' in bases 4 and 8.
    # 27 = 1*16 + 2*4 + 3; 83 = 1*64 + 2*8 + 3.
    def test_digits_123_in_other_bases(self):
        self.assertEqual(change_base(27, 4), '123')
        self.assertEqual(change_base(83, 8), '123')

    # Extends test_base_below_10_typical: 100 = 4*25 + 0*5 + 0 -> '400'
    # (trailing zeros must be kept).
    def test_base_5_trailing_zeros(self):
        self.assertEqual(change_base(100, 5), '400')

    # Extends test_base_below_10_typical: 100 = 2*36 + 4*6 + 4 -> '244'.
    def test_base_6_typical(self):
        self.assertEqual(change_base(100, 6), '244')

    # Extends test_base_below_10_typical: base 7. 50 = 1*49 + 0*7 + 1 -> '101';
    # 48 = 6*7 + 6 -> '66'.
    def test_base_7_typical(self):
        self.assertEqual(change_base(50, 7), '101')
        self.assertEqual(change_base(48, 7), '66')

    # Extends test_base_9_largest_allowed: '88' is a palindrome of one repeated
    # digit. 100 = 1*81 + 2*9 + 1 -> '121'; 17 = 1*9 + 8 -> '18' (not '81').
    def test_base_9_other_values(self):
        self.assertEqual(change_base(100, 9), '121')
        self.assertEqual(change_base(17, 9), '18')

    # Extends test_base_9_largest_allowed: 9 -> '10', 81 -> '100'.
    def test_base_9_powers(self):
        self.assertEqual(change_base(9, 9), '10')
        self.assertEqual(change_base(81, 9), '100')

    # Extends test_returns_string_single_digit: x < base gives the single
    # digit str(x), for several bases including the largest.
    def test_single_digit_various_bases(self):
        cases = [(1, 9, '1'), (8, 9, '8'), (5, 7, '5'), (3, 4, '3'), (2, 3, '2')]
        for x, base, expected in cases:
            with self.subTest(x=x, base=base):
                result = change_base(x, base)
                self.assertIsInstance(result, str)
                self.assertEqual(result, expected)

    # Extends test_returns_string_typical: a long result is still a str.
    def test_returns_string_large(self):
        result = change_base(2 ** 100, 2)
        self.assertIsInstance(result, str)
        # 2^100 in base 2 is a 1 followed by 100 zeros.
        self.assertEqual(result, '1' + '0' * 100)

    # Large inputs: catches float division (x / base) that loses precision.
    # 3^40 -> 1 followed by 40 zeros; 8^30 - 1 -> thirty 7s.
    def test_large_exact_powers(self):
        self.assertEqual(change_base(3 ** 40, 3), '1' + '0' * 40)
        self.assertEqual(change_base(8 ** 30 - 1, 8), '7' * 30)

    # Large input checked by the canonical-form property (see _is_canonical).
    def test_large_value_base_9(self):
        x = 10 ** 30 + 12345
        self.assertTrue(_is_canonical(change_base(x, 9), x, 9))

    # Brute force over every allowed base and x in 1..1000: each result must be
    # the canonical base-`base` string, verified via int(s, base) round-trip,
    # digit range and absence of a leading zero (see _is_canonical).
    def test_exhaustive_small_all_bases(self):
        for base in range(2, 10):
            for x in range(1, 1001):
                s = change_base(x, base)
                if not _is_canonical(s, x, base):
                    self.fail(f'change_base({x}, {base}) = {s!r}')


if __name__ == '__main__':
    unittest.main()
