import unittest

from src.solution import prod_signs


class TestProdSignsHidden(unittest.TestCase):
    # Extends test_example_negative_product: different repeated values and order.
    def test_one_negative_before_repeated_positives(self):
        # Magnitudes sum to 11 + 7 + 7 + 2 = 27; one negative.
        self.assertEqual(prod_signs([-11, 7, 7, 2]), -27)

    # Extends test_example_zero_product: zero at the end, after several positives.
    def test_trailing_zero(self):
        # A zero sign annihilates the product regardless of the magnitude sum.
        self.assertEqual(prod_signs([9, 12, 4, 0]), 0)

    # Extends test_example_empty_array: empty input following a nonempty call.
    def test_empty_after_nonempty(self):
        # The first result is -(8 + 3); the empty call must still return None.
        self.assertEqual(prod_signs([8, -3]), -11)
        self.assertIsNone(prod_signs([]))

    # Extends test_all_positive_numbers: repeated positive values all contribute.
    def test_repeated_positives(self):
        # Four magnitudes of 8 add to 32, with positive sign product.
        self.assertEqual(prod_signs([8, 8, 8, 8]), 32)

    # Extends test_single_positive_unit: magnitude must not be replaced by its sign.
    def test_single_positive_nonunit(self):
        # The sole sign is positive and the sole magnitude is 43.
        self.assertEqual(prod_signs([43]), 43)

    # Extends test_single_negative_unit: preserve a nonunit negative magnitude.
    def test_single_negative_nonunit(self):
        # The sole magnitude is 71 and the sole sign is negative.
        self.assertEqual(prod_signs([-71]), -71)

    # Extends test_even_number_of_negative_signs: four negatives, mixed order.
    def test_four_negatives_with_positive(self):
        # Four negative signs give +1; 9 + 2 + 1 + 5 + 3 = 20.
        self.assertEqual(prod_signs([-9, -2, 1, -5, -3]), 20)

    # Extends test_odd_number_of_multiple_negative_signs: five negatives.
    def test_five_negatives_with_positive(self):
        # Five negative signs give -1; 1 + 2 + 4 + 8 + 16 + 3 = 34.
        self.assertEqual(prod_signs([-1, -2, -4, -8, -16, 3]), -34)

    # Extends test_all_negative_even_length: six negatives with duplicates.
    def test_six_equal_negatives(self):
        # Six magnitudes of 7 total 42; an even number of negatives gives +1.
        self.assertEqual(prod_signs([-7, -7, -7, -7, -7, -7]), 42)

    # Extends test_all_negative_odd_length: five negatives with duplicates.
    def test_five_equal_negatives(self):
        # Five magnitudes of 4 total 20; an odd number of negatives gives -1.
        self.assertEqual(prod_signs([-4, -4, -4, -4, -4]), -20)

    # Extends test_zero_with_negative_numbers: leading zero, odd negative count.
    def test_leading_zero_with_three_negatives(self):
        # The zero sign makes the whole result zero, despite three negatives.
        self.assertEqual(prod_signs([0, -3, -5, -8]), 0)

    # Extends test_single_zero: the same input after a negative singleton call.
    def test_single_zero_after_nonzero(self):
        # A negative singleton returns itself; the next call has zero sign.
        self.assertEqual(prod_signs([-19]), -19)
        self.assertEqual(prod_signs([0]), 0)

    # Extends test_opposite_numbers_use_magnitudes: reverse order, new magnitude.
    def test_positive_then_opposite_negative(self):
        # The magnitudes add to 23 + 23 = 46; one negative gives -46.
        self.assertEqual(prod_signs([23, -23]), -46)

    # Extends test_opposite_numbers_use_magnitudes: two cancelling pairs.
    def test_two_opposite_pairs(self):
        # Signed sum is zero, but magnitude sum is 12; two negatives give +1.
        self.assertEqual(prod_signs([-3, 3, 3, -3]), 12)

    # Extends test_all_positive_numbers: many different positive magnitudes.
    def test_thousand_positives(self):
        # 1 + ... + 1000 = 1000 * 1001 / 2 = 500500; all signs positive.
        self.assertEqual(prod_signs(list(range(1, 1001))), 500500)

    # Extends test_odd_number_of_multiple_negative_signs: long alternating input.
    def test_many_alternating_units_with_odd_negative_count(self):
        # 10001 unit magnitudes, with 5001 negatives, give -10001.
        self.assertEqual(prod_signs([-1, 1] * 5000 + [-1]), -10001)

    # Extends test_even_number_of_negative_signs: repeated negative occurrences.
    def test_repeated_negative_occurrences_each_affect_parity(self):
        # Four occurrences of -2 give positive sign; 4 * 2 + 9 = 17.
        self.assertEqual(prod_signs([-2, 9, -2, -2, -2]), 17)

    # Extends test_example_zero_product: an array consisting of multiple zeros.
    def test_multiple_zeros_only(self):
        # Both the magnitude sum and the sign product are zero.
        self.assertEqual(prod_signs([0, 0, 0, 0]), 0)

    # Extends test_zero_with_negative_numbers: several zeros and both signs.
    def test_multiple_interspersed_zeros(self):
        # Each zero contributes a zero sign, so the result must be zero.
        self.assertEqual(prod_signs([-8, 0, 5, 0, -2, -7, 0]), 0)

    # Extends test_example_negative_product: sign product differs from sum's sign.
    def test_positive_signed_sum_but_negative_sign_product(self):
        # 100 + 20 - 3 is positive, but one negative gives -(100 + 20 + 3).
        self.assertEqual(prod_signs([100, 20, -3]), -123)

    # Extends test_even_number_of_negative_signs: signed sum is negative.
    def test_negative_signed_sum_but_positive_sign_product(self):
        # Two negatives give +1; magnitude sum is 100 + 20 + 3 = 123.
        self.assertEqual(prod_signs([-100, -20, 3]), 123)

    # Extends test_single_positive_unit: integers have no stated magnitude bound.
    def test_large_positive_integer(self):
        # A positive singleton returns its exact integer magnitude.
        value = 10**400 + 17
        self.assertEqual(prod_signs([value]), value)

    # Extends test_single_negative_unit: large negative magnitudes stay exact.
    def test_large_negative_integer(self):
        # A negative singleton returns minus its exact magnitude.
        value = 10**400 + 29
        self.assertEqual(prod_signs([-value]), -value)

    # Extends test_even_number_of_negative_signs: large integers and a small term.
    def test_large_magnitudes_with_small_addend(self):
        # Two negatives give +1; magnitudes sum to 2 * magnitude + 3.
        magnitude = 10**400
        self.assertEqual(prod_signs([magnitude, -magnitude, -3]), 2 * magnitude + 3)

    # Extends test_all_negative_even_length: zero signed sum is not required.
    def test_two_equal_negative_units(self):
        # (-1) * (-1) gives positive sign; the two unit magnitudes sum to 2.
        self.assertEqual(prod_signs([-1, -1]), 2)
