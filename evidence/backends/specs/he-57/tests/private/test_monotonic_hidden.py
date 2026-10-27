import itertools
import unittest

from src.solution import monotonic


class TestMonotonicHidden(unittest.TestCase):
    def test_empty(self):
        # With no pairs, neither direction can be violated.
        self.assertEqual(monotonic([]), True)

    # Extends test_empty_list and test_single_element: another list with no
    # comparisons, whose sole element is false in a Boolean context.
    def test_single_zero(self):
        self.assertEqual(monotonic([0]), True)

    # Extends test_single_element: the sign of a sole element is irrelevant.
    def test_single_negative(self):
        self.assertEqual(monotonic([-123456789]), True)

    def test_single_fraction(self):
        self.assertEqual(monotonic([0.125]), True)

    # Extends test_two_increasing_elements: both elements are negative.
    def test_two_negative_increasing(self):
        # -1000 < -999 is the only comparison.
        self.assertEqual(monotonic([-1000, -999]), True)

    # Extends test_two_decreasing_elements: both elements are positive.
    def test_two_positive_decreasing(self):
        # 1000 > 999 is the only comparison.
        self.assertEqual(monotonic([1000, 999]), True)

    # Extends test_docstring_increasing: a much longer, unevenly spaced list.
    def test_long_increasing(self):
        # Squaring positive integers preserves their strict order.
        self.assertEqual(monotonic([i * i for i in range(1, 4097)]), True)

    # Extends test_docstring_decreasing: decreasing values need not cross zero.
    def test_long_negative_decreasing(self):
        # Negative squares strictly decrease as their positive roots increase.
        self.assertEqual(monotonic([-i * i for i in range(1, 4097)]), True)

    # Extends test_increasing_across_zero: zero need not appear in the input,
    # and neither equal spacing nor equal counts on each side are required.
    def test_increasing_skips_zero(self):
        # Every adjacent comparison is strictly increasing.
        self.assertEqual(monotonic([-100000, -64, -63, -2, 7, 99999]), True)

    # Extends test_decreasing_across_zero: an asymmetric list skips zero.
    def test_decreasing_skips_zero(self):
        # Every adjacent comparison is strictly decreasing.
        self.assertEqual(monotonic([100000, 12, 3, -7, -8, -9, -99999]), True)

    def test_increasing_only_negative(self):
        # -81 < -30 < -29 < -2 < -1.
        self.assertEqual(monotonic([-81, -30, -29, -2, -1]), True)

    def test_decreasing_only_positive(self):
        # 81 > 30 > 29 > 2 > 1.
        self.assertEqual(monotonic([81, 30, 29, 2, 1]), True)

    def test_large_integer_increasing(self):
        # Integers have no stated magnitude bound. These are four distinct
        # consecutive integers even though floating-point conversion loses it.
        base = 10**100
        self.assertEqual(monotonic([base, base + 1, base + 2, base + 3]), True)

    def test_large_integer_interior_reversal(self):
        # The steps have signs +, -, + even at this magnitude.
        base = 10**100
        self.assertEqual(monotonic([base, base + 2, base + 1, base + 3]), False)

    def test_fractional_increasing(self):
        # All are distinct, increasing fractions between zero and one.
        self.assertEqual(monotonic([0.125, 0.25, 0.375, 0.5, 0.875]), True)

    def test_fractional_decreasing(self):
        # Each value is strictly less than its predecessor.
        self.assertEqual(monotonic([-0.125, -0.25, -0.5, -0.875]), True)

    def test_fractional_peak(self):
        # 0.125 < 0.75 > 0.5 < 0.875; integer truncation would hide the bends.
        self.assertEqual(monotonic([0.125, 0.75, 0.5, 0.875]), False)

    def test_small_floats_reversal(self):
        # Both strict inequalities remain valid at very small magnitudes;
        # no tolerance for ignoring a reversal is specified.
        self.assertEqual(monotonic([1e-100, 3e-100, 2e-100]), False)

    def test_strings_increasing(self):
        # The list element type is unrestricted; strings have a total order.
        # 'ant' < 'bee' < 'cat' < 'dog' lexicographically.
        self.assertEqual(monotonic(['ant', 'bee', 'cat', 'dog']), True)

    def test_strings_decreasing(self):
        # 'zebra' > 'yak' > 'wolf' > 'ant' lexicographically.
        self.assertEqual(monotonic(['zebra', 'yak', 'wolf', 'ant']), True)

    def test_strings_interior_reversal(self):
        # 'ant' < 'cat' > 'bee' < 'dog'.
        self.assertEqual(monotonic(['ant', 'cat', 'bee', 'dog']), False)

    # Extends test_three_elements_with_peak: the endpoints decrease despite
    # an initial rise, so the endpoints alone cannot determine monotonicity.
    def test_peak_with_decreasing_endpoints(self):
        # 10 < 30 > 5.
        self.assertEqual(monotonic([10, 30, 5]), False)

    # Extends test_three_elements_with_valley: the endpoints increase despite
    # an initial fall.
    def test_valley_with_increasing_endpoints(self):
        # 10 > -30 < 50.
        self.assertEqual(monotonic([10, -30, 50]), False)

    # Extends test_docstring_not_monotonic: the sole decreasing step is at
    # the end of a long increasing prefix.
    def test_last_step_breaks_increasing(self):
        # The prefix ends at 256, followed by 255: a rise and a fall exist.
        self.assertEqual(monotonic(list(range(257)) + [255]), False)

    # Extends test_docstring_not_monotonic: a late rise breaks a descending list.
    def test_last_step_breaks_decreasing(self):
        # The prefix falls from 256 to 0, then rises to 1.
        self.assertEqual(monotonic(list(range(256, -1, -1)) + [1]), False)

    def test_first_step_breaks_increasing_suffix(self):
        # The first step falls from 1 to 0; all remaining steps rise.
        self.assertEqual(monotonic([1] + list(range(257))), False)

    def test_first_step_breaks_decreasing_suffix(self):
        # The first step rises from 255 to 256; all remaining steps fall.
        self.assertEqual(monotonic([255] + list(range(256, -1, -1))), False)

    def test_interior_swap_in_increasing_list(self):
        values = list(range(257))
        values[127], values[128] = values[128], values[127]
        # Everything rises except the swapped pair, 128 > 127.
        self.assertEqual(monotonic(values), False)

    def test_interior_swap_in_decreasing_list(self):
        values = list(range(256, -1, -1))
        values[127], values[128] = values[128], values[127]
        # Everything falls except the swapped pair, 128 < 129.
        self.assertEqual(monotonic(values), False)

    # Extends test_constant_list: matching endpoints and long constant runs
    # do not suffice. This has both a rise and a fall under either convention
    # for whether equal neighbors are allowed in a monotonic list.
    def test_equal_endpoints_surround_peak(self):
        self.assertEqual(monotonic([4] * 20 + [9] + [4] * 20), False)

    # Extends test_increasing_with_equal_neighbors: a later fall still breaks
    # monotonicity after ignoring the equal neighbors.
    def test_equal_neighbors_with_peak(self):
        # The unequal steps include -5 < 0 < 4 and 4 > 3.
        self.assertEqual(monotonic([-5, -5, 0, 4, 4, 3, 3]), False)

    # Extends test_decreasing_with_equal_neighbors: a later rise still breaks
    # monotonicity after ignoring the equal neighbors.
    def test_equal_neighbors_with_valley(self):
        # The unequal steps include 6 > 2 > -3 and -3 < -1.
        self.assertEqual(monotonic([6, 6, 2, -3, -3, -1, -1]), False)

    def test_alternating_duplicate_values(self):
        # -2 < 3 > -2 < 3 > -2: counting distinct values is insufficient.
        self.assertEqual(monotonic([-2, 3, -2, 3, -2]), False)

    def test_all_orders_of_five_distinct_integers(self):
        # Brute force every order of five distinct values. Check every pair
        # of positions directly: all earlier elements must be smaller, or
        # all must be larger. With distinct values strictness is immaterial.
        for order in itertools.permutations([-13, -2, 0, 7, 41]):
            pairs = list(itertools.combinations(range(len(order)), 2))
            expected = (
                all(order[i] < order[j] for i, j in pairs)
                or all(order[i] > order[j] for i, j in pairs)
            )
            with self.subTest(order=order):
                self.assertEqual(monotonic(list(order)), expected)


if __name__ == '__main__':
    unittest.main()
