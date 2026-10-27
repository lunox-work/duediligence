import unittest

from src.solution import sum_to_n


class TestSumToN(unittest.TestCase):
    def test_example_thirty(self):
        self.assertEqual(sum_to_n(30), 465)

    def test_example_one_hundred(self):
        self.assertEqual(sum_to_n(100), 5050)

    def test_example_five(self):
        self.assertEqual(sum_to_n(5), 15)

    def test_example_ten(self):
        self.assertEqual(sum_to_n(10), 55)

    def test_example_one_single_term_boundary(self):
        self.assertEqual(sum_to_n(1), 1)

    def test_sum_all_integers_through_seven(self):
        # By hand: 1 + 2 + 3 + 4 + 5 + 6 + 7 = 28.
        self.assertEqual(sum_to_n(7), 28)

    def test_two_term_sum(self):
        # By hand: the first sum with distinct endpoints is 1 + 2 = 3.
        self.assertEqual(sum_to_n(2), 3)
