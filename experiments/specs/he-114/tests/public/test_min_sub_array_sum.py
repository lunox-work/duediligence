import unittest

from src.solution import minSubArraySum


class TestMinSubArraySum(unittest.TestCase):
    # Docstring examples

    def test_example_all_positive(self):
        self.assertEqual(minSubArraySum([2, 3, 4, 1, 2, 4]), 1)

    def test_example_all_negative(self):
        self.assertEqual(minSubArraySum([-1, -2, -3]), -6)

    # Rule: minimum sum over non-empty sub-arrays

    def test_mixed_signs_typical(self):
        # Sub-array sums of [2, -1, -2, 3]: singles 2, -1, -2, 3;
        # pairs 1, -3, 1; triples -1, 0; whole 2. Minimum is -3 ([-1, -2]).
        self.assertEqual(minSubArraySum([2, -1, -2, 3]), -3)

    def test_single_positive_element(self):
        # The only non-empty sub-array is [5].
        self.assertEqual(minSubArraySum([5]), 5)

    def test_single_negative_element(self):
        # The only non-empty sub-array is [-7].
        self.assertEqual(minSubArraySum([-7]), -7)

    def test_single_zero(self):
        # The only non-empty sub-array is [0].
        self.assertEqual(minSubArraySum([0]), 0)

    # Rule: the sub-array must be non-empty (an empty sum of 0 does not count)

    def test_all_positive_gives_smallest_element(self):
        # With all elements positive, extending a sub-array only raises its
        # sum, so the minimum is the smallest single element, 1 (not 0).
        self.assertEqual(minSubArraySum([3, 1, 2]), 1)

    def test_all_equal_positive(self):
        # Every single element is 4; longer sub-arrays sum to 8 or 12.
        self.assertEqual(minSubArraySum([4, 4, 4]), 4)

    # Rule: a sub-array is contiguous

    def test_contiguous_not_subsequence(self):
        # Sub-arrays containing -4: [-4] = -4, [3, -4] = -1,
        # [-2, 3, -4] = -3, [1, -2, 3, -4] = -2. Those without -4 are
        # at least -2. Minimum is -4; picking -2 and -4 together (-6) is
        # not allowed because they are not adjacent.
        self.assertEqual(minSubArraySum([1, -2, 3, -4]), -4)

    def test_minimum_spans_positive_element(self):
        # Sub-array sums of [-2, 1, -3]: singles -2, 1, -3; pairs -1, -2;
        # whole -4. Minimum is the whole array, crossing the positive 1.
        self.assertEqual(minSubArraySum([-2, 1, -3]), -4)


if __name__ == "__main__":
    unittest.main()
