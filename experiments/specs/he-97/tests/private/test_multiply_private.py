import unittest

from src.solution import multiply


def unit_digit(n):
    # The digit in the units place: the last character of the decimal
    # representation of |n|. Obviously correct for any integer.
    return int(str(abs(n))[-1])


class TestMultiplyPrivate(unittest.TestCase):
    # Extends test_example_148_412: same unit digits (8, 2), other prefixes.
    def test_unit_digits_8_and_2_other_prefixes(self):
        # 8 * 2 = 16.
        self.assertEqual(multiply(8, 2), 16)
        self.assertEqual(multiply(99998, 12), 16)

    # Extends test_example_148_412: arguments swapped.
    def test_swapped_412_148(self):
        # Unit digits 2 and 8; 2 * 8 = 16.
        self.assertEqual(multiply(412, 148), 16)

    # Extends test_example_19_28: other values with a two-digit product.
    def test_unit_digits_6_and_8(self):
        # Unit digits 6 and 8; 6 * 8 = 48.
        self.assertEqual(multiply(36, 1238), 48)

    # Extends test_example_19_28: a shortcut that returns the product mod 10
    # (the units digit of a * b) gives 2 here, not 72.
    def test_product_not_reduced_mod_10(self):
        # Unit digits 9 and 8; 9 * 8 = 72; 19 * 28 = 532 would give 2.
        self.assertEqual(multiply(29, 18), 72)

    # Extends test_example_2020_1851: zero unit digit in the second argument.
    def test_zero_unit_digit_second_argument(self):
        # Unit digits 7 and 0; 7 * 0 = 0.
        self.assertEqual(multiply(1857, 2020), 0)

    # Extends test_example_2020_1851: zero unit digit with a negative number.
    def test_zero_unit_digit_negative(self):
        # -30 has unit digit 0, 9 has unit digit 9; 0 * 9 = 0.
        self.assertEqual(multiply(-30, 9), 0)

    # Extends test_example_14_negative_15: a negative second argument whose
    # floor-mod 10 differs from its unit digit (-13 % 10 == 7 in Python).
    def test_negative_second_argument_floor_mod_differs(self):
        # 14 -> 4, -13 -> 3; 4 * 3 = 12 (floor-mod would give 4 * 7 = 28).
        self.assertEqual(multiply(14, -13), 12)

    # Extends test_example_14_negative_15: result is non-negative, never the
    # product of a signed digit.
    def test_negative_second_argument_result_positive(self):
        # 6 -> 6, -7 -> 7; 6 * 7 = 42 (signed digits would give -42).
        self.assertEqual(multiply(6, -7), 42)

    # Extends test_product_of_unit_digits_typical: other digit pair.
    def test_unit_digits_4_and_6(self):
        # 4 * 6 = 24.
        self.assertEqual(multiply(54, 76), 24)

    # Extends test_product_single_digit_inputs_largest: smallest non-zero
    # single-digit inputs.
    def test_single_digit_ones(self):
        # 1 * 1 = 1.
        self.assertEqual(multiply(1, 1), 1)

    # Extends test_product_single_digit_inputs_largest: product 81 from
    # multi-digit inputs.
    def test_unit_digits_9_and_9_multi_digit(self):
        # 999 -> 9, 19 -> 9; 9 * 9 = 81.
        self.assertEqual(multiply(999, 19), 81)

    # Extends test_product_with_zero_unit_digit: zero first.
    def test_zero_and_single_digit(self):
        # 0 * 5 = 0.
        self.assertEqual(multiply(0, 5), 0)
        self.assertEqual(multiply(5, 0), 0)

    # Extends test_product_of_zeros: multiples of 10 of differing size.
    def test_multiples_of_ten(self):
        # Both unit digits 0; 0 * 0 = 0.
        self.assertEqual(multiply(100, -1000), 0)

    # Extends test_product_large_numbers: beyond 64-bit range.
    def test_numbers_beyond_64_bits(self):
        # 10**30 + 7 -> 7, 3 * 10**25 + 3 -> 3; 7 * 3 = 21.
        self.assertEqual(multiply(10**30 + 7, 3 * 10**25 + 3), 21)

    # Extends test_product_large_numbers: large negative number.
    def test_large_negative_number(self):
        # -(10**20 + 4) -> 4, 123456786 -> 6; 4 * 6 = 24.
        self.assertEqual(multiply(-(10**20 + 4), 123456786), 24)

    # Extends test_negative_first_argument: another negative first argument
    # where floor-mod differs (-17 % 10 == 3 in Python).
    def test_negative_first_argument_17(self):
        # -17 -> 7, 3 -> 3; 7 * 3 = 21 (floor-mod would give 3 * 3 = 9).
        self.assertEqual(multiply(-17, 3), 21)

    # Extends test_both_negative_single_digit: both negative, multi-digit,
    # digits where floor-mod differs.
    def test_both_negative_multi_digit(self):
        # -12 -> 2, -34 -> 4; 2 * 4 = 8 (floor-mod would give 8 * 6 = 48).
        self.assertEqual(multiply(-12, -34), 8)

    # Extends test_both_negative_single_digit: smallest-magnitude negatives.
    def test_both_negative_ones(self):
        # -1 -> 1; 1 * 1 = 1.
        self.assertEqual(multiply(-1, -1), 1)

    # Every pair of unit digits, with several prefixes and both signs,
    # checked against the string-based unit_digit brute force above.
    def test_all_digit_pairs_brute_force(self):
        for a in range(-120, 121):
            for b in range(-120, 121):
                expected = unit_digit(a) * unit_digit(b)
                self.assertEqual(multiply(a, b), expected, (a, b))

    # Every digit pair under large prefixes, against the same brute force.
    def test_all_digit_pairs_large_prefixes(self):
        for da in range(10):
            for db in range(10):
                a = 987654321 * 10 + da
                b = -(10**15 + 12340 + db)
                self.assertEqual(multiply(a, b), da * db, (a, b))


if __name__ == "__main__":
    unittest.main()
