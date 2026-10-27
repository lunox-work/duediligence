# Public tests for "Magnets" (spec.md).
#
# spec.md gives no samples and does not spell out how A and B are written.
# These tests read A and B as strings of '0'/'1' of length N, character j
# being '1' exactly when square j is occupied, with at least one '1' in
# each (the format of the original problem, AtCoder ARC193 D). Squares are
# 1..N; an operation picks a square i in the row and every piece at j moves
# to j+1 if j < i, j-1 if j > i, and stays if j == i. All inputs are small.
#
# Expected values are either derived by hand (argued in the comment) or
# computed by `brute`, a breadth-first search over every reachable set of
# occupied squares, which is exact for these tiny rows.
import itertools
import unittest
from collections import deque

from sandbox.check import run_case


def _step(mask, n, i):
    out = 0
    for j in range(n):
        if mask >> j & 1:
            out |= 1 << (j + (j < i) - (j > i))
    return out


def brute(a, b):
    """Minimum operations from occupancy string a to b, or -1, by BFS."""
    n = len(a)
    start = sum(1 << j for j, c in enumerate(a) if c == "1")
    goal = sum(1 << j for j, c in enumerate(b) if c == "1")
    dist = {start: 0}
    queue = deque([start])
    while queue:
        mask = queue.popleft()
        if mask == goal:
            return dist[mask]
        for i in range(n):
            nxt = _step(mask, n, i)
            if nxt not in dist:
                dist[nxt] = dist[mask] + 1
                queue.append(nxt)
    return -1


def make_input(cases):
    lines = [str(len(cases))]
    for a, b in cases:
        lines += [str(len(a)), a, b]
    return "\n".join(lines) + "\n"


class TestMagnets(unittest.TestCase):
    def test_original_sample(self):
        # The sample of the original problem; its published answers are
        # 3, -1, 5, and brute() reproduces them.
        cases = [
            ("01001101", "00001011"),
            ("010", "111"),
            ("10100011011110101011", "00010001111101100000"),
        ]
        expected = [brute(a, b) for a, b in cases]
        self.assertEqual(expected, [3, -1, 5])
        run_case(self, stdin=make_input(cases), expected="3\n-1\n5")

    def test_smallest_input(self):
        # N = 1, one piece already on the only square: zero operations.
        run_case(self, stdin="1\n1\n1\n1\n", expected="0")

    def test_already_at_target(self):
        # A equals B: zero operations.
        run_case(self, stdin="1\n5\n10101\n10101\n", expected="0")

    def test_single_piece_across_row(self):
        # One piece moves at most one square per operation, and choosing
        # square 5 moves it right each time: 4 operations from 1 to 5.
        run_case(self, stdin="1\n5\n10000\n00001\n", expected="4")

    def test_more_target_pieces_than_start(self):
        # Pieces never split, so the number of occupied squares never
        # grows: one piece cannot become two occupied squares.
        run_case(self, stdin="1\n2\n10\n11\n", expected="-1")

    def test_merge_two_adjacent_left(self):
        # Choose square 1: the piece on 2 joins the one on 1.
        run_case(self, stdin="1\n2\n11\n10\n", expected="1")

    def test_merge_two_adjacent_right(self):
        # Choose square 2: the piece on 1 joins the one on 2.
        run_case(self, stdin="1\n2\n11\n01\n", expected="1")

    def test_gap_cannot_widen(self):
        # With i between, on, or outside two pieces, their distance shrinks
        # by 2, shrinks by 1, or stays: it never grows, so 1 cannot become 2.
        self.assertEqual(brute("110", "101"), -1)
        run_case(self, stdin="1\n3\n110\n101\n", expected="-1")

    def test_shrink_gap_by_one(self):
        # Choose square 1: piece on 1 stays, piece on 3 moves to 2.
        run_case(self, stdin="1\n3\n101\n110\n", expected="1")

    def test_several_cases_in_one_input(self):
        # Answers come one per line in input order (each argued above).
        stdin = make_input([("1", "1"), ("10", "11"), ("10000", "00001"), ("11", "10")])
        run_case(self, stdin=stdin, expected="0\n-1\n4\n1")

    def test_exhaustive_up_to_four_squares(self):
        # Every pair of non-empty occupancy strings for N = 1..4, in one
        # input, each answer from brute().
        cases = []
        for n in range(1, 5):
            strings = ["".join(bits) for bits in itertools.product("01", repeat=n) if "1" in bits]
            cases += [(a, b) for a in strings for b in strings]
        expected = "\n".join(str(brute(a, b)) for a, b in cases)
        run_case(self, stdin=make_input(cases), expected=expected)


if __name__ == "__main__":
    unittest.main()
