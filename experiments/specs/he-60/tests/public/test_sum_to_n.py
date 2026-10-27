import unittest

from src.solution import sum_to_n


class TestSumToN(unittest.TestCase):
    # Docstring examples, one test each.

    def test_example_30(self):
        self.assertEqual(sum_to_n(30), 465)

    def test_example_100(self):
        self.assertEqual(sum_to_n(100), 5050)

    def test_example_5(self):
        self.assertEqual(sum_to_n(5), 15)

    def test_example_10(self):
        self.assertEqual(sum_to_n(10), 55)

    def test_example_1(self):
        self.assertEqual(sum_to_n(1), 1)

    # Rule: sums the numbers from 1 to n.

    def test_typical_n_4(self):
        # By hand: 1 + 2 + 3 + 4 = 10.
        self.assertEqual(sum_to_n(4), 10)

    def test_boundary_n_2_smallest_with_two_terms(self):
        # Smallest n whose sum has more than one term (n=1 is an example).
        # By hand: 1 + 2 = 3.
        self.assertEqual(sum_to_n(2), 3)


if __name__ == "__main__":
    unittest.main()
