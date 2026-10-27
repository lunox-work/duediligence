import unittest

from src.solution import simplify


class TestSimplify(unittest.TestCase):
    def test_example_reciprocal_product(self):
        self.assertEqual(simplify("1/5", "5/1"), True)

    def test_example_nonwhole_product(self):
        self.assertEqual(simplify("1/6", "2/1"), False)

    def test_example_partial_cancellation(self):
        self.assertEqual(simplify("7/10", "10/2"), False)

    def test_whole_product_greater_than_one(self):
        # (3 * 8) / (4 * 3) = 24/12 = 2.
        self.assertEqual(simplify("3/4", "8/3"), True)

    def test_all_components_at_minimum_positive_value(self):
        # Every component is the minimum allowed positive integer: 1 * 1 = 1.
        self.assertEqual(simplify("1/1", "1/1"), True)

    def test_nonwhole_product_greater_than_one(self):
        # (9 * 2) / (4 * 3) = 18/12 = 3/2, which is not whole.
        self.assertEqual(simplify("9/4", "2/3"), False)

    def test_minimum_numerators_with_proper_fractions(self):
        # (1 * 1) / (2 * 3) = 1/6, which is not whole.
        self.assertEqual(simplify("1/2", "1/3"), False)

    def test_unreduced_fraction_can_produce_whole_product(self):
        # (6 * 4) / (8 * 3) = 24/24 = 1; 6/8 need not be reduced.
        self.assertEqual(simplify("6/8", "4/3"), True)

    def test_both_denominators_at_minimum_positive_value(self):
        # (7 * 3) / (1 * 1) = 21.
        self.assertEqual(simplify("7/1", "3/1"), True)

    def test_both_fractions_improper(self):
        # (9 * 4) / (2 * 3) = 36/6 = 6.
        self.assertEqual(simplify("9/2", "4/3"), True)

    def test_large_fraction_just_above_one_is_not_whole(self):
        # The product is 1 + 1/1000000000000000000, strictly between 1 and 2.
        self.assertEqual(
            simplify("1000000000000000001/1000000000000000000", "1/1"),
            False,
        )
