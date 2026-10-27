import itertools
import random
import unittest

from src.solution import pairs_sum_to_zero


def brute(l):
    # Obviously correct reference: try every pair of two different
    # positions. Only used on lists with at most one 0, where "two distinct
    # elements" is unambiguous (a pair x, -x with x != 0 has distinct values).
    return any(a + b == 0 for a, b in itertools.combinations(l, 2))


class TestPairsSumToZeroPrivate(unittest.TestCase):
    # Extends test_example_zero_alone_is_not_a_pair: a lone 0 must not pair
    # with itself, even when it is the only element (min+max == 0 or
    # "-x in set(l)" shortcuts return True here).
    def test_single_zero_alone(self):
        self.assertIs(pairs_sum_to_zero([0]), False)

    # Extends test_example_zero_alone_is_not_a_pair: 0 first, 0 + 5 == 5.
    def test_zero_with_one_positive(self):
        self.assertIs(pairs_sum_to_zero([0, 5]), False)

    # Extends test_distinct_boundary_single_zero_cannot_pair_with_itself:
    # 0 in the middle; pairs -1+0=-1, -1+2=1, 0+2=2.
    def test_zero_in_middle_no_pair(self):
        self.assertIs(pairs_sum_to_zero([-1, 0, 2]), False)

    # Extends test_integers_typical_zero_with_other_values: a single 0 plus a
    # real pair 7 + (-7) at the far end.
    def test_zero_plus_real_pair_at_end(self):
        self.assertIs(pairs_sum_to_zero([0, 1, 2, 3, 7, -7]), True)

    # Extends test_example_no_pair_with_negative: three values summing to
    # zero (1 + 2 + -3) are not a pair; pairs are 3, -2, -1. Catches
    # sum(l) == 0 shortcuts.
    def test_triple_sums_to_zero_but_no_pair(self):
        self.assertIs(pairs_sum_to_zero([1, 2, -3]), False)

    # Extends test_example_pair_present: total sum is nonzero (1+(-1)+5=5)
    # but a pair exists.
    def test_pair_present_total_sum_nonzero(self):
        self.assertIs(pairs_sum_to_zero([1, -1, 5]), True)

    # Extends test_example_pair_present: the same list reversed.
    def test_example_pair_present_reversed(self):
        self.assertIs(pairs_sum_to_zero([7, 5, 3, -5, 4, 2]), True)

    # Extends test_example_pair_present: every order of a list with exactly
    # one zero-sum pair (-5 + 5) must give True; check all 120 permutations.
    def test_pair_present_every_order(self):
        for perm in itertools.permutations([2, 4, -5, 3, 5]):
            self.assertIs(pairs_sum_to_zero(list(perm)), True, perm)

    # Extends test_example_no_pair_with_negative: every order of [1, 3, -2, 1]
    # stays False (pairs: 4, -1, 2, 1, 4, -1; none zero).
    def test_no_pair_every_order(self):
        for perm in itertools.permutations([1, 3, -2, 1]):
            self.assertIs(pairs_sum_to_zero(list(perm)), False, perm)

    # Extends test_pair_present_typical: the pair is non-adjacent and in the
    # interior (positions 1 and 3), so neither ends nor neighbours.
    def test_pair_in_interior_non_adjacent(self):
        self.assertIs(pairs_sum_to_zero([9, -6, 1, 6, 2]), True)

    # Extends test_pair_present_boundary_at_both_ends: pair is the last two
    # elements (catches loops that stop one short).
    def test_pair_last_two_elements(self):
        self.assertIs(pairs_sum_to_zero([1, 2, 3, 10, -10]), True)

    # Extends test_pair_present_boundary_at_both_ends: pair is the first two
    # elements.
    def test_pair_first_two_elements(self):
        self.assertIs(pairs_sum_to_zero([-10, 10, 1, 2, 3]), True)

    # Extends test_pair_present_boundary_at_both_ends: min + max != 0
    # (-10 + 7 = -3) but -4 + 4 == 0.
    def test_pair_not_min_and_max(self):
        self.assertIs(pairs_sum_to_zero([-10, 4, -4, 7]), True)

    # Extends test_pair_present_boundary_two_element_list: negative first.
    def test_two_elements_negative_first(self):
        self.assertIs(pairs_sum_to_zero([-1, 1]), True)

    # Extends test_no_pair_boundary_off_by_one: 5 + (-6) == -1.
    def test_two_elements_off_by_minus_one(self):
        self.assertIs(pairs_sum_to_zero([5, -6]), False)

    # Extends test_example_single_element: a single negative element.
    def test_single_negative_element(self):
        self.assertIs(pairs_sum_to_zero([-1]), False)

    # Extends test_example_all_positive: all negative, any two sum < 0.
    def test_all_negative(self):
        self.assertIs(pairs_sum_to_zero([-1, -2, -3, -7]), False)

    # Extends test_distinct_boundary_repeated_nonzero_values: two equal
    # nonzero values, 2 + 2 == 4.
    def test_two_equal_nonzero(self):
        self.assertIs(pairs_sum_to_zero([2, 2]), False)

    # Extends test_distinct_boundary_repeated_nonzero_values: repeated
    # negatives, -3 + -3 == -6.
    def test_repeated_negative_values(self):
        self.assertIs(pairs_sum_to_zero([-3, -3, -3, 1]), False)

    # Extends test_distinct_typical_repeated_value_with_its_negation: the
    # negative side is repeated instead.
    def test_repeated_negation_side(self):
        self.assertIs(pairs_sum_to_zero([-4, -4, 4]), True)

    # Extends test_no_pair_typical_mixed_signs: values whose absolute values
    # repeat with the same sign only; pairs give no zero (checked: every
    # positive is 1, 3 or 5 and every negative is -2, -4 or -6).
    def test_mixed_signs_disjoint_magnitudes(self):
        self.assertIs(pairs_sum_to_zero([1, -2, 3, -4, 5, -6, 1, -2]), False)

    # Extends test_integers_boundary_large_magnitudes: large values one apart,
    # 10**30 + (-(10**30) + 1) == 1.
    def test_large_magnitudes_no_pair(self):
        self.assertIs(pairs_sum_to_zero([10**30, -(10**30) + 1, 7]), False)

    # Extends test_integers_boundary_large_magnitudes: negative large first,
    # pair separated by others.
    def test_large_magnitudes_negative_first(self):
        self.assertIs(pairs_sum_to_zero([-(2**70), 3, 5, 2**70]), True)

    # Extends test_no_pair_boundary_empty_list / test_pair_present_typical:
    # larger list 1..2000 plus -2000; only 2000 + (-2000) is zero.
    def test_large_list_pair_at_far_end(self):
        l = list(range(1, 2001)) + [-2000]
        self.assertIs(pairs_sum_to_zero(l), True)

    # Same size, -2001 has no partner in 1..2000 and the positives sum
    # pairwise to > 0, -2001 + k <= -1.
    def test_large_list_no_pair(self):
        l = list(range(1, 2001)) + [-2001]
        self.assertIs(pairs_sum_to_zero(l), False)

    # Extends all public cases with random lists checked against the brute
    # force above; each list has at most one 0 so the answer is unambiguous.
    def test_random_against_brute_force(self):
        rng = random.Random(43)
        seen_true = seen_false = 0
        for _ in range(400):
            n = rng.randint(0, 12)
            l = [rng.randint(-15, 15) for _ in range(n)]
            first_zero = l.index(0) if 0 in l else -1
            l = [x if x != 0 or i == first_zero else 1
                 for i, x in enumerate(l)]
            expected = brute(l)
            seen_true += expected
            seen_false += not expected
            self.assertIs(pairs_sum_to_zero(l), expected, l)
        self.assertTrue(seen_true > 0 and seen_false > 0)


if __name__ == "__main__":
    unittest.main()
