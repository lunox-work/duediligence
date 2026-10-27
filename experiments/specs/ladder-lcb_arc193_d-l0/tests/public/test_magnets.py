import itertools
import unittest
from collections import deque

from sandbox.check import run_case


def brute(a, b):
    """Breadth-first search over the set of occupied squares.

    Pieces on the same square always move together, so the set of occupied
    squares is the whole state. Each of the N choices of i is one edge; the
    BFS distance to the target set is the minimum number of operations, and
    -1 if it is unreachable. Only used for N <= 4."""
    n = len(a)
    start = frozenset(j for j in range(n) if a[j] == "1")
    goal = frozenset(j for j in range(n) if b[j] == "1")
    dist = {start: 0}
    queue = deque([start])
    while queue:
        cur = queue.popleft()
        if cur == goal:
            return dist[cur]
        for i in range(n):
            nxt = frozenset(j - 1 if i < j else j + 1 if i > j else j for j in cur)
            if nxt not in dist:
                dist[nxt] = dist[cur] + 1
                queue.append(nxt)
    return -1


def fmt(cases):
    lines = [str(len(cases))]
    for a, b in cases:
        lines += [str(len(a)), a, b]
    return "\n".join(lines) + "\n"


class TestMagnets(unittest.TestCase):
    def test_sample_1(self):
        run_case(
            self,
            stdin="3\n8\n01001101\n00001011\n3\n010\n111\n20\n10100011011110101011\n00010001111101100000\n",
            expected="3\n-1\n5\n",
        )

    def test_smallest_input(self):
        # N = 1: A and B must both be "1"; already satisfied, 0 operations.
        run_case(self, stdin="1\n1\n1\n1\n", expected="0\n")

    def test_already_matching(self):
        # A == B: zero operations satisfy the condition.
        run_case(self, stdin="1\n3\n101\n101\n", expected="0\n")

    def test_pieces_cannot_split(self):
        # One piece can never occupy two squares (pieces only move together).
        run_case(self, stdin="1\n2\n01\n11\n", expected="-1\n")

    def test_merge_two_pieces(self):
        # Choose i = 2 once: piece at 1 moves to 2, piece at 2 stays (i = j).
        run_case(self, stdin="1\n2\n11\n01\n", expected="1\n")

    def test_single_piece_far_move(self):
        # One piece moves at most one square per operation, so >= 2;
        # choosing i = 3 twice achieves it.
        run_case(self, stdin="1\n3\n100\n001\n", expected="2\n")

    def test_all_tiny_cases_against_brute_force(self):
        # Every valid (A, B) pair with N <= 4, expected answers from the BFS
        # brute force above, all in one multi-test-case input.
        cases = []
        for n in range(1, 5):
            strings = ["".join(p) for p in itertools.product("01", repeat=n) if "1" in p]
            for a in strings:
                for b in strings:
                    cases.append((a, b))
        expected = "\n".join(str(brute(a, b)) for a, b in cases) + "\n"
        run_case(self, stdin=fmt(cases), expected=expected)

    def test_max_n_single_piece_across(self):
        # N = 10^6, one piece from square 1 to square N: each operation moves
        # it at most one square, and choosing i = N each time moves it exactly
        # one, so the answer is N - 1.
        n = 10**6
        run_case(
            self,
            stdin=fmt([("1" + "0" * (n - 1), "0" * (n - 1) + "1")]),
            expected=str(n - 1) + "\n",
        )

    def test_max_n_all_ones_unchanged(self):
        # N = 10^6, A == B == all ones: 0 operations.
        n = 10**6
        run_case(self, stdin=fmt([("1" * n, "1" * n)]), expected="0\n")

    def test_max_t(self):
        # T = 2 * 10^5 cases with N = 5 (sum of N = 10^6), each A = 10001,
        # B = 00100: choosing i = 3 twice merges both pieces onto square 3;
        # one operation moves each piece one square, so fewer is impossible.
        t = 2 * 10**5
        run_case(self, stdin=fmt([("10001", "00100")] * t), expected="2\n" * t)


if __name__ == "__main__":
    unittest.main()
