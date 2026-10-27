import random
import unittest

from src.solution import has_close_elements


def brute_force(numbers, threshold):
    # Direct reading of the docstring: some two entries (distinct positions)
    # whose absolute difference is strictly less than the threshold.
    n = len(numbers)
    return any(
        abs(numbers[i] - numbers[j]) < threshold
        for i in range(n)
        for j in range(i + 1, n)
    )


# Values are integers, halves and quarters (exact in binary floating point)
# unless noted, so every distance is computed exactly.
class TestHasCloseElementsPrivate(unittest.TestCase):
    # Extends test_docstring_example_no_close_pair: same list, threshold
    # raised past the spacing of 1.0, so pairs become close.
    def test_docstring_list_threshold_above_spacing(self):
        # |1.0 - 2.0| = 1.0 < 1.25.
        self.assertIs(has_close_elements([1.0, 2.0, 3.0], 1.25), True)

    # Extends test_docstring_example_no_close_pair: threshold exactly the
    # spacing; every pair is at distance >= 1.0, none strictly below.
    def test_docstring_list_threshold_equal_spacing(self):
        self.assertIs(has_close_elements([1.0, 2.0, 3.0], 1.0), False)

    # Extends test_docstring_example_close_pair: same list reordered so the
    # close pair (2.75, 3.0) sits at the two ends.
    def test_close_pair_at_both_ends_reordered(self):
        # Adjacent gaps: 3.75, 1.0, 1.0, 1.0, 2.0; first/last differ by 0.25.
        self.assertIs(
            has_close_elements([2.75, 1.0, 2.0, 4.0, 5.0, 3.0], 0.5), True
        )

    # Extends test_docstring_example_close_pair: same list with threshold
    # lowered below the smallest gap (0.25 with exact values), so False.
    def test_close_pair_list_threshold_below_min_gap(self):
        # Sorted: 1, 2, 2.75, 3, 4, 5 -> smallest gap 0.25, not < 0.25.
        self.assertIs(
            has_close_elements([1.0, 2.75, 3.0, 4.0, 5.0, 2.0], 0.25), False
        )

    # Extends test_close_pair_typical: close pair in the middle of a longer
    # list, involving neither the first nor the last element.
    def test_close_pair_in_middle_only(self):
        # Only close pair: |20.0 - 20.25| = 0.25 < 1.0 at indices 2 and 4;
        # every other pair differs by at least 9.75.
        self.assertIs(
            has_close_elements([0.0, 10.0, 20.0, 30.0, 20.25, 40.0], 1.0), True
        )

    # Extends test_close_pair_typical: the first compared pair is far apart,
    # so an implementation that decides after one comparison fails.
    def test_first_pair_far_later_pair_close(self):
        # |0 - 100| far; |50.0 - 50.5| = 0.5 < 1.0.
        self.assertIs(
            has_close_elements([0.0, 100.0, 50.0, 50.5], 1.0), True
        )

    # Extends test_close_pair_distance_just_under_threshold: negative values.
    def test_close_pair_negative_values(self):
        # |-3.0 - (-2.75)| = 0.25 < 0.5.
        self.assertIs(has_close_elements([-3.0, -2.75], 0.5), True)

    # Extends test_close_pair_distance_just_under_threshold: tiny gap, large
    # magnitudes (1e15 + 0.5 is exact since 1e15 < 2**52).
    def test_close_pair_large_magnitude(self):
        self.assertIs(has_close_elements([1e15, 1e15 + 0.5], 1.0), True)

    # Extends test_close_pair_not_adjacent: close pair far apart in index in
    # a longer list, defeating a check of only nearby positions.
    def test_close_pair_far_apart_in_index(self):
        # |1.0 - 1.25| = 0.25 < 0.5 at indices 0 and 5; other gaps >= 8.75.
        self.assertIs(
            has_close_elements([1.0, 10.0, 20.0, 30.0, 40.0, 1.25], 0.5), True
        )

    # Extends test_close_pair_not_adjacent: unsorted list where no two
    # positions-adjacent entries are close, nor first/last.
    def test_close_pair_unsorted_hidden(self):
        # Close pair: |7.0 - 7.25| = 0.25 at indices 1 and 3.
        # Adjacent gaps: 7, 7, 6.75, 13.75; first/last: |0 - 21| = 21.
        self.assertIs(
            has_close_elements([0.0, 7.0, 14.0, 7.25, 21.0], 0.5),
            True,
        )

    # Extends test_equal_values_are_close: many identical values.
    def test_all_identical_values(self):
        self.assertIs(has_close_elements([4.5] * 10, 0.25), True)

    # Extends test_equal_values_are_close: duplicate pair with threshold 0;
    # distance 0 is not strictly less than 0.
    def test_duplicates_threshold_zero_not_close(self):
        self.assertIs(has_close_elements([3.0, 3.0], 0.0), False)

    # Extends test_equal_values_are_close: duplicate pair with a tiny
    # positive threshold; 0 < 1e-9 regardless of 1e-9's representation.
    def test_duplicates_tiny_threshold_close(self):
        self.assertIs(has_close_elements([3.0, 9.0, 3.0], 1e-9), True)

    # Extends test_far_apart_typical: descending order, so a signed
    # difference (later - earlier) would be negative and wrongly "close".
    def test_far_apart_descending(self):
        # Smallest gap 2.0, not < 1.5.
        self.assertIs(has_close_elements([6.0, 2.0, 0.0, -4.0], 1.5), False)

    # Extends test_far_apart_typical: ascending order, so a signed
    # difference (earlier - later) would be negative and wrongly "close".
    def test_far_apart_ascending(self):
        self.assertIs(has_close_elements([-4.0, 0.0, 2.0, 6.0], 1.75), False)

    # Extends test_far_apart_typical: opposite signs of equal magnitude;
    # comparing magnitudes instead of values would call them equal.
    def test_opposite_signs_not_close(self):
        # |-1.0 - 1.0| = 2.0, not < 0.5.
        self.assertIs(has_close_elements([-1.0, 1.0], 0.5), False)

    # Extends test_far_apart_typical: large evenly spaced list, no pair close.
    def test_large_evenly_spaced_far(self):
        # 1000 values 0, 2, 4, ...; smallest gap 2.0, not < 1.5.
        numbers = [2.0 * k for k in range(1000)]
        random.Random(1).shuffle(numbers)
        self.assertIs(has_close_elements(numbers, 1.5), False)

    # Extends test_distance_equal_to_threshold_is_not_close: several pairs
    # all exactly at the threshold.
    def test_many_pairs_at_threshold_not_close(self):
        # Gaps are all exactly 0.5; non-adjacent gaps are larger.
        self.assertIs(
            has_close_elements([1.5, 0.0, 1.0, 0.5], 0.5), False
        )

    # Extends test_distance_equal_to_threshold_is_not_close: across zero.
    def test_opposite_signs_at_threshold_not_close(self):
        # |-1.0 - 1.0| = 2.0, not < 2.0.
        self.assertIs(has_close_elements([-1.0, 1.0], 2.0), False)

    # Extends test_distance_equal_to_threshold_is_not_close: across zero,
    # threshold just above the distance.
    def test_opposite_signs_above_threshold_close(self):
        # |-1.0 - 1.0| = 2.0 < 2.25.
        self.assertIs(has_close_elements([1.0, -1.0], 2.25), True)

    # Extends test_distance_equal_to_threshold_is_not_close: large list
    # where every adjacent gap equals the threshold.
    def test_large_list_all_gaps_at_threshold(self):
        # 1000 values k * 0.25; smallest gap 0.25, not < 0.25.
        numbers = [0.25 * k for k in range(1000)]
        random.Random(2).shuffle(numbers)
        self.assertIs(has_close_elements(numbers, 0.25), False)

    # Extends test_distance_equal_to_threshold_is_not_close: same large
    # list with one extra value placed inside a gap.
    def test_large_list_one_inserted_close_value(self):
        # 100.125 is 0.125 from 100.0 and 100.25, which is < 0.25.
        numbers = [0.25 * k for k in range(1000)] + [100.125]
        random.Random(3).shuffle(numbers)
        self.assertIs(has_close_elements(numbers, 0.25), True)

    # Extends test_single_element: a single element with a
    # negative value; still no pair.
    def test_single_negative_element(self):
        self.assertIs(has_close_elements([-5.0], 1.0), False)

    # Extends test_single_element: two elements is the smallest list that
    # can contain a pair.
    def test_two_elements_close(self):
        self.assertIs(has_close_elements([0.0, 0.5], 1.0), True)

    # Extends test_empty_list: empty list with a huge threshold.
    def test_empty_list_huge_threshold(self):
        self.assertIs(has_close_elements([], 1e300), False)

    # Rule: distances are non-negative, so a negative threshold can never be
    # exceeded from below. Defeats a missing abs().
    def test_negative_threshold_never_close(self):
        self.assertIs(has_close_elements([1.0, 1.0, 5.0, 2.0], -1.0), False)

    # Rule: threshold 0 makes nothing close among distinct values.
    def test_threshold_zero_distinct_values(self):
        self.assertIs(has_close_elements([1.0, 2.0, 3.0], 0.0), False)

    # Rule: a very large threshold makes any two values close.
    def test_huge_threshold_any_pair_close(self):
        self.assertIs(has_close_elements([-1000.0, 1000.0], 1e9), True)

    # Rule check against brute force on many random small lists of quarter
    # values (exact arithmetic), shuffled order, with negatives and
    # duplicates; expected value from brute_force above.
    def test_random_lists_match_brute_force(self):
        rng = random.Random(12345)
        for _ in range(300):
            n = rng.randint(0, 12)
            numbers = [rng.randint(-80, 80) / 4.0 for _ in range(n)]
            threshold = rng.randint(0, 40) / 4.0
            expected = brute_force(numbers, threshold)
            self.assertIs(
                has_close_elements(list(numbers), threshold),
                expected,
                msg=f"numbers={numbers}, threshold={threshold}",
            )

    # Result must not depend on order: every permutation of a small list
    # gives the same answer (brute force on the original list).
    def test_order_independence_permutations(self):
        import itertools
        base = [5.0, -2.0, 3.5, 3.0, 9.0]
        for threshold, expected in ((0.5, False), (0.75, True)):
            # Smallest gap is |3.5 - 3.0| = 0.5.
            self.assertIs(brute_force(base, threshold), expected)
            for perm in itertools.permutations(base):
                self.assertIs(
                    has_close_elements(list(perm), threshold),
                    expected,
                    msg=f"perm={perm}, threshold={threshold}",
                )


if __name__ == "__main__":
    unittest.main()
