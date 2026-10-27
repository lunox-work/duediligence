import unittest

from src.solution import minSubArraySum


class TestMinSubArraySum(unittest.TestCase):
    def test_docstring_positive_example(self):
        self.assertEqual(minSubArraySum([2, 3, 4, 1, 2, 4]), 1)

    def test_docstring_negative_example(self):
        self.assertEqual(minSubArraySum([-1, -2, -3]), -6)

    def test_single_positive_element(self):
        # The sole non-empty subarray is [7], so an empty sum of 0 is invalid.
        self.assertEqual(minSubArraySum([7]), 7)

    def test_single_negative_element(self):
        # The sole non-empty subarray is [-7], whose sum is -7.
        self.assertEqual(minSubArraySum([-7]), -7)

    def test_single_zero_element(self):
        # The sole non-empty subarray is [0], whose sum is 0.
        self.assertEqual(minSubArraySum([0]), 0)

    def test_all_zero_elements(self):
        # Every non-empty subarray sums to 0.
        self.assertEqual(minSubArraySum([0, 0, 0]), 0)

    def test_zero_among_positive_elements(self):
        # [0] sums to 0; every subarray containing a positive value sums higher.
        self.assertEqual(minSubArraySum([3, 0, 2]), 0)

    def test_minimum_is_an_interior_subarray(self):
        # [-4, -3] sums to -7; adding either positive neighbor raises the sum.
        self.assertEqual(minSubArraySum([8, -4, -3, 9]), -7)

    def test_minimum_is_a_prefix(self):
        # [-4, -2] sums to -6; either singleton is higher and adding 9 raises it.
        self.assertEqual(minSubArraySum([-4, -2, 9]), -6)

    def test_minimum_is_a_suffix(self):
        # [-2, -4] sums to -6; either singleton is higher and adding 9 raises it.
        self.assertEqual(minSubArraySum([9, -2, -4]), -6)

    def test_minimum_includes_a_positive_element(self):
        # All three sum to -9; singleton sums are -5, 2, -6 and pair sums -3, -4.
        self.assertEqual(minSubArraySum([-5, 2, -6]), -9)

    def test_separated_negatives_cannot_skip_an_element(self):
        # Contiguous sums are -4, 10, -5, 6, 5, 1; the minimum is -5.
        self.assertEqual(minSubArraySum([-4, 10, -5]), -5)
