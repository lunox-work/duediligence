# Public tests for "Magnets".
#
# spec.md gives only the title and the input/output format; the rules,
# constraints and sample are those of AtCoder ARC193 D "Magnets", whose
# format spec.md reproduces exactly:
#   - pieces start on the squares i with A_i = 1;
#   - one operation picks a square i and moves every piece one square
#     closer to i (pieces already on i stay);
#   - the goal is: square j holds at least one piece iff B_j = 1;
#   - 1 <= T <= 2*10^5, 1 <= N <= 10^6, sum of N <= 10^6, A and B are
#     0/1 strings of length N, each containing at least one 1.
# A BFS over occupied sets under these rules reproduces the sample output
# (3, -1, 5) exactly, and was used to confirm every small case below.
import unittest

from sandbox.check import run_case


class TestMagnets(unittest.TestCase):
    def test_sample_1(self):
        run_case(
            self,
            stdin="3\n8\n01001101\n00001011\n3\n010\n111\n20\n"
            "10100011011110101011\n00010001111101100000\n",
            expected="3\n-1\n5\n",
        )

    def test_smallest_input(self):
        # N = 1: A and B must both be "1"; already satisfied, so 0.
        run_case(self, stdin="1\n1\n1\n1\n", expected="0\n")

    def test_already_satisfied(self):
        # A == B: the goal holds with no operation, so 0.
        run_case(self, stdin="1\n5\n10110\n10110\n", expected="0\n")

    def test_single_piece_one_step(self):
        # The piece is not on square 2, so 0 is impossible; choosing i = 2
        # once moves it there.
        run_case(self, stdin="1\n2\n10\n01\n", expected="1\n")

    def test_merge_two_pieces(self):
        # Two occupied squares need at least one operation; i = 2 moves the
        # piece on 1 onto 2 and leaves the piece on 2 in place.
        run_case(self, stdin="1\n2\n11\n01\n", expected="1\n")

    def test_more_targets_than_pieces(self):
        # Each piece lands on exactly one square, so the number of occupied
        # squares never increases: 1 occupied square can never become 2.
        run_case(self, stdin="1\n2\n01\n11\n", expected="-1\n")

    def test_max_n_single_piece_crosses(self):
        # N = 10^6, one piece from square 1 to square N. It moves at most one
        # square per operation, so at least N - 1; choosing i = N every time
        # achieves it. Answer 999999.
        n = 10**6
        a = "1" + "0" * (n - 1)
        b = "0" * (n - 1) + "1"
        run_case(self, stdin=f"1\n{n}\n{a}\n{b}\n", expected="999999\n")

    def test_max_n_all_gather_at_end(self):
        # N = 10^6, every square occupied, all must gather on square 1. The
        # piece on square N needs at least N - 1 operations; choosing i = 1
        # every time gathers everything in exactly N - 1. Answer 999999.
        n = 10**6
        a = "1" * n
        b = "1" + "0" * (n - 1)
        run_case(self, stdin=f"1\n{n}\n{a}\n{b}\n", expected="999999\n")

    def test_max_n_all_gather_in_middle(self):
        # N = 10^6, gather everything on square p = 500000: the lower bound
        # max(p - 1, N - p) = 500000 is achieved by choosing i = p every time.
        n = 10**6
        p = 500000
        a = "1" * n
        b = "0" * (p - 1) + "1" + "0" * (n - p)
        run_case(self, stdin=f"1\n{n}\n{a}\n{b}\n", expected="500000\n")

    def test_max_t(self):
        # T = 2*10^5 cases with N = 1 (sum of N = 2*10^5): each is "1" -> "1",
        # already satisfied, so every line is 0.
        t = 200000
        run_case(self, stdin=f"{t}\n" + "1\n1\n1\n" * t, expected="0\n" * t)


if __name__ == "__main__":
    unittest.main()
