# Public tests for "Adjacent Delete".
#
# spec.md gives only the title and the I/O format. Title and format match
# AtCoder ARC196 A, whose rules these tests assume:
#   Repeatedly pick two adjacent elements x, y of A, remove both (the rest
#   closes up), and score |x - y|, until at most one element remains.
#   Print the maximum total score.
#   Constraints: 2 <= N <= 3 * 10^5, 1 <= A_i <= 10^9.
# Cases not taken from the samples get their expected answer from
# `brute` below (exhaustive search over every removal order, tiny N only)
# or from the argument given in the comment.
import unittest
from functools import lru_cache

from sandbox.check import run_case

MAX_N = 300_000
MAX_A = 10**9


@lru_cache(maxsize=None)
def brute(a):
    """Best total score for tuple `a`, by trying every adjacent pair at every step."""
    if len(a) <= 1:
        return 0
    return max(abs(a[i] - a[i + 1]) + brute(a[:i] + a[i + 2:]) for i in range(len(a) - 1))


def stdin_for(a):
    return f"{len(a)}\n{' '.join(map(str, a))}\n"


class TestAdjacentDelete(unittest.TestCase):
    # --- Samples ---

    def test_sample_1(self):
        run_case(self, stdin="4\n1 2 5 3\n", expected="5")

    def test_sample_2(self):
        run_case(self, stdin="7\n3 1 4 1 5 9 2\n", expected="14")

    def test_sample_3(self):
        run_case(self, stdin="5\n1 1 1 1 1\n", expected="0")

    # --- Boundaries ---

    def test_min_n_equal_values(self):
        # N = 2: the only move scores |1 - 1| = 0.
        run_case(self, stdin="2\n1 1\n", expected="0")

    def test_min_n_extreme_values(self):
        # N = 2: the only move scores |1 - 10^9|.
        run_case(self, stdin="2\n1 1000000000\n", expected="999999999")

    def test_min_n_extreme_values_reversed(self):
        run_case(self, stdin="2\n1000000000 1\n", expected="999999999")

    def test_n3_middle_cannot_be_left(self):
        # N = 3: removing (1,2) leaves A_3 and removing (2,3) leaves A_1, so
        # the middle element is always paired; the score is |100 - 5| = 95.
        a = (5, 100, 5)
        self.assertEqual(brute(a), 95)
        run_case(self, stdin=stdin_for(a), expected=str(brute(a)))

    def test_n3_max_values(self):
        # Same reasoning: either pair scores |10^9 - 1|.
        a = (MAX_A, 1, MAX_A)
        run_case(self, stdin=stdin_for(a), expected=str(brute(a)))

    def test_odd_alternating(self):
        # Exhaustive search gives 198 (two pairs of |100 - 1|, a 1 left over).
        a = (1, 100, 1, 100, 1)
        self.assertEqual(brute(a), 198)
        run_case(self, stdin=stdin_for(a), expected=str(brute(a)))

    def test_small_even_brute(self):
        a = (7, 2, 9, 4, 4, 1, 8, 3)
        run_case(self, stdin=stdin_for(a), expected=str(brute(a)))

    def test_small_odd_brute(self):
        a = (6, 1, 8, 2, 9, 3, 5)
        run_case(self, stdin=stdin_for(a), expected=str(brute(a)))

    def test_small_odd_brute_large_values(self):
        a = (MAX_A, 1, 500000000, MAX_A, 2, 999999999, 3)
        run_case(self, stdin=stdin_for(a), expected=str(brute(a)))

    # --- Largest input ---

    def test_max_n_all_equal(self):
        # Every difference is 0, so every total is 0.
        a = (MAX_A,) * MAX_N
        run_case(self, stdin=stdin_for(a), expected="0")

    def test_max_n_alternating_extremes(self):
        # One move never scores more than 10^9 - 1, and N/2 moves are made, so
        # the total is at most N/2 * (10^9 - 1). Removing the first two
        # elements each time pairs 1 with 10^9 every time, which reaches it.
        a = (1, MAX_A) * (MAX_N // 2)
        run_case(self, stdin=stdin_for(a), expected=str(MAX_N // 2 * (MAX_A - 1)))


if __name__ == "__main__":
    unittest.main()
