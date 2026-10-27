import unittest

from src.solution import pairs_sum_to_zero


class TestPairsSumToZero(unittest.TestCase):
    # Docstring examples, one test each.

    def test_example_zero_alone_is_not_a_pair(self):
        self.assertIs(pairs_sum_to_zero([1, 3, 5, 0]), False)

    def test_example_no_pair_with_negative(self):
        self.assertIs(pairs_sum_to_zero([1, 3, -2, 1]), False)

    def test_example_all_positive(self):
        self.assertIs(pairs_sum_to_zero([1, 2, 3, 7]), False)

    def test_example_pair_present(self):
        self.assertIs(pairs_sum_to_zero([2, 4, -5, 3, 5, 7]), True)

    def test_example_single_element(self):
        self.assertIs(pairs_sum_to_zero([1]), False)

    # Rule: True when two distinct elements sum to zero.

    def test_pair_present_typical(self):
        # 4 + (-4) == 0; the other elements are irrelevant.
        self.assertIs(pairs_sum_to_zero([7, 4, 1, -4, 9]), True)

    def test_pair_present_boundary_two_element_list(self):
        # Smallest list that can hold a pair: 6 + (-6) == 0.
        self.assertIs(pairs_sum_to_zero([6, -6]), True)

    def test_pair_present_boundary_at_both_ends(self):
        # The only zero-sum pair is the first and last element:
        # -8 + 8 == 0; no other pair of these values sums to zero.
        self.assertIs(pairs_sum_to_zero([-8, 1, 2, 3, 8]), True)

    # Rule: False otherwise.

    def test_no_pair_typical_mixed_signs(self):
        # Pairs: -3+1=-2, -3+5=2, -3+-7=-10, 1+5=6, 1+-7=-6, 5+-7=-2;
        # none is zero.
        self.assertIs(pairs_sum_to_zero([-3, 1, 5, -7]), False)

    def test_no_pair_boundary_empty_list(self):
        # An empty list has no two elements, so no pair can sum to zero.
        self.assertIs(pairs_sum_to_zero([]), False)

    def test_no_pair_boundary_off_by_one(self):
        # Two elements, 5 + (-4) == 1, which is not zero.
        self.assertIs(pairs_sum_to_zero([5, -4]), False)

    # Rule: the two elements must be distinct (an element cannot pair with
    # itself). Only 0 satisfies x + x == 0, so that is where it matters.
    # [0, 0] is deliberately not tested: whether two equal values count as
    # "distinct elements" is not settled by the docstring.

    def test_distinct_typical_repeated_value_with_its_negation(self):
        # 4 + (-4) == 0 using two different elements; the repeat of 4 does
        # not change that.
        self.assertIs(pairs_sum_to_zero([4, -4, 4]), True)

    def test_distinct_boundary_single_zero_cannot_pair_with_itself(self):
        # The only element that could sum to zero with itself is 0, and it
        # appears once; the other pairs (0+2, 0+-1, 2+-1) are 2, -1, 1.
        self.assertIs(pairs_sum_to_zero([0, 2, -1]), False)

    def test_distinct_boundary_repeated_nonzero_values(self):
        # Every element is 3; any two sum to 6, never zero.
        self.assertIs(pairs_sum_to_zero([3, 3, 3]), False)

    # Rule: input is a list of integers (any size of integer).

    def test_integers_typical_zero_with_other_values(self):
        # A single 0 pairs with nothing here (0 + y == 0 needs y == 0); the
        # zero-sum pair is -2 + 2.
        self.assertIs(pairs_sum_to_zero([0, -2, 9, 2]), True)

    def test_integers_boundary_large_magnitudes(self):
        # 10**30 + (-10**30) == 0 exactly with Python integers.
        self.assertIs(pairs_sum_to_zero([10**30, 1, -10**30]), True)


if __name__ == "__main__":
    unittest.main()
