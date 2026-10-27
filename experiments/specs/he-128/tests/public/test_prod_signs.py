import unittest

from src.solution import prod_signs


class TestProdSigns(unittest.TestCase):
    # Docstring examples

    def test_example_mixed_signs(self):
        self.assertEqual(prod_signs([1, 2, 2, -4]), -9)

    def test_example_contains_zero(self):
        self.assertEqual(prod_signs([0, 1]), 0)

    def test_example_empty(self):
        self.assertIsNone(prod_signs([]))

    # Rule: sum of magnitudes times product of signs

    def test_odd_number_of_negatives(self):
        # magnitudes 3+1+2+5 = 11; three negatives -> sign product -1; -11
        self.assertEqual(prod_signs([3, -1, -2, -5]), -11)

    def test_even_number_of_negatives(self):
        # magnitudes 2+3 = 5; two negatives -> sign product +1; 5
        self.assertEqual(prod_signs([-2, -3]), 5)

    def test_single_negative_element(self):
        # magnitude 7; sign -1; -7
        self.assertEqual(prod_signs([-7]), -7)

    # Rule: a zero has sign 0, so the product of signs is 0

    def test_zero_among_nonzero(self):
        # signs 1 * -1 * 0 * 1 = 0; 11 * 0 = 0
        self.assertEqual(prod_signs([5, -3, 0, 2]), 0)

    def test_single_zero(self):
        # magnitude 0; sign 0; 0 (non-empty, so not None)
        self.assertEqual(prod_signs([0]), 0)

    # Rule: None only for an empty array

    def test_single_positive_element_is_not_none(self):
        # smallest non-empty input: magnitude 1, sign 1 -> 1
        self.assertEqual(prod_signs([1]), 1)


if __name__ == "__main__":
    unittest.main()
