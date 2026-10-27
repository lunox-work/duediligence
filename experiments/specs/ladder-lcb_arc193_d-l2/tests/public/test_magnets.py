"""Public tests for "Magnets".

The statement gives no samples and no constraints section, so every case
here is tiny (N <= 7) and keeps at least one 1 in both A and B. Each
expected answer is derived by hand (the reasoning is in the comment) or
computed by `brute`, a breadth-first search that applies the operation
literally to the set of occupied squares. Pieces in one square always
move together, so that set is the whole state, and BFS gives the minimum
number of operations, or -1 when B is never reached.
"""

import itertools
import random
import unittest
from collections import deque

from sandbox.check import run_case


def brute(a, b):
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


def build(cases):
    stdin = f"{len(cases)}\n" + "".join(f"{len(a)}\n{a}\n{b}\n" for a, b in cases)
    expected = "\n".join(str(brute(a, b)) for a, b in cases) + "\n"
    return stdin, expected


class TestMagnets(unittest.TestCase):
    def test_smallest_input(self):
        # N = 1, piece already in square 1: zero operations.
        run_case(self, stdin="1\n1\n1\n1\n", expected="0\n")

    def test_already_equal(self):
        # A == B: zero operations.
        run_case(self, stdin="1\n2\n01\n01\n", expected="0\n")

    def test_already_equal_with_gap(self):
        # A == B: zero operations.
        run_case(self, stdin="1\n3\n101\n101\n", expected="0\n")

    def test_single_shift_right(self):
        # Choose i = 2: the piece at 1 moves to 2. One operation.
        run_case(self, stdin="1\n2\n10\n01\n", expected="1\n")

    def test_piece_at_chosen_square_stays(self):
        # Choose i = 1: the piece at 1 stays, the piece at 2 moves to 1. One operation.
        run_case(self, stdin="1\n2\n11\n10\n", expected="1\n")

    def test_cannot_split_pieces(self):
        # Each occupied square maps to one square, so the number of
        # occupied squares never grows: 1 occupied square cannot become 2.
        run_case(self, stdin="1\n2\n10\n11\n", expected="-1\n")

    def test_merge_from_both_sides(self):
        # Choose i = 2: pieces at 1 and 3 both move to 2. One operation.
        run_case(self, stdin="1\n3\n101\n010\n", expected="1\n")

    def test_merge_three_into_middle(self):
        # Choose i = 2: 1 -> 2, 2 stays, 3 -> 2. One operation.
        run_case(self, stdin="1\n3\n111\n010\n", expected="1\n")

    def test_merge_three_into_end(self):
        # One operation from 111 gives {1,2}, {2} or {2,3}, never {1};
        # i = 1 twice gives {1,2} then {1}. Two operations.
        run_case(self, stdin="1\n3\n111\n100\n", expected="2\n")

    def test_move_across_left_to_right(self):
        # One operation moves a piece at most one square, and it must
        # travel from 1 to 3; i = 3 twice does it. Two operations.
        run_case(self, stdin="1\n3\n100\n001\n", expected="2\n")

    def test_move_across_right_to_left(self):
        # Mirror of the previous case: i = 1 twice. Two operations.
        run_case(self, stdin="1\n3\n001\n100\n", expected="2\n")

    def test_pull_both_ends_inward(self):
        # Choose i = 2 (or 3): 1 -> 2 and 4 -> 3. One operation.
        run_case(self, stdin="1\n4\n1001\n0110\n", expected="1\n")

    def test_multiple_cases_hand_derived(self):
        # The hand-derived cases above, together in one input, in order.
        run_case(
            self,
            stdin="5\n1\n1\n1\n2\n10\n01\n2\n10\n11\n3\n111\n100\n4\n1001\n0110\n",
            expected="0\n1\n-1\n2\n1\n",
        )

    def test_all_pairs_n3_brute_force(self):
        # Every (A, B) with N = 3 and at least one 1 in each; expected
        # answers from the BFS brute force.
        strings = ["".join(p) for p in itertools.product("01", repeat=3) if "1" in p]
        stdin, expected = build([(a, b) for a in strings for b in strings])
        run_case(self, stdin=stdin, expected=expected)

    def test_random_small_brute_force(self):
        # Seeded random cases with 1 <= N <= 7; expected answers from the
        # BFS brute force.
        rng = random.Random(193)
        cases = []
        for _ in range(60):
            n = rng.randint(1, 7)
            pair = []
            for _ in range(2):
                s = [rng.choice("01") for _ in range(n)]
                s[rng.randrange(n)] = "1"
                pair.append("".join(s))
            cases.append(tuple(pair))
        stdin, expected = build(cases)
        run_case(self, stdin=stdin, expected=expected)


if __name__ == "__main__":
    unittest.main()
