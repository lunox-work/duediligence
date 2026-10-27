import unittest

from sandbox.check import run_case

# spec.md gives no sample cases. The small cases below have expected
# answers checked by an exhaustive search over every order of adjacent
# deletions (memoized recursion on the remaining tuple).
#
# The large cases use an upper bound: each operation scores at most
# 10^9 - 1, and there are at most floor(N/2) operations. Deleting the
# pairs (A_1, A_2), (A_3, A_4), ... from the left reaches that bound.


class TestAdjacentDelete(unittest.TestCase):
    def test_small_mixed_four(self):
        # Exhaustive search: (2,5) then (1,3) -> 3 + 2 = 5.
        run_case(self, stdin="4\n1 2 5 3\n", expected="5")

    def test_small_mixed_seven(self):
        # Exhaustive search gives 14.
        run_case(self, stdin="7\n3 1 4 1 5 9 2\n", expected="14")

    def test_all_equal_odd(self):
        # Every difference is 0.
        run_case(self, stdin="5\n1 1 1 1 1\n", expected="0")

    def test_nested_pairing_beats_adjacent(self):
        # (1,5) then (1,5) -> 8; the left-to-right pairs (1,1),(5,5) give 0.
        run_case(self, stdin="4\n1 1 5 5\n", expected="8")

    def test_min_n_extreme_values(self):
        # N = 2: the only operation scores |1 - 10^9|.
        run_case(self, stdin="2\n1 1000000000\n", expected="999999999")

    def test_min_n_equal_values(self):
        run_case(self, stdin="2\n7 7\n", expected="0")

    def test_n3_keep_middle_or_edge(self):
        # Delete (1, 10^9) and keep the first 1.
        run_case(self, stdin="3\n1 1 1000000000\n", expected="999999999")

    def test_n3_max_values_only(self):
        run_case(self, stdin="3\n1000000000 1000000000 1000000000\n", expected="0")

    def test_max_n_alternating_extremes(self):
        n = 300000
        a = [1 if i % 2 == 0 else 10**9 for i in range(n)]
        stdin = f"{n}\n{' '.join(map(str, a))}\n"
        # Reaches the bound above: 150000 * (10^9 - 1).
        run_case(self, stdin=stdin, expected=str(150000 * 999999999))

    def test_large_odd_n_alternating_extremes(self):
        n = 299999
        a = [1 if i % 2 == 0 else 10**9 for i in range(n)]
        stdin = f"{n}\n{' '.join(map(str, a))}\n"
        # Reaches the bound above: 149999 * (10^9 - 1); the final 1 is left over.
        run_case(self, stdin=stdin, expected=str(149999 * 999999999))

    def test_max_n_all_max_value(self):
        n = 300000
        stdin = f"{n}\n{' '.join(['1000000000'] * n)}\n"
        run_case(self, stdin=stdin, expected="0")


if __name__ == "__main__":
    unittest.main()
