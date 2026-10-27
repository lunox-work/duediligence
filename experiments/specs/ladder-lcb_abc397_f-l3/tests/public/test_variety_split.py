# Public tests for "Variety Split Hard" (spec.md).
#
# The statement gives no samples and no explicit constraints. The only
# bound it implies is N >= 3 (three non-empty pieces). Every case below
# keeps N small and every value in 1..N, so it stays inside any
# reasonable reading of the input domain.
import unittest

from sandbox.check import run_case


def brute(a):
    """Try every pair of cuts and count distinct values directly.
    O(N^3); only used on tiny inputs where it is obviously correct."""
    n = len(a)
    best = 0
    for i in range(1, n - 1):
        for j in range(i + 1, n):
            total = len(set(a[:i])) + len(set(a[i:j])) + len(set(a[j:]))
            best = max(best, total)
    return best


def case(a):
    return f"{len(a)}\n{' '.join(map(str, a))}\n"


class TestVarietySplit(unittest.TestCase):
    def test_smallest_n_all_equal(self):
        # N = 3: the only split is [1][1][1], each piece has 1 distinct value.
        run_case(self, stdin="3\n1 1 1\n", expected="3")

    def test_smallest_n_all_distinct(self):
        # N = 3: the only split is [1][2][3] -> 1 + 1 + 1.
        run_case(self, stdin="3\n1 2 3\n", expected="3")

    def test_all_equal(self):
        # Every non-empty piece of a constant sequence has exactly 1
        # distinct value, so any split gives 3.
        run_case(self, stdin="6\n4 4 4 4 4 4\n", expected="3")

    def test_all_distinct(self):
        # With all values distinct every split counts each element once,
        # so the total is N.
        run_case(self, stdin="6\n6 1 5 2 4 3\n", expected="6")

    def test_repeat_split_across_pieces(self):
        # [3] [1 4] [1 5] -> 1 + 2 + 2 = 5. The total can never exceed
        # N = 5, so 5 is the maximum.
        run_case(self, stdin="5\n3 1 4 1 5\n", expected="5")

    def test_value_appearing_three_times(self):
        # The value 1 appears three times and lands in every piece:
        # [1 2] [1] [1] -> 2 + 1 + 1 = 4, and the total can never exceed N = 4.
        run_case(self, stdin="4\n1 2 1 1\n", expected="4")

    def test_two_values_alternating(self):
        # Each piece holds at most 2 distinct values, so the total is at
        # most 6; [1 2] [1 2] [1 2] reaches it.
        run_case(self, stdin="6\n1 2 1 2 1 2\n", expected="6")

    def test_duplicates_at_ends(self):
        # Hand check: [1] [2 3] [1] = 1 + 2 + 1 = 4 = N.
        run_case(self, stdin="4\n1 2 3 1\n", expected="4")

    def test_brute_force_small_mixed(self):
        # Expected value computed by the brute force above.
        a = [2, 5, 6, 4, 4, 1, 1, 3, 1, 4]
        run_case(self, stdin=case(a), expected=str(brute(a)))

    def test_brute_force_many_repeats(self):
        # Expected value computed by the brute force above.
        a = [3, 3, 1, 2, 3, 1, 1, 2, 2, 3, 1, 3]
        run_case(self, stdin=case(a), expected=str(brute(a)))

    def test_brute_force_block_structure(self):
        # Expected value computed by the brute force above.
        a = [1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 5, 6, 7, 1, 7]
        run_case(self, stdin=case(a), expected=str(brute(a)))


if __name__ == "__main__":
    unittest.main()
