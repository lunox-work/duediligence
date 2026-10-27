import random
import unittest

from src.solution import monotonic


def _distinct_monotonic(xs):
    # Brute force for lists with no equal neighbours, where strict and
    # non-strict monotonicity agree: every step up, or every step down.
    pairs = list(zip(xs, xs[1:]))
    return all(a < b for a, b in pairs) or all(a > b for a, b in pairs)


class TestMonotonicPrivate(unittest.TestCase):
    # Equal neighbours are only used where the answer is False under both
    # the strict and the non-strict reading (the list goes both up and down).

    # Empty list: no pairs to compare, so it is vacuously increasing and
    # decreasing, strict or not.
    def test_empty_list(self):
        self.assertIs(monotonic([]), True)

    # Extends test_single_element_boundary: other values (negative, zero, float).
    def test_single_negative(self):
        self.assertIs(monotonic([-42]), True)

    def test_single_zero(self):
        self.assertIs(monotonic([0]), True)

    def test_single_float(self):
        self.assertIs(monotonic([3.5]), True)

    # Extends test_example_increasing: first and last compared only would
    # say increasing (1 < 10), but 5 > 3 goes down in the middle.
    def test_first_last_shortcut_increasing(self):
        self.assertIs(monotonic([1, 5, 3, 10]), False)

    # Extends test_example_decreasing: first > last (10 > 1), but 3 < 5 goes up.
    def test_first_last_shortcut_decreasing(self):
        self.assertIs(monotonic([10, 3, 5, 1]), False)

    # Extends test_example_not_monotonic: first == last, up then down.
    def test_first_equals_last_peak(self):
        self.assertIs(monotonic([1, 3, 1]), False)

    # Extends test_example_not_monotonic: first == last, down then up.
    def test_first_equals_last_valley(self):
        self.assertIs(monotonic([4, 0, 4]), False)

    # Extends test_not_monotonic_boundary_shortest: the other three-element
    # orderings of distinct values that are not monotonic.
    def test_three_valley_down_up(self):
        # 3 > 1 down, 1 < 2 up.
        self.assertIs(monotonic([3, 1, 2]), False)

    def test_three_peak_rise_fall_below_start(self):
        # 2 < 3 up, 3 > 1 down.
        self.assertIs(monotonic([2, 3, 1]), False)

    def test_three_valley_end_above_start(self):
        # 2 > 1 down, 1 < 3 up.
        self.assertIs(monotonic([2, 1, 3]), False)

    # Extends test_increasing_boundary_two_elements / test_decreasing...:
    # three-element monotonic orderings.
    def test_three_increasing(self):
        self.assertIs(monotonic([1, 2, 3]), True)

    def test_three_decreasing(self):
        self.assertIs(monotonic([3, 2, 1]), True)

    # Extends test_not_monotonic_boundary_break_at_last_step: decreasing
    # until the last step, which goes up (2 < 10).
    def test_decreasing_break_at_last_step(self):
        self.assertIs(monotonic([5, 4, 3, 2, 10]), False)

    # Extends test_not_monotonic_boundary_break_at_last_step: break at the
    # first step only; 5 > 1 down, then 1 < 2 < 3 < 4 up. An implementation
    # that infers direction from the last steps or the majority gets it wrong.
    def test_break_at_first_step_then_increasing(self):
        self.assertIs(monotonic([5, 1, 2, 3, 4]), False)

    def test_break_at_first_step_then_decreasing(self):
        # 0 < 9 up, then 9 > 8 > 7 > 6 down.
        self.assertIs(monotonic([0, 9, 8, 7, 6]), False)

    # Extends test_not_monotonic_typical: a single break deep in the middle
    # of an otherwise increasing list (6 > 4).
    def test_break_in_middle_of_long_increasing(self):
        self.assertIs(monotonic([1, 2, 3, 4, 5, 6, 4, 7, 8, 9]), False)

    # Extends test_decreasing_typical: a single break in the middle of an
    # otherwise decreasing list (5 < 7).
    def test_break_in_middle_of_long_decreasing(self):
        self.assertIs(monotonic([10, 9, 8, 7, 5, 7, 4, 3, 2, 1]), False)

    # Extends test_decreasing_typical: all negative values; a shortcut that
    # compares absolute values sees |-1| < |-2| < ... as increasing in magnitude
    # but the list goes down: -1 > -2 > -3 > -40.
    def test_decreasing_all_negative(self):
        self.assertIs(monotonic([-1, -2, -3, -40]), True)

    # Extends test_increasing_typical: all negative increasing,
    # -100 < -50 < -2 < -1.
    def test_increasing_all_negative(self):
        self.assertIs(monotonic([-100, -50, -2, -1]), True)

    # Extends test_not_monotonic_typical: negatives where magnitudes are
    # monotonic but values are not: -1 > -5 down, -5 < 10 up.
    def test_not_monotonic_sign_change(self):
        self.assertIs(monotonic([-1, -5, 10]), False)

    # Extends test_increasing_typical: floats, 0.1 < 0.2 < 0.30000001 < 1.5.
    def test_increasing_floats(self):
        self.assertIs(monotonic([0.1, 0.2, 0.30000001, 1.5]), True)

    # Extends test_decreasing_typical: floats, 2.5 > 0.5 > -0.25 > -7.75.
    def test_decreasing_floats(self):
        self.assertIs(monotonic([2.5, 0.5, -0.25, -7.75]), True)

    # Extends test_not_monotonic_typical: floats, 0.5 > -0.5 down, -0.5 < 0.25 up.
    def test_not_monotonic_floats(self):
        self.assertIs(monotonic([0.5, -0.5, 0.25]), False)

    # Extends test_increasing_typical: very large ints, adjacent values one apart.
    def test_increasing_big_ints(self):
        big = 10 ** 30
        self.assertIs(monotonic([big, big + 1, big + 2]), True)

    def test_not_monotonic_big_ints(self):
        big = 10 ** 30
        # big + 2 > big + 1 goes down after big < big + 2 goes up.
        self.assertIs(monotonic([big, big + 2, big + 1]), False)

    # Extends test_increasing_boundary_two_elements: other two-element lists.
    def test_two_negative_increasing(self):
        self.assertIs(monotonic([-10, -3]), True)

    def test_two_negative_decreasing(self):
        self.assertIs(monotonic([-3, -10]), True)

    # Duplicates where the list goes both up and down, so it is
    # non-monotonic whether or not equal neighbours are allowed.
    def test_duplicates_up_flat_down(self):
        # 1 < 2 up, 2 == 2, 2 > 1 down.
        self.assertIs(monotonic([1, 2, 2, 1]), False)

    def test_duplicates_flat_down_up(self):
        # 3 == 3, 3 > 1 down, 1 < 3 up.
        self.assertIs(monotonic([3, 3, 1, 3]), False)

    def test_duplicates_flat_start_then_zigzag(self):
        # 5 == 5, then 5 < 6 up, 6 > 4 down.
        self.assertIs(monotonic([5, 5, 6, 4]), False)

    # Extends test_increasing_typical: larger size, 0 < 1 < ... < 999.
    def test_long_increasing(self):
        self.assertIs(monotonic(list(range(1000))), True)

    # Extends test_decreasing_typical: larger size, 999 > 998 > ... > 0.
    def test_long_decreasing(self):
        self.assertIs(monotonic(list(range(999, -1, -1))), True)

    # Extends test_not_monotonic_boundary_break_at_last_step: long increasing
    # list with the last two elements swapped (998 > 997 at the end).
    def test_long_increasing_last_pair_swapped(self):
        xs = list(range(1000))
        xs[-1], xs[-2] = xs[-2], xs[-1]
        self.assertIs(monotonic(xs), False)

    # Long decreasing list with the first two elements swapped
    # (998 < 999 at the start, then down).
    def test_long_decreasing_first_pair_swapped(self):
        xs = list(range(999, -1, -1))
        xs[0], xs[1] = xs[1], xs[0]
        self.assertIs(monotonic(xs), False)

    # Extends test_not_monotonic_typical: random distinct lists checked
    # against the brute force above (distinct values, so strictness is moot).
    def test_random_distinct_lists_against_brute_force(self):
        rng = random.Random(57)
        for _ in range(300):
            n = rng.randint(0, 8)
            xs = rng.sample(range(-20, 21), n)
            self.assertIs(monotonic(xs), _distinct_monotonic(xs), xs)

    # Random sorted distinct lists, both directions: always True.
    def test_random_sorted_distinct_lists(self):
        rng = random.Random(570)
        for _ in range(100):
            n = rng.randint(2, 30)
            xs = sorted(rng.sample(range(-1000, 1001), n))
            self.assertIs(monotonic(xs), True, xs)
            self.assertIs(monotonic(xs[::-1]), True, xs[::-1])


if __name__ == "__main__":
    unittest.main()
