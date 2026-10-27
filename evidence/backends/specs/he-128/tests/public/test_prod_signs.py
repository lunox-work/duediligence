import unittest

from src.solution import prod_signs


class TestProdSigns(unittest.TestCase):
    def test_example_negative_product(self):
        self.assertEqual(prod_signs([1, 2, 2, -4]), -9)

    def test_example_zero_product(self):
        self.assertEqual(prod_signs([0, 1]), 0)

    def test_example_empty_array(self):
        self.assertIsNone(prod_signs([]))

    def test_all_positive_numbers(self):
        # Magnitudes sum to 2 + 5 + 3 = 10; all signs are positive.
        self.assertEqual(prod_signs([2, 5, 3]), 10)

    def test_single_positive_unit(self):
        # The sole magnitude is 1 and the sole sign is +1.
        self.assertEqual(prod_signs([1]), 1)

    def test_single_negative_unit(self):
        # The sole magnitude is 1 and the sole sign is -1.
        self.assertEqual(prod_signs([-1]), -1)

    def test_even_number_of_negative_signs(self):
        # 2 + 3 + 4 + 5 = 14; two negative signs multiply to +1.
        self.assertEqual(prod_signs([-2, 3, -4, 5]), 14)

    def test_odd_number_of_multiple_negative_signs(self):
        # 2 + 3 + 4 + 5 + 6 = 20; three negative signs give -1.
        self.assertEqual(prod_signs([-2, 3, -4, 5, -6]), -20)

    def test_all_negative_even_length(self):
        # Magnitudes sum to 2 + 5 = 7; (-1) * (-1) = +1.
        self.assertEqual(prod_signs([-2, -5]), 7)

    def test_all_negative_odd_length(self):
        # Magnitudes sum to 2 + 3 + 4 = 9; three negative signs give -1.
        self.assertEqual(prod_signs([-2, -3, -4]), -9)

    def test_zero_with_negative_numbers(self):
        # The zero sign makes the sign product zero, so 13 * 0 = 0.
        self.assertEqual(prod_signs([4, -7, 0, -2]), 0)

    def test_single_zero(self):
        # The sole magnitude and the sole sign are both zero: 0 * 0 = 0.
        self.assertEqual(prod_signs([0]), 0)

    def test_opposite_numbers_use_magnitudes(self):
        # Magnitudes add to 6 + 6 = 12; one negative sign gives -12.
        self.assertEqual(prod_signs([-6, 6]), -12)
