import unittest
from collections import deque
from itertools import product

from sandbox.check import run_case


def brute(a, b):
    """Exhaustive BFS over the set of occupied squares (0-indexed).

    Pieces sharing a square move identically forever after, so the set of
    occupied squares is the whole state. Every operation i maps each
    occupied j to j-1, j+1 or j by the statement's three rules. The state
    space is finite, so BFS from A gives the true minimum or proves B
    unreachable (-1)."""
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


def nonzero_strings(n):
    return ["".join(bits) for bits in product("01", repeat=n) if "1" in bits]


def build(cases):
    lines = [str(len(cases))]
    for a, b in cases:
        lines += [str(len(a)), a, b]
    return "\n".join(lines) + "\n"


class TestMagnets(unittest.TestCase):
    # Hand-derived cases.

    def test_smallest_input(self):
        # N=1, the only valid input: the piece is already where B wants it.
        run_case(self, stdin="1\n1\n1\n1\n", expected="0")

    def test_already_equal(self):
        # A == B: zero operations suffice.
        run_case(self, stdin="1\n5\n10110\n10110\n", expected="0")

    def test_single_step_right(self):
        # One piece must move one square; one op (i=2) does it, zero cannot.
        run_case(self, stdin="1\n2\n10\n01\n", expected="1")

    def test_merge_two_pieces(self):
        # i=1 pulls the piece on square 2 onto square 1: one op, zero cannot.
        run_case(self, stdin="1\n2\n11\n10\n", expected="1")

    def test_merge_from_both_sides(self):
        # i=2 moves both pieces onto square 2 in one op.
        run_case(self, stdin="1\n3\n101\n010\n", expected="1")

    def test_cannot_split(self):
        # Distinct pieces never separate onto more squares than they occupy,
        # so one occupied square can never become two: -1.
        run_case(self, stdin="1\n2\n10\n11\n", expected="-1")

    def test_multiple_cases_in_order(self):
        # The cases above, together, answered one per line in input order.
        stdin = build([("1", "1"), ("10", "01"), ("10", "11"), ("101", "010")])
        run_case(self, stdin=stdin, expected="0\n1\n-1\n1")

    # Brute-force-derived cases (expected computed by brute() above).

    def test_brute_n5_spread_to_edge(self):
        a, b = "10001", "00100"
        run_case(self, stdin=build([(a, b)]), expected=str(brute(a, b)))

    def test_brute_n6_mixed(self):
        a, b = "110101", "001010"
        run_case(self, stdin=build([(a, b)]), expected=str(brute(a, b)))

    def test_brute_n6_shift_block(self):
        a, b = "111000", "000111"
        run_case(self, stdin=build([(a, b)]), expected=str(brute(a, b)))

    def test_brute_all_pairs_up_to_n4(self):
        # Every valid (A, B) with N <= 4 in one input; answers by brute().
        cases = [(a, b) for n in range(1, 5)
                 for a in nonzero_strings(n) for b in nonzero_strings(n)]
        expected = "\n".join(str(brute(a, b)) for a, b in cases)
        run_case(self, stdin=build(cases), expected=expected)

    # Constraint-limit cases.

    def test_max_n_single_piece_across(self):
        # N = 10^6, one piece at square 1 must reach square N. Each op moves
        # a piece at most one square, and i=N moves it exactly one, so the
        # answer is N-1.
        n = 10 ** 6
        a = "1" + "0" * (n - 1)
        b = "0" * (n - 1) + "1"
        run_case(self, stdin=build([(a, b)]), expected=str(n - 1))

    def test_max_n_all_ones_equal(self):
        # N = 10^6, A == B: zero operations.
        n = 10 ** 6
        run_case(self, stdin=build([("1" * n, "1" * n)]), expected="0")

    def test_max_t(self):
        # T = 2*10^5 cases of N=1, A=B="1": each answer is 0.
        t = 2 * 10 ** 5
        run_case(self, stdin=build([("1", "1")] * t), expected="\n".join(["0"] * t))


if __name__ == "__main__":
    unittest.main()
