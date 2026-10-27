import unittest

from src.solution import double_the_difference


class TestDoubleTheDifference(unittest.TestCase):
    # Docstring examples

    def test_example_mixed_odd_even_zero(self):
        self.assertEqual(double_the_difference([1, 3, 2, 0]), 10)

    def test_example_negatives_and_zero(self):
        self.assertEqual(double_the_difference([-1, -2, 0]), 0)

    def test_example_odd_and_negative_even(self):
        self.assertEqual(double_the_difference([9, -2]), 81)

    def test_example_single_zero(self):
        self.assertEqual(double_the_difference([0]), 0)

    # Rule: sum of squares of the odd numbers

    def test_odd_numbers_squared_and_summed(self):
        # 1*1 + 3*3 + 5*5 = 1 + 9 + 25 = 35
        self.assertEqual(double_the_difference([1, 3, 5]), 35)

    def test_only_even_numbers_gives_zero(self):
        # No odd numbers, so nothing is summed.
        self.assertEqual(double_the_difference([2, 4, 6]), 0)

    def test_single_element_one(self):
        # Smallest positive odd integer: 1*1 = 1
        self.assertEqual(double_the_difference([1]), 1)

    def test_large_odd_number_squared(self):
        # 99999**2 = (10**5 - 1)**2 = 10**10 - 2*10**5 + 1 = 9999800001
        self.assertEqual(double_the_difference([99999]), 9999800001)

    # Rule: ignore negative numbers

    def test_negative_odd_ignored(self):
        # -3 is ignored; 5*5 = 25
        self.assertEqual(double_the_difference([-3, 5]), 25)

    def test_negative_one_ignored(self):
        # -1 is the negative odd closest to zero and is still ignored; 1*1 = 1
        self.assertEqual(double_the_difference([-1, 1]), 1)

    # Rule: ignore numbers that are not integers

    def test_non_integer_ignored(self):
        # 2.5 is not an integer and is ignored; 3*3 = 9
        self.assertEqual(double_the_difference([2.5, 3]), 9)

    def test_only_non_integers_gives_zero(self):
        # 1.5 is not an integer and is ignored; 2 is even; sum is 0
        self.assertEqual(double_the_difference([1.5, 2]), 0)

    # Rule: empty list returns 0

    def test_empty_list(self):
        self.assertEqual(double_the_difference([]), 0)


if __name__ == "__main__":
    unittest.main()
