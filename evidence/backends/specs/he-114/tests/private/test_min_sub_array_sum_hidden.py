import itertools
import unittest

from src.solution import minSubArraySum


def brute_force_minimum(nums):
    # Enumerate every pair of endpoints of a non-empty contiguous slice.
    return min(
        sum(nums[start:stop])
        for start in range(len(nums))
        for stop in range(start + 1, len(nums) + 1)
    )


class TestMinSubArraySumHidden(unittest.TestCase):
    # Extends test_docstring_positive_example: no 1, minimum at the last index.
    def test_positive_minimum_at_last_index(self):
        # Every longer slice adds strictly positive terms to a singleton.
        self.assertEqual(minSubArraySum([19, 12, 8, 11, 3]), 3)

    # Extends test_docstring_positive_example: duplicate minima at the first index.
    def test_positive_duplicate_minima(self):
        # The two singleton 6s tie; adding any element increases the sum.
        self.assertEqual(minSubArraySum([6, 13, 6, 24, 31, 17, 9]), 6)

    # Extends test_docstring_negative_example: many negatives, repeated values.
    def test_long_negative_array(self):
        # All 257 values are negative, so the whole array is minimal: 257 * -13.
        self.assertEqual(minSubArraySum([-13] * 257), -3341)

    # Extends test_docstring_negative_example: zeros do not break a negative run.
    def test_nonpositive_array_with_zero_gaps(self):
        # Taking the whole array includes all negative terms: -9 - 2 - 6 - 3.
        self.assertEqual(minSubArraySum([0, -9, 0, -2, -6, 0, -3, 0]), -20)

    # Extends test_single_positive_element: integer larger than machine ranges.
    def test_single_arbitrarily_large_positive(self):
        # There is exactly one non-empty slice.
        value = 10**100 + 37
        self.assertEqual(minSubArraySum([value]), value)

    # Extends test_single_negative_element: integer below machine ranges.
    def test_single_arbitrarily_large_negative(self):
        # There is exactly one non-empty slice.
        value = -(10**100 + 37)
        self.assertEqual(minSubArraySum([value]), value)

    # Extends test_single_zero_element: zero ties with several longer slices.
    def test_zero_with_positive_tail(self):
        # The leading zeros yield 0; every slice containing a positive is larger.
        self.assertEqual(minSubArraySum([0, 0, 21, 7, 3]), 0)

    # Extends test_all_zero_elements: considerably more equally minimal slices.
    def test_long_zero_array(self):
        # Every non-empty slice sums to zero.
        self.assertEqual(minSubArraySum([0] * 257), 0)

    # Extends test_zero_among_positive_elements: repeated zeros at both ends.
    def test_zero_minima_at_both_ends(self):
        # All entries are nonnegative and singleton zeros attain zero.
        self.assertEqual(minSubArraySum([0, 17, 4, 0, 0, 9, 0]), 0)

    # Extends test_minimum_is_an_interior_subarray: multiple positive bridges.
    def test_interior_minimum_crosses_two_positive_bridges(self):
        # The interior totals -7 + 2 - 8 + 3 - 9 = -19.
        # Each proper prefix/suffix of it has higher sum; outer values raise it.
        self.assertEqual(minSubArraySum([20, -7, 2, -8, 3, -9, 25]), -19)

    # Extends test_minimum_is_an_interior_subarray: zero inside the minimum.
    def test_interior_minimum_contains_zero(self):
        # The slice [-4, 0, -3] has sum -7, including both negatives at no cost.
        self.assertEqual(minSubArraySum([6, -4, 0, -3, 0, 8]), -7)

    # Extends test_minimum_is_a_prefix: prefix longer than two with positives.
    def test_long_prefix_with_positive_bridges(self):
        # The first five sum to -9 + 3 - 8 + 2 - 7 = -19.
        self.assertEqual(minSubArraySum([-9, 3, -8, 2, -7, 30]), -19)

    # Extends test_minimum_is_a_suffix: suffix longer than two with positives.
    def test_long_suffix_with_positive_bridges(self):
        # The last five sum to -7 + 2 - 8 + 3 - 9 = -19.
        self.assertEqual(minSubArraySum([30, -7, 2, -8, 3, -9]), -19)

    # Extends test_minimum_includes_a_positive_element: several positive entries.
    def test_whole_array_with_multiple_positive_bridges(self):
        # The full sum is -17; every proper prefix and suffix has larger sum.
        self.assertEqual(minSubArraySum([-8, 3, -9, 4, -7]), -17)

    # Extends test_minimum_includes_a_positive_element: a zero-sum bridge.
    def test_bridge_cost_exactly_cancels_first_negative(self):
        # [-4] and [-6, 6, -4] both sum to -4; no slice has lower sum than -6.
        # Thus the first singleton, -6, wins despite the longer negative slice.
        self.assertEqual(minSubArraySum([-6, 6, -4]), -6)

    # Extends test_separated_negatives_cannot_skip_an_element: multiple clusters.
    def test_positive_separator_between_negative_clusters(self):
        # [-7, 2, -6] sums to -11. The earlier -8 cannot cross the cost of 20.
        self.assertEqual(minSubArraySum([-8, 20, -7, 2, -6, 30]), -11)

    # Extends test_separated_negatives_cannot_skip_an_element: a fresh later run.
    def test_restart_after_running_sum_becomes_positive(self):
        # [-4, -8, 2, -7] sums to -17; including [-5, 11] adds 6.
        self.assertEqual(minSubArraySum([-5, 11, -4, -8, 2, -7, 30]), -17)

    # Extends test_minimum_is_a_suffix: earlier minimum must survive a worse tail.
    def test_best_slice_is_not_the_last_negative_run(self):
        # [-9, -8] gives -17; the later singleton -3 cannot improve it.
        self.assertEqual(minSubArraySum([4, -9, -8, 30, -3]), -17)

    # Extends test_minimum_is_an_interior_subarray: equal minima of different sizes.
    def test_tied_singletons_and_longer_slice(self):
        # Each -6 and [-6, 6, -6] sum to -6; the 8s only increase the sum.
        self.assertEqual(minSubArraySum([8, -6, 6, -6, 8]), -6)

    # Extends test_single_positive_element: two elements still forbid an empty slice.
    def test_two_positive_elements(self):
        # The only sums are 12, 5, and 17.
        self.assertEqual(minSubArraySum([12, 5]), 5)

    # Extends test_single_negative_element: both negatives must be included.
    def test_two_negative_elements(self):
        # The only sums are -12, -5, and -17.
        self.assertEqual(minSubArraySum([-12, -5]), -17)

    # Extends test_zero_among_positive_elements: a negative beats the zero.
    def test_zero_before_negative(self):
        # The only sums are 0, -11, and -11.
        self.assertEqual(minSubArraySum([0, -11]), -11)

    # Extends test_single_zero_element: zero after a negative does not reset the best.
    def test_zero_after_negative(self):
        # The only sums are -11, 0, and -11.
        self.assertEqual(minSubArraySum([-11, 0]), -11)

    # Extends test_minimum_is_a_prefix: large terms with an exact small remainder.
    def test_large_cancellation_with_small_negative_result(self):
        # [-B, B-3, -B] sums to -B-3, less than either -B singleton.
        big = 10**100
        self.assertEqual(minSubArraySum([-big, big - 3, -big]), -big - 3)

    # Extends test_docstring_positive_example: all values exceed common sentinels.
    def test_all_positive_values_exceed_machine_integer(self):
        # All values are positive, so the singleton big+1 is minimal.
        big = 10**100
        self.assertEqual(minSubArraySum([big + 9, big + 1, big + 7]), big + 1)

    # Extends test_separated_negatives_cannot_skip_an_element: endpoints are not adjacent.
    def test_no_wraparound_between_negative_endpoints(self):
        # The middle 100 prevents joining the -8 endpoints; either singleton wins.
        self.assertEqual(minSubArraySum([-8, 100, -8]), -8)

    # Extends test_minimum_includes_a_positive_element: a longer varied input.
    def test_many_mixed_values_against_all_contiguous_slices(self):
        nums = [((index * 37) % 101) - 53 for index in range(257)]
        # Expected value comes from enumerating every non-empty contiguous slice.
        expected = brute_force_minimum(nums)
        self.assertEqual(minSubArraySum(nums), expected)

    # Extends test_minimum_is_an_interior_subarray and all singleton tests:
    # every order, repetition, zero, and sign combination through length five.
    def test_exhaustive_small_arrays(self):
        for length in range(1, 6):
            for values in itertools.product((-3, -1, 0, 2, 4), repeat=length):
                nums = list(values)
                # Brute force checks every allowed pair of slice endpoints.
                expected = brute_force_minimum(nums)
                self.assertEqual(minSubArraySum(nums), expected, msg=repr(nums))
