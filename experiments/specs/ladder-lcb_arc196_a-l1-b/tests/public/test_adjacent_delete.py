import unittest
from functools import lru_cache

from sandbox.check import run_case


def brute_force(values):
    """Exhaustive search over every order of operations: try removing each
    adjacent pair, recurse on what is left, stop at length <= 1. Only used
    on tiny inputs, where it is obviously correct."""

    @lru_cache(maxsize=None)
    def best(seq):
        if len(seq) <= 1:
            return 0
        return max(
            abs(seq[i] - seq[i + 1]) + best(seq[:i] + seq[i + 2:])
            for i in range(len(seq) - 1)
        )

    return best(tuple(values))


def stdin_for(values):
    return f"{len(values)}\n{' '.join(map(str, values))}\n"


class TestAdjacentDelete(unittest.TestCase):
    # Samples from the statement.

    def test_sample_1(self):
        run_case(self, stdin="4\n1 2 5 3\n", expected="5")

    def test_sample_2(self):
        run_case(self, stdin="7\n3 1 4 1 5 9 2\n", expected="14")

    def test_sample_3(self):
        run_case(self, stdin="5\n1 1 1 1 1\n", expected="0")

    # Smallest input: N = 2 allows exactly one operation on the only pair.

    def test_min_n_equal_values(self):
        run_case(self, stdin="2\n7 7\n", expected="0")

    def test_min_n_extreme_values(self):
        # |1 - 10^9| = 999999999
        run_case(self, stdin="2\n1 1000000000\n", expected="999999999")

    def test_min_n_max_values(self):
        run_case(self, stdin="2\n1000000000 1000000000\n", expected="0")

    # N = 3: one operation, on (A1, A2) or (A2, A3); one element is left over.

    def test_n3_choose_better_pair(self):
        # max(|5 - 1|, |1 - 2|) = 4
        run_case(self, stdin="3\n5 1 2\n", expected="4")

    def test_n3_extreme_middle(self):
        # Either pair scores |1 - 10^9| = 999999999.
        run_case(self, stdin="3\n1 1000000000 1\n", expected="999999999")

    # Small cases checked against the exhaustive brute force above.

    def test_brute_force_n4(self):
        values = [4, 1, 1, 4]
        run_case(self, stdin=stdin_for(values), expected=str(brute_force(values)))

    def test_brute_force_n5(self):
        values = [9, 2, 7, 1, 8]
        run_case(self, stdin=stdin_for(values), expected=str(brute_force(values)))

    def test_brute_force_n6(self):
        values = [1, 5, 2, 8, 3, 9]
        run_case(self, stdin=stdin_for(values), expected=str(brute_force(values)))

    def test_brute_force_n7(self):
        values = [10, 1, 1, 1, 1, 1, 10]
        run_case(self, stdin=stdin_for(values), expected=str(brute_force(values)))

    def test_brute_force_n8(self):
        values = [3, 14, 15, 92, 65, 35, 89, 79]
        run_case(self, stdin=stdin_for(values), expected=str(brute_force(values)))

    def test_brute_force_n9(self):
        values = [1000000000, 1, 999999999, 2, 5, 1000000000, 1, 7, 3]
        run_case(self, stdin=stdin_for(values), expected=str(brute_force(values)))

    # Largest values and largest N. Each operation scores at most
    # 10^9 - 1 and at most floor(N / 2) operations happen, so
    # floor(N / 2) * (10^9 - 1) is an upper bound; alternating 1 and 10^9
    # reaches it by removing (A1, A2), (A3, A4), ... in turn.

    def test_alternating_extremes_n4(self):
        # 2 * 999999999
        run_case(self, stdin="4\n1 1000000000 1 1000000000\n", expected="1999999998")

    def test_max_n_alternating_extremes(self):
        n = 300000
        values = [1 if i % 2 == 0 else 1000000000 for i in range(n)]
        # 150000 * 999999999 = 149999999850000
        run_case(self, stdin=stdin_for(values), expected="149999999850000")

    def test_odd_large_n_alternating_extremes(self):
        n = 299999
        values = [1 if i % 2 == 0 else 1000000000 for i in range(n)]
        # 149999 * 999999999 = 149998999850001
        run_case(self, stdin=stdin_for(values), expected="149998999850001")

    def test_max_n_all_equal(self):
        # Every difference is 0.
        values = [1000000000] * 300000
        run_case(self, stdin=stdin_for(values), expected="0")


if __name__ == "__main__":
    unittest.main()
