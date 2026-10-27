import unittest

from src.solution import prod_signs


def brute(arr):
    # Direct reading of the docstring: sign of each element is 1, -1 or 0;
    # multiply the signs together and multiply by the sum of abs values.
    sign_product = 1
    magnitude_sum = 0
    for x in arr:
        if x > 0:
            s = 1
        elif x < 0:
            s = -1
        else:
            s = 0
        sign_product *= s
        magnitude_sum += abs(x)
    return magnitude_sum * sign_product


class TestProdSignsPrivate(unittest.TestCase):
    # Extends test_example_mixed_signs: positives and an even number of
    # negatives mixed together; |-1|+|-2|+|3| = 6, signs -1*-1*1 = 1 -> 6.
    # Catches "negative if any element is negative".
    def test_even_negatives_mixed_with_positive(self):
        self.assertEqual(prod_signs([-1, -2, 3]), 6)

    # Extends test_example_mixed_signs: negative first instead of last;
    # 3+5 = 8, signs -1*1 = -1 -> -8. Catches summing values (sum 2).
    def test_negative_first_then_positive(self):
        self.assertEqual(prod_signs([-3, 5]), -8)

    # Extends test_example_mixed_signs: order does not matter;
    # every permutation of [1, 2, 2, -4] gives -9.
    def test_permutation_of_example(self):
        self.assertEqual(prod_signs([-4, 2, 1, 2]), -9)
        self.assertEqual(prod_signs([2, -4, 2, 1]), -9)

    # Extends test_example_contains_zero: zero last, after an odd number of
    # negatives; signs -1*0 = 0 -> 0. Catches treating zero as sign +1
    # (would give -1) and checking only arr[0] for zero.
    def test_zero_last_after_negative(self):
        self.assertEqual(prod_signs([-1, 0]), 0)

    # Extends test_zero_among_nonzero: zero last after three negatives;
    # without the zero the result would be -(1+2+3) = -6, with it 0.
    def test_zero_last_after_odd_negatives(self):
        self.assertEqual(prod_signs([-1, -2, -3, 0]), 0)

    # Extends test_single_zero: many zeros; magnitude 0, sign 0 -> 0, not None.
    def test_all_zeros(self):
        self.assertEqual(prod_signs([0, 0, 0]), 0)

    # Extends test_zero_among_nonzero: several zeros among large magnitudes.
    def test_multiple_zeros_with_large_values(self):
        self.assertEqual(prod_signs([1000, 0, -999, 0, 7]), 0)

    # Extends test_example_empty: empty list gives None, and a non-empty list
    # whose result is 0 is not None (distinct from the empty case).
    def test_empty_is_none_but_zero_list_is_not(self):
        self.assertIsNone(prod_signs([]))
        self.assertIsNotNone(prod_signs([0, -5]))
        self.assertEqual(prod_signs([0, -5]), 0)

    # Extends test_single_negative_element: other single negatives.
    def test_single_negative_minus_one(self):
        self.assertEqual(prod_signs([-1]), -1)

    def test_single_large_negative(self):
        self.assertEqual(prod_signs([-123456]), -123456)

    # Extends test_single_positive_element_is_not_none: other single positive.
    def test_single_large_positive(self):
        self.assertEqual(prod_signs([98765]), 98765)

    # Extends test_odd_number_of_negatives: duplicates, all negative, odd count;
    # 2+2+2 = 6, sign (-1)^3 = -1 -> -6.
    def test_three_equal_negatives(self):
        self.assertEqual(prod_signs([-2, -2, -2]), -6)

    # Extends test_even_number_of_negatives: duplicates, all negative, even
    # count; 1*4 = 4, sign (-1)^4 = 1 -> 4.
    def test_four_equal_negatives(self):
        self.assertEqual(prod_signs([-1, -1, -1, -1]), 4)

    # Extends test_even_number_of_negatives: all positive, many elements;
    # 1+2+...+10 = 55, sign 1 -> 55.
    def test_all_positive_many(self):
        self.assertEqual(prod_signs(list(range(1, 11))), 55)

    # Extends test_odd_number_of_negatives: 101 copies of -1;
    # magnitude 101, sign (-1)^101 = -1 -> -101.
    def test_many_negatives_odd_count(self):
        self.assertEqual(prod_signs([-1] * 101), -101)

    # Extends test_even_number_of_negatives: 100 copies of -3;
    # magnitude 300, sign (-1)^100 = 1 -> 300.
    def test_many_negatives_even_count(self):
        self.assertEqual(prod_signs([-3] * 100), 300)

    # Extends test_odd_number_of_negatives: big integers must stay exact;
    # |10**20+1| + |-(10**20+1)| = 2*10**20+2, one negative -> -(2*10**20+2).
    # Catches float-based sign or magnitude arithmetic.
    def test_big_integers_exact(self):
        big = 10 ** 20 + 1
        self.assertEqual(prod_signs([big, -big]), -(2 * 10 ** 20 + 2))

    # Extends test_zero_among_nonzero: a zero in the middle of big integers.
    def test_big_integers_with_zero(self):
        self.assertEqual(prod_signs([-(10 ** 30), 0, 10 ** 30]), 0)

    # Extends test_example_mixed_signs: larger mixed input, expected value from
    # the brute force above. Values -50..50 without 0 contain 50 negatives
    # -> sign +1; magnitude 2*(1+...+50) = 2550.
    def test_symmetric_range_without_zero(self):
        arr = [x for x in range(-50, 51) if x != 0]
        self.assertEqual(brute(arr), 2550)
        self.assertEqual(prod_signs(arr), 2550)

    # Same range with one extra negative: 51 negatives -> sign -1;
    # magnitude 2550 + 7 = 2557 -> -2557.
    def test_symmetric_range_plus_one_negative(self):
        arr = [x for x in range(-50, 51) if x != 0] + [-7]
        self.assertEqual(brute(arr), -2557)
        self.assertEqual(prod_signs(arr), -2557)

    # Extends test_zero_among_nonzero: range -50..50 including 0 -> 0.
    def test_symmetric_range_with_zero(self):
        self.assertEqual(prod_signs(list(range(-50, 51))), 0)

    # Larger generated input checked against the brute force: a fixed
    # pseudo-random list (linear congruential generator, no zeros).
    def test_generated_input_matches_brute_force(self):
        arr = []
        state = 12345
        for _ in range(1000):
            state = (state * 1103515245 + 12345) % (2 ** 31)
            v = state % 2001 - 1000
            arr.append(v if v != 0 else 1)
        self.assertEqual(prod_signs(arr), brute(arr))

    # Several small mixed inputs, each verified by hand:
    # [5, -1]: 6 * -1 = -6; [-5, -1, 2]: 8 * 1 = 8; [1, 1, -1]: 3 * -1 = -3.
    def test_small_mixed_cases(self):
        self.assertEqual(prod_signs([5, -1]), -6)
        self.assertEqual(prod_signs([-5, -1, 2]), 8)
        self.assertEqual(prod_signs([1, 1, -1]), -3)


if __name__ == "__main__":
    unittest.main()
