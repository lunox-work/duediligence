import random
import unittest

from src.solution import minSubArraySum


def brute_min(nums):
    # Obviously correct: sum every non-empty contiguous slice nums[i:j].
    return min(sum(nums[i:j]) for i in range(len(nums))
               for j in range(i + 1, len(nums) + 1))


class TestMinSubArraySumPrivate(unittest.TestCase):
    # Extends test_example_all_positive: smallest element in the middle,
    # different values. Extending any sub-array of positives raises its sum.
    def test_all_positive_min_in_middle(self):
        self.assertEqual(minSubArraySum([7, 9, 3, 8]), 3)

    # Extends test_example_all_positive: smallest element last.
    def test_all_positive_min_last(self):
        self.assertEqual(minSubArraySum([5, 6, 2]), 2)

    # Extends test_example_all_positive: smallest element first.
    def test_all_positive_min_first(self):
        self.assertEqual(minSubArraySum([2, 6, 5]), 2)

    # Extends test_example_all_negative: more elements, unordered; the whole
    # array sums to -5-1-7-2 = -15. Catches returning min(nums) (-7).
    def test_all_negative_unordered(self):
        self.assertEqual(minSubArraySum([-5, -1, -7, -2]), -15)

    # Extends test_example_all_negative: all-nonpositive with zeros mixed in;
    # the whole array is minimal: -4 + 0 - 3 + 0 - 1 = -8.
    def test_nonpositive_with_zeros(self):
        self.assertEqual(minSubArraySum([0, -4, 0, -3, 0, -1]), -8)

    # Extends test_mixed_signs_typical: minimum is a middle run that crosses a
    # positive and is neither a prefix, suffix, single element nor the whole.
    # Kadane by hand: 3, -4, -2, -5, -6, 1, -5 -> -6 from [-4, 2, -3, -1].
    # min(min(nums), sum(nums)) would give -5.
    def test_mixed_middle_run_crossing_positive(self):
        self.assertEqual(minSubArraySum([3, -4, 2, -3, -1, 7, -5]), -6)

    # Extends test_mixed_signs_typical: minimum is a length-3 middle run
    # [-1, -2, -3] = -6; the positives at both ends only raise the sum.
    def test_mixed_length_three_middle(self):
        self.assertEqual(minSubArraySum([5, -1, -2, -3, 5]), -6)

    # Extends test_single_positive_element: a large single value; catches a
    # running minimum initialised to a finite sentinel such as 10**9.
    def test_single_large_positive(self):
        self.assertEqual(minSubArraySum([10 ** 15]), 10 ** 15)

    # Extends test_single_negative_element: a large-magnitude negative.
    def test_single_large_negative(self):
        self.assertEqual(minSubArraySum([-(10 ** 15)]), -(10 ** 15))

    # Extends test_single_zero: all zeros, every sub-array sums to 0.
    def test_all_zeros(self):
        self.assertEqual(minSubArraySum([0, 0, 0]), 0)

    # Extends test_all_positive_gives_smallest_element: a zero among
    # positives; [0] is the minimum, every other sub-array is >= 1.
    def test_zero_among_positives(self):
        self.assertEqual(minSubArraySum([1, 0, 2]), 0)

    # Extends test_all_positive_gives_smallest_element: all positives are
    # large; the minimum is the smallest element, above any small sentinel.
    def test_all_large_positive(self):
        self.assertEqual(minSubArraySum([3 * 10 ** 12, 10 ** 12, 2 * 10 ** 12]),
                         10 ** 12)

    # Extends test_all_equal_positive: equal negatives; the whole array
    # sums to 5 * -4 = -20.
    def test_all_equal_negative(self):
        self.assertEqual(minSubArraySum([-4] * 5), -20)

    # Extends test_all_equal_positive: duplicated minimum, ties between
    # several sub-arrays. In [-2, 2, -2, 2, -2] every sub-array has at most
    # one more -2 than 2, so the minimum is -2 (reached by many sub-arrays).
    def test_ties_alternating(self):
        self.assertEqual(minSubArraySum([-2, 2, -2, 2, -2]), -2)

    # Extends test_contiguous_not_subsequence: two negatives separated by a
    # positive larger than either; joining them gives -3 + 4 - 3 = -2, so the
    # best is a single -3. Summing all negatives (-6) is wrong.
    def test_separated_negatives_not_joined(self):
        self.assertEqual(minSubArraySum([-3, 4, -3]), -3)

    # Extends test_contiguous_not_subsequence: minimum is the last element.
    def test_min_is_last_element(self):
        self.assertEqual(minSubArraySum([1, 2, 3, -1]), -1)

    # Extends test_contiguous_not_subsequence: minimum is the first element.
    def test_min_is_first_element(self):
        self.assertEqual(minSubArraySum([-1, 2, 3]), -1)

    # Extends test_minimum_spans_positive_element: crossing a positive is
    # worth it here: -3 + 1 - 3 = -5 beats -3.
    def test_cross_positive_beneficial(self):
        self.assertEqual(minSubArraySum([4, -3, 1, -3, 4]), -5)

    # Extends test_minimum_spans_positive_element: long runs across a big
    # positive. Runs of 100 -1s on each side of 150: crossing gives
    # -100 + 150 - 100 = -50, so one run alone, -100, is the minimum.
    def test_long_runs_around_big_positive(self):
        nums = [-1] * 100 + [150] + [-1] * 100
        self.assertEqual(minSubArraySum(nums), -100)

    # Extends test_minimum_spans_positive_element: crossing a smaller
    # positive pays: -100 + 50 - 100 = -150.
    def test_long_runs_around_small_positive(self):
        nums = [-1] * 100 + [50] + [-1] * 100
        self.assertEqual(minSubArraySum(nums), -150)

    # Large values with mixed signs: the middle pair sums to -2 * 10**18.
    def test_huge_values_mixed(self):
        nums = [10 ** 18, -(10 ** 18), -(10 ** 18), 10 ** 18]
        self.assertEqual(minSubArraySum(nums), -2 * 10 ** 18)

    # Larger size: [1, -2] * 200 (400 elements). Any sub-array has at most one
    # more -2 than 1, so the minimum is 200 * -2 + 199 * 1 = -201, from the
    # sub-array starting at index 1 and running to the end.
    def test_larger_alternating(self):
        self.assertEqual(minSubArraySum([1, -2] * 200), -201)

    # Random small inputs (fixed seed) checked against the brute force above.
    def test_random_against_brute_force(self):
        rng = random.Random(114)
        for _ in range(300):
            n = rng.randint(1, 12)
            nums = [rng.randint(-10, 10) for _ in range(n)]
            self.assertEqual(minSubArraySum(nums), brute_min(nums), nums)


if __name__ == "__main__":
    unittest.main()
