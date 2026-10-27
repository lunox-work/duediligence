import unittest

from sandbox.check import run_case

# Facts used for non-sample answers, all from the statement:
# - Operations A and B are inverses of each other, so reachability is symmetric.
# - Both operations keep the number of 0s, so differing counts mean No.
# - When X + Y > N no index i exists, so the answer is Yes exactly when S == T.
# - With X = Y = 1 the operations are swaps of adjacent "01"/"10", which can
#   reach every arrangement with the same counts.
# Small cases were also confirmed by a breadth-first search over all reachable
# strings.


class TestPublic(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="9 2 1\n000111001\n011000011\n", expected="Yes\n")

    def test_sample_2(self):
        run_case(self, stdin="1 1 1\n0\n1\n", expected="No\n")

    def test_sample_1_reversed(self):
        # Operations are inverses, so T -> S is possible because S -> T is.
        run_case(self, stdin="9 2 1\n011000011\n000111001\n", expected="Yes\n")

    def test_smallest_identical(self):
        # Zero operations suffice.
        run_case(self, stdin="1 1 1\n1\n1\n", expected="Yes\n")

    def test_adjacent_swaps(self):
        # X = Y = 1: 001 -> 010 -> 100.
        run_case(self, stdin="3 1 1\n001\n100\n", expected="Yes\n")

    def test_single_operation_a(self):
        # Operation A at i = 1 turns 001 into 100.
        run_case(self, stdin="3 2 1\n001\n100\n", expected="Yes\n")

    def test_no_operation_applicable(self):
        # 010 contains neither 001 nor 100, so S is stuck and S != T.
        run_case(self, stdin="3 2 1\n010\n100\n", expected="No\n")

    def test_window_is_whole_string(self):
        # X + Y = N: Operation A at i = 1 turns 0011 into 1100.
        run_case(self, stdin="4 2 2\n0011\n1100\n", expected="Yes\n")

    def test_stuck_same_counts(self):
        # 0110 contains neither 0011 nor 1100, so no operation applies.
        run_case(self, stdin="4 2 2\n0110\n1001\n", expected="No\n")

    def test_two_steps(self):
        # X = 1, Y = 2: B at i = 2 gives 0011, then A at i = 1 gives 1100.
        run_case(self, stdin="4 1 2\n0110\n1100\n", expected="Yes\n")

    def test_max_n_identical(self):
        n = 500000
        s = "01" * (n // 2)
        run_case(self, stdin=f"{n} 1 1\n{s}\n{s}\n", expected="Yes\n")

    def test_max_n_different_counts(self):
        # Operations keep the number of 0s; S has n of them, T has none.
        n = 500000
        run_case(self, stdin=f"{n} 1 1\n{'0' * n}\n{'1' * n}\n", expected="No\n")

    def test_max_n_adjacent_swaps(self):
        # X = Y = 1 reaches every arrangement with the same counts.
        n = 500000
        run_case(self, stdin=f"{n} 1 1\n{'01' * (n // 2)}\n{'10' * (n // 2)}\n", expected="Yes\n")

    def test_max_x_y_no_operation(self):
        # X = Y = N gives X + Y > N, so nothing applies and S != T.
        n = 500000
        s = "0" * (n - 1) + "1"
        t = "1" + "0" * (n - 1)
        run_case(self, stdin=f"{n} {n} {n}\n{s}\n{t}\n", expected="No\n")

    def test_max_x_y_identical(self):
        n = 500000
        s = "1" * n
        run_case(self, stdin=f"{n} {n} {n}\n{s}\n{s}\n", expected="Yes\n")


if __name__ == "__main__":
    unittest.main()
