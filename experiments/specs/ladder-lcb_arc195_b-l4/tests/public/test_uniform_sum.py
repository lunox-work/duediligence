# Public tests for "Uniform Sum".
#
# spec.md gives only the input format and the Yes/No condition; it omits
# the operations, the constraints and the samples. These tests assume the
# operations of the original problem (AtCoder ARC195 B), applied in order:
#   1. rearrange the elements of A freely;
#   2. replace every -1 in A and in B with any non-negative integer;
# and its constraints: 2 <= N <= 2000, -1 <= A_i, B_i <= 10^9.
#
# Small cases take their expected answer from brute_force() below, which
# tries every permutation of A. Large cases are argued in their comments.
import itertools
import unittest

from sandbox.check import run_case


def brute_force(a, b):
    """Yes iff some rearrangement of A admits a common sum S >= 0.

    For a fixed pairing: a pair with both values known forces S to be its
    sum; a pair with one -1 needs S >= the known value; a pair of two -1s
    fits any S >= 0. With no forced S, S = the largest known value works."""
    for perm in itertools.permutations(a):
        forced = set()
        lower = 0
        for x, y in zip(perm, b):
            if x != -1 and y != -1:
                forced.add(x + y)
            elif x != -1:
                lower = max(lower, x)
            elif y != -1:
                lower = max(lower, y)
        if len(forced) > 1:
            continue
        if not forced or next(iter(forced)) >= lower:
            return "Yes"
    return "No"


def stdin_of(a, b):
    return f"{len(a)}\n{' '.join(map(str, a))}\n{' '.join(map(str, b))}\n"


class TestUniformSum(unittest.TestCase):
    def check_small(self, a, b):
        run_case(self, stdin=stdin_of(a, b), expected=brute_force(a, b))

    # Small cases, expected answer from brute_force().

    def test_mixed_with_blanks_in_both(self):
        # Yes: A -> 2 0 1 3 with B -> 3 5 4 2, every sum 5.
        self.check_small([2, 0, -1, 3], [3, -1, 4, 2])

    def test_no_blanks_impossible(self):
        # No: total 13 is not a multiple of 3.
        self.check_small([1, 2, 3], [1, 2, 4])

    def test_blank_cannot_go_negative(self):
        # No: the only matching sum 3 would need 3 - 4 = -1 in A.
        self.check_small([1, 2, -1], [1, 2, 4])

    def test_fixed_pairs_force_small_sum(self):
        # No: matching 5 with a 0 gives unequal fixed sums; otherwise the
        # fixed sum is 0 and 5 + x = 0 has no non-negative x.
        self.check_small([0, 0, 5], [0, 0, -1])

    def test_smallest_all_zero(self):
        self.check_small([0, 0], [0, 0])  # Yes, sum 0

    def test_smallest_no_blanks_mismatch(self):
        self.check_small([0, 1], [0, 0])  # No, total 1 is odd

    def test_smallest_all_blanks(self):
        self.check_small([-1, -1], [-1, -1])  # Yes, all zero

    def test_smallest_needs_rearrangement(self):
        self.check_small([0, 7], [0, 7])  # Yes, swap A: 7+0 = 0+7

    def test_max_values_no_blanks(self):
        # Yes, every sum 2 * 10^9.
        self.check_small([10**9, 10**9], [10**9, 10**9])

    def test_max_value_against_blank(self):
        # Yes: pair 10^9 with 0, then 0 + x = 10^9.
        self.check_small([10**9, 0], [0, -1])

    def test_max_value_one_off(self):
        # No: matchings give {10^9+1, 0} or {10^9, 1}.
        self.check_small([10**9, 1], [0, 0])

    # Largest N = 2000, argued directly.

    def test_largest_all_blanks(self):
        # Yes: set every -1 to 0.
        a = [-1] * 2000
        run_case(self, stdin=stdin_of(a, a), expected="Yes")

    def test_largest_max_values(self):
        # Yes: every sum is already 2 * 10^9.
        a = [10**9] * 2000
        run_case(self, stdin=stdin_of(a, a), expected="Yes")

    def test_largest_reversed_ramp(self):
        # Yes: A unchanged pairs i with 1999 - i, every sum 1999.
        a = list(range(2000))
        b = list(range(1999, -1, -1))
        run_case(self, stdin=stdin_of(a, b), expected="Yes")

    def test_largest_odd_total(self):
        # No: no blanks, so N * S would equal the total 1, impossible.
        a = [1] + [0] * 1999
        b = [0] * 2000
        run_case(self, stdin=stdin_of(a, b), expected="No")


if __name__ == "__main__":
    unittest.main()
