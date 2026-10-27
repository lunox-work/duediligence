# Public cases for "Strongly Connected" (spec.md). The statement gives no
# samples and does not name the characters of S; these cases read S as a
# string of 2N letters, 'W' for a white vertex and 'B' for a black one.
import itertools
import math
import unittest

from sandbox.check import run_case

MOD = 998244353


def brute_force(s):
    """Tries every white-to-black pairing, builds the graph and checks that
    vertex 1 reaches every vertex and every vertex reaches vertex 1."""
    n = len(s)
    whites = [i for i, c in enumerate(s) if c == "W"]
    blacks = [i for i, c in enumerate(s) if c == "B"]

    def reaches_all(adj):
        seen = {0}
        stack = [0]
        while stack:
            u = stack.pop()
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    stack.append(v)
        return len(seen) == n

    count = 0
    for perm in itertools.permutations(blacks):
        fwd = [[] for _ in range(n)]
        rev = [[] for _ in range(n)]
        for i in range(n - 1):
            fwd[i].append(i + 1)
            rev[i + 1].append(i)
        for w, b in zip(whites, perm):
            fwd[w].append(b)
            rev[b].append(w)
        if reaches_all(fwd) and reaches_all(rev):
            count += 1
    return count % MOD


def stdin_for(s):
    return f"{len(s) // 2}\n{s}\n"


class TestStronglyConnected(unittest.TestCase):
    # By hand: the only pairing adds 2 -> 1, closing the cycle 1 -> 2 -> 1.
    def test_smallest_black_then_white(self):
        run_case(self, stdin="1\nBW\n", expected="1")

    # By hand: the only pairing adds 1 -> 2, so nothing reaches vertex 1.
    def test_smallest_white_then_black(self):
        run_case(self, stdin="1\nWB\n", expected="0")

    # By hand: pairing 2->1, 4->3 leaves vertex 1 unreachable from 4;
    # pairing 2->3, 4->1 adds 4 -> 1 and closes the whole path.
    def test_alternating_n2(self):
        run_case(self, stdin="2\nBWBW\n", expected="1")

    # By hand: both pairings (3->1, 4->2) and (3->2, 4->1) are strongly
    # connected, so the answer is 2.
    def test_blacks_then_whites_n2(self):
        run_case(self, stdin="2\nBBWW\n", expected="2")

    # Vertex 1 is white: only pair edges enter a vertex besides the path,
    # and they enter black vertices, so vertex 1 has no incoming edge.
    def test_first_vertex_white_gives_zero(self):
        run_case(self, stdin="2\nWBBW\n", expected="0")

    # Vertex 2N is black: pair edges leave only white vertices and the path
    # ends there, so vertex 2N has no outgoing edge.
    def test_last_vertex_black_gives_zero(self):
        run_case(self, stdin="2\nBWWB\n", expected="0")

    # The cases below compute the expected count with brute_force above.
    def test_alternating_n3(self):
        s = "BWBWBW"
        run_case(self, stdin=stdin_for(s), expected=str(brute_force(s)))

    def test_mixed_n3(self):
        s = "BBWBWW"
        run_case(self, stdin=stdin_for(s), expected=str(brute_force(s)))

    def test_alternating_n4(self):
        s = "BWBWBWBW"
        run_case(self, stdin=stdin_for(s), expected=str(brute_force(s)))

    def test_mixed_n4(self):
        s = "BBWBWBWW"
        run_case(self, stdin=stdin_for(s), expected=str(brute_force(s)))

    # S = B^N W^N: every pairing is strongly connected. The path reaches
    # 2N from everywhere, and for any cut 1..k | k+1..2N some white in the
    # suffix is paired with a black in the prefix (if k <= N the prefix is
    # all black and the suffix holds every white; if k >= N the suffix is
    # all white and every black is in the prefix). So the answer is N!.
    # 13! exceeds 998244353, so the modulus matters here.
    def test_all_pairings_work_n13_modulo(self):
        n = 13
        run_case(self, stdin=f"{n}\n{'B' * n}{'W' * n}\n",
                 expected=str(math.factorial(n) % MOD))

    # Same argument as above with N = 20.
    def test_all_pairings_work_n20_modulo(self):
        n = 20
        run_case(self, stdin=f"{n}\n{'B' * n}{'W' * n}\n",
                 expected=str(math.factorial(n) % MOD))


if __name__ == "__main__":
    unittest.main()
