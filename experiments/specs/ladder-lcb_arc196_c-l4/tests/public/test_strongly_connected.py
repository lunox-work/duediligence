import itertools
import unittest

from sandbox.check import run_case

MOD = 998244353


def brute(s):
    """Count white->black perfect matchings that make the graph strongly
    connected, by trying every assignment of black vertices to white ones.
    Every vertex reaches vertex 2N along the path i -> i+1, so the graph is
    strongly connected exactly when vertex 2N reaches every vertex."""
    n2 = len(s)
    whites = [i for i, c in enumerate(s) if c == "W"]
    blacks = [i for i, c in enumerate(s) if c == "B"]
    total = 0
    for perm in itertools.permutations(blacks):
        adj = [[i + 1] if i + 1 < n2 else [] for i in range(n2)]
        for w, b in zip(whites, perm):
            adj[w].append(b)
        seen = {n2 - 1}
        stack = [n2 - 1]
        while stack:
            u = stack.pop()
            for v in adj[u]:
                if v not in seen:
                    seen.add(v)
                    stack.append(v)
        total += len(seen) == n2
    return total % MOD


class TestStronglyConnected(unittest.TestCase):
    # Samples from the statement.

    def test_sample_1(self):
        run_case(self, stdin="2\nBWBW\n", expected="1\n")

    def test_sample_2(self):
        run_case(self, stdin="4\nBWWBWBWB\n", expected="0\n")

    def test_sample_3(self):
        run_case(self, stdin="9\nBWWBWBBBWWBWBBWWBW\n", expected="240792\n")

    # Smallest input, N = 1.

    def test_n1_black_first(self):
        # 1 -> 2 plus the added edge 2 -> 1: one way, strongly connected.
        run_case(self, stdin="1\nBW\n", expected="1\n")

    def test_n1_white_first(self):
        # Vertex 1 is white, so no edge ever enters it: answer 0.
        run_case(self, stdin="1\nWB\n", expected="0\n")

    # Tiny inputs, answers from the brute force above.

    def test_small_bbww(self):
        s = "BBWW"
        run_case(self, stdin=f"2\n{s}\n", expected=f"{brute(s)}\n")

    def test_small_bwbwbw(self):
        s = "BWBWBW"
        run_case(self, stdin=f"3\n{s}\n", expected=f"{brute(s)}\n")

    def test_small_bbwbww(self):
        s = "BBWBWW"
        run_case(self, stdin=f"3\n{s}\n", expected=f"{brute(s)}\n")

    def test_small_bwwbbw(self):
        s = "BWWBBW"
        run_case(self, stdin=f"3\n{s}\n", expected=f"{brute(s)}\n")

    def test_small_bbwwbbww(self):
        s = "BBWWBBWW"
        run_case(self, stdin=f"4\n{s}\n", expected=f"{brute(s)}\n")

    def test_small_bwbbwbww(self):
        s = "BWBBWBWW"
        run_case(self, stdin=f"4\n{s}\n", expected=f"{brute(s)}\n")

    # Largest N = 2 * 10^5.

    def test_max_n_white_first(self):
        # Vertex 1 is white and has no incoming edge: answer 0.
        n = 200000
        s = "W" * n + "B" * n
        run_case(self, stdin=f"{n}\n{s}\n", expected="0\n")

    def test_max_n_black_last(self):
        # Vertex 2N is black and has no outgoing edge: answer 0.
        n = 200000
        s = "B" + "W" * n + "B" * (n - 1)
        run_case(self, stdin=f"{n}\n{s}\n", expected="0\n")

    def test_max_n_blacks_then_whites(self):
        # S = B^N W^N: vertex 2N goes to some black b <= N and from there
        # along the path reaches every white, so every black is reached too.
        # Every matching works: N! mod 998244353 (checked by brute force
        # for small N in test_blacks_then_whites_small).
        n = 200000
        f = 1
        for i in range(2, n + 1):
            f = f * i % MOD
        run_case(self, stdin=f"{n}\n{'B' * n}{'W' * n}\n", expected=f"{f}\n")

    def test_blacks_then_whites_small(self):
        # The B^N W^N argument above, checked by brute force at N = 4: 4! = 24.
        s = "BBBBWWWW"
        self.assertEqual(brute(s), 24)
        run_case(self, stdin=f"4\n{s}\n", expected="24\n")


if __name__ == "__main__":
    unittest.main()
