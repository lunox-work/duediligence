import unittest
from itertools import permutations

from sandbox.check import run_case

MOD = 998244353


def brute(s):
    """Count pairings by trying every one: assign the black vertices to the
    white vertices in every possible order, add the edges, and check strong
    connectivity directly (every vertex reachable from vertex 0 both in the
    graph and in its reverse). Only for tiny N."""
    n2 = len(s)
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
        return len(seen) == n2

    count = 0
    for perm in permutations(blacks):
        fwd = [[] for _ in range(n2)]
        rev = [[] for _ in range(n2)]
        for i in range(n2 - 1):
            fwd[i].append(i + 1)
            rev[i + 1].append(i)
        for w, b in zip(whites, perm):
            fwd[w].append(b)
            rev[b].append(w)
        if reaches_all(fwd) and reaches_all(rev):
            count += 1
    return count % MOD


def factorial_mod(n):
    r = 1
    for i in range(2, n + 1):
        r = r * i % MOD
    return r


class TestStronglyConnected(unittest.TestCase):
    def check_brute(self, s):
        n = len(s) // 2
        run_case(self, stdin=f"{n}\n{s}\n", expected=str(brute(s)))

    # Smallest input, N = 1. "BW": path 1->2 plus added 2->1 is a cycle,
    # so the single pairing works.
    def test_n1_bw(self):
        run_case(self, stdin="1\nBW\n", expected="1")

    # "WB": edges are 1->2 twice; vertex 2 cannot reach vertex 1.
    def test_n1_wb(self):
        run_case(self, stdin="1\nWB\n", expected="0")

    # Expected values below come from the exhaustive brute force above.
    def test_n2_bwbw(self):
        self.check_brute("BWBW")

    def test_n2_bbww(self):
        self.check_brute("BBWW")

    def test_n2_bwwb(self):
        self.check_brute("BWWB")

    def test_n4_bwwbwbwb(self):
        self.check_brute("BWWBWBWB")

    def test_n4_bwbwbwbw(self):
        self.check_brute("BWBWBWBW")

    def test_n5_bbwbwwbbww(self):
        self.check_brute("BBWBWWBBWW")

    def test_n6_bwbbwwbbwbww(self):
        self.check_brute("BWBBWWBBWBWW")

    def test_n7_bbwwbwbbwbwbww(self):
        self.check_brute("BBWWBWBBWBWBWW")

    # Largest N. If S_1 is W, vertex 1 has no incoming edge (path edges
    # enter i+1, added edges enter black vertices), so the answer is 0.
    def test_max_n_starts_with_white(self):
        n = 200000
        run_case(self, stdin=f"{n}\n{'W' * n + 'B' * n}\n", expected="0")

    # Largest N. If S_2N is B, vertex 2N has no outgoing edge, so 0.
    def test_max_n_ends_with_black(self):
        n = 200000
        run_case(self, stdin=f"{n}\n{'BW' * (n - 1) + 'WB'}\n", expected="0")

    # Largest N, S = B^N W^N. Vertex 1 reaches everything along the path.
    # Any vertex reaches 2N along the path; 2N's edge goes to some black
    # vertex b <= N, whose path passes every white vertex, one of which
    # points to vertex 1. So every pairing works: N! mod 998244353.
    # (Checked against the brute force for small N in the test below.)
    def test_max_n_blacks_then_whites(self):
        n = 200000
        run_case(self, stdin=f"{n}\n{'B' * n + 'W' * n}\n",
                 expected=str(factorial_mod(n)))

    def test_n6_blacks_then_whites(self):
        s = "BBBBBBWWWWWW"
        self.assertEqual(brute(s), factorial_mod(6))
        run_case(self, stdin=f"6\n{s}\n", expected="720")


if __name__ == "__main__":
    unittest.main()
