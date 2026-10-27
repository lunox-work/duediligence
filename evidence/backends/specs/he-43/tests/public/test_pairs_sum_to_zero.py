import unittest

from src.solution import pairs_sum_to_zero


class TestPairsSumToZero(unittest.TestCase):
    def test_example_positive_numbers_with_zero(self):
        self.assertEqual(pairs_sum_to_zero([1, 3, 5, 0]), False)

    def test_example_repeated_one_without_opposite(self):
        self.assertEqual(pairs_sum_to_zero([1, 3, -2, 1]), False)

    def test_example_all_positive(self):
        self.assertEqual(pairs_sum_to_zero([1, 2, 3, 7]), False)

    def test_example_contains_opposite_fives(self):
        self.assertEqual(pairs_sum_to_zero([2, 4, -5, 3, 5, 7]), True)

    def test_example_single_positive(self):
        self.assertEqual(pairs_sum_to_zero([1]), False)

    def test_mixed_signs_with_opposite_pair(self):
        # -8 + 8 = 0, so these two distinct elements form a valid pair.
        self.assertEqual(pairs_sum_to_zero([-8, 3, 8, -2]), True)

    def test_two_elements_that_sum_to_zero(self):
        # -1 + 1 = 0; two elements are the minimum needed for a pair.
        self.assertEqual(pairs_sum_to_zero([-1, 1]), True)

    def test_all_negative_numbers(self):
        # Every sum of two negative integers is negative, never zero.
        self.assertEqual(pairs_sum_to_zero([-2, -4, -6]), False)

    def test_empty_list(self):
        # An empty list contains no elements from which to choose a pair.
        self.assertEqual(pairs_sum_to_zero([]), False)

    def test_single_zero_cannot_pair_with_itself(self):
        # Although 0 + 0 = 0, this list has only one element, not two.
        self.assertEqual(pairs_sum_to_zero([0]), False)

    def test_repeated_values_without_opposite(self):
        # The possible pair sums are 4 + 4 = 8 and 4 + (-3) = 1.
        self.assertEqual(pairs_sum_to_zero([4, 4, -3]), False)

    def test_repeated_values_with_opposite(self):
        # Either occurrence of -6 can pair with the distinct element 6.
        self.assertEqual(pairs_sum_to_zero([-6, -6, 6]), True)
