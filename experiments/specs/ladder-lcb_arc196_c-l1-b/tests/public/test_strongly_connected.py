import unittest
from itertools import permutations

from sandbox.check import run_case

MOD = 998244353
MAX_N = 200000


def brute(s):
    """Count pairings by trying every white-to-black assignment and checking
    strong connectivity with a forward and a reverse search from vertex 1.
    Only for tiny inputs (N! assignments)."""
    m = len(s)
    whites = [i for i, c in enumerate(s) if c == "W"]
    blacks = [i for i, c in enumerate(s) if c == "B"]

    def reaches_all(graph):
        seen = {0}
        stack = [0]
        while stack:
            u = stack.pop()
            for v in graph[u]:
                if v not in seen:
                    seen.add(v)
                    stack.append(v)
        return len(seen) == m

    count = 0
    for perm in permutations(blacks):
        adj = [[i + 1] if i + 1 < m else [] for i in range(m)]
        for w, b in zip(whites, perm):
            adj[w].append(b)
        radj = [[] for _ in range(m)]
        for u in range(m):
            for v in adj[u]:
                radj[v].append(u)
        if reaches_all(adj) and reaches_all(radj):
            count += 1
    return count % MOD


def case(tc, s):
    run_case(tc, stdin=f"{len(s) // 2}\n{s}\n", expected=str(brute(s)))


class TestStronglyConnected(unittest.TestCase):
    # Samples from the statement.
    def test_sample_1(self):
        run_case(self, stdin="2\nBWBW\n", expected="1")

    def test_sample_2(self):
        run_case(self, stdin="4\nBWWBWBWB\n", expected="0")

    def test_sample_3(self):
        run_case(self, stdin="9\nBWWBWBBBWWBWBBWWBW\n", expected="240792")

    # N = 1, by hand: "BW" adds 2->1, closing the cycle 1->2->1.
    def test_n1_bw(self):
        run_case(self, stdin="1\nBW\n", expected="1")

    # N = 1, by hand: "WB" adds a second 1->2; vertex 1 has no incoming edge.
    def test_n1_wb(self):
        run_case(self, stdin="1\nWB\n", expected="0")

    # Small cases below: expected value from brute() above (every pairing tried).
    def test_small_bbww(self):
        case(self, "BBWW")  # 2

    def test_small_wwbb(self):
        case(self, "WWBB")  # 0

    def test_small_bwwb(self):
        case(self, "BWWB")  # 0

    def test_small_bbwbww(self):
        case(self, "BBWBWW")  # 6

    def test_small_bwbwbw(self):
        case(self, "BWBWBW")  # 3

    def test_small_bwbbww(self):
        case(self, "BWBBWW")  # 4

    def test_small_bwbwbwbw(self):
        case(self, "BWBWBWBW")  # 13

    def test_small_bbwwbbww(self):
        case(self, "BBWWBBWW")  # 20

    def test_small_bwbwbwbwbw(self):
        case(self, "BWBWBWBWBW")  # 71

    def test_small_bwbbwbwbww(self):
        case(self, "BWBBWBWBWW")  # 96

    # Largest N, all blacks then all whites. Every added edge goes from a
    # white (> N) back to a black (<= N). The path 1->...->2N plus extra edges
    # is strongly connected iff every cut k | k+1 is crossed by an edge from
    # the right side to the left. Black 1 is matched to some white > N, which
    # crosses every cut k <= N; white 2N is matched to some black <= N, which
    # crosses every cut k >= N. So all N! pairings work.
    def test_max_n_blacks_then_whites(self):
        n = MAX_N
        fact = 1
        for i in range(2, n + 1):
            fact = fact * i % MOD
        run_case(self, stdin=f"{n}\n{'B' * n}{'W' * n}\n", expected=str(fact))

    # Largest N, vertex 1 white: its only incoming edge could come from an
    # added edge, which always ends at a black vertex, so the answer is 0.
    def test_max_n_whites_then_blacks(self):
        n = MAX_N
        run_case(self, stdin=f"{n}\n{'W' * n}{'B' * n}\n", expected="0")

    # Largest N, vertex 2N black: its only outgoing edge could come from an
    # added edge, which always starts at a white vertex, so the answer is 0.
    def test_max_n_last_vertex_black(self):
        n = MAX_N
        s = "B" + "W" * n + "B" * (n - 1)
        run_case(self, stdin=f"{n}\n{s}\n", expected="0")


if __name__ == "__main__":
    unittest.main()
