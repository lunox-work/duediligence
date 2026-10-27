# Public tests for "Adjacent Delete" (spec.md).
#
# The statement carries no sample cases and no constraints section, so
# every case here uses a tiny N and small positive integers. Expected
# answers are either derived by hand (shown in the comment) or computed
# by `brute`, an exhaustive search over every order of deletions.
import unittest
from functools import lru_cache

from sandbox.check import run_case


@lru_cache(maxsize=None)
def brute(seq):
    """Maximum total score for the tuple `seq`, trying every adjacent pair
    to remove at every step until at most one element is left."""
    if len(seq) <= 1:
        return 0
    return max(
        abs(seq[i] - seq[i + 1]) + brute(seq[:i] + seq[i + 2:])
        for i in range(len(seq) - 1)
    )


def stdin_for(values):
    return f"{len(values)}\n{' '.join(map(str, values))}\n"


class TestAdjacentDelete(unittest.TestCase):
    def test_single_element_no_operation(self):
        # Length is already at most 1: no operation is performed, score 0.
        run_case(self, stdin="1\n5\n", expected="0")

    def test_two_elements(self):
        # The only operation removes both: |3 - 8| = 5.
        run_case(self, stdin="2\n3 8\n", expected="5")

    def test_two_equal_elements(self):
        # The only operation removes both: |7 - 7| = 0.
        run_case(self, stdin="2\n7 7\n", expected="0")

    def test_three_elements_choose_better_pair(self):
        # Remove (1,5) for 4, or (5,2) for 3; one element stays. Max 4.
        run_case(self, stdin="3\n1 5 2\n", expected="4")

    def test_four_elements_inner_pair_first(self):
        # (1,2)+(5,3) = 1+2 = 3; (2,5) then (1,3) = 3+2 = 5;
        # (5,3)+(1,2) = 2+1 = 3. Max 5.
        run_case(self, stdin="4\n1 2 5 3\n", expected="5")

    def test_all_equal(self):
        # Every pair has difference 0, so every total is 0.
        run_case(self, stdin="5\n1 1 1 1 1\n", expected="0")

    def test_seven_mixed(self):
        # Expected computed by exhaustive search.
        values = (3, 1, 4, 1, 5, 9, 2)
        run_case(self, stdin=stdin_for(values), expected=str(brute(values)))

    def test_odd_length_leftover_in_middle(self):
        # Expected computed by exhaustive search.
        values = (10, 1, 1, 1, 10)
        run_case(self, stdin=stdin_for(values), expected=str(brute(values)))

    def test_even_length_nonadjacent_pairing(self):
        # Expected computed by exhaustive search.
        values = (1, 1, 9, 9, 1, 1)
        run_case(self, stdin=stdin_for(values), expected=str(brute(values)))

    def test_eight_alternating(self):
        # Expected computed by exhaustive search.
        values = (2, 7, 1, 8, 2, 8, 1, 8)
        run_case(self, stdin=stdin_for(values), expected=str(brute(values)))

    def test_eight_sorted(self):
        # Expected computed by exhaustive search.
        values = (1, 2, 3, 4, 5, 6, 7, 8)
        run_case(self, stdin=stdin_for(values), expected=str(brute(values)))


if __name__ == "__main__":
    unittest.main()
