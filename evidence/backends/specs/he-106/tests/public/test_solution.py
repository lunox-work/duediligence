import unittest

from src.solution import f


class TestF(unittest.TestCase):
    def test_docstring_example(self):
        self.assertEqual(f(5), [1, 2, 6, 24, 15])

    def test_zero_size_returns_empty_list(self):
        # A list of size zero has no elements to calculate.
        self.assertEqual(f(0), [])

    def test_first_position_uses_one_based_index(self):
        # The first index is 1, which is odd; its sum from 1 to 1 is 1.
        self.assertEqual(f(1), [1])

    def test_first_even_position_uses_factorial(self):
        # Index 1 gives 1; the first even index, 2, gives 1 * 2 = 2.
        self.assertEqual(f(2), [1, 2])

    def test_three_element_list_uses_indices_one_through_three(self):
        # The three indices give 1, 1 * 2 = 2, and 1 + 2 + 3 = 6.
        self.assertEqual(f(3), [1, 2, 6])

    def test_later_even_position_uses_factorial(self):
        # Odd indices 1, 3, 5 sum to 1, 6, 15; even indices 2, 4, 6
        # give products 1*2 = 2, 1*2*3*4 = 24, and 1*2*3*4*5*6 = 720.
        self.assertEqual(f(6), [1, 2, 6, 24, 15, 720])

    def test_later_odd_position_uses_sum(self):
        # Indices 1 through 6 give 1, 2, 6, 24, 15, 720 by the same
        # sums/products; index 7 gives 1 + 2 + 3 + 4 + 5 + 6 + 7 = 28.
        self.assertEqual(f(7), [1, 2, 6, 24, 15, 720, 28])
