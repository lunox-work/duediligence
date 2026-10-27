import unittest
from itertools import permutations

from sandbox.check import run_case

MOD = 998244353


def brute(s):
    """Count pairings by trying every white-to-black assignment and checking
    that vertex 1 reaches every vertex and every vertex reaches vertex 1."""
    n2 = len(s)
    whites = [i for i in range(n2) if s[i] == "W"]
    blacks = [i for i in range(n2) if s[i] == "B"]

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
        adj = [[i + 1] if i + 1 < n2 else [] for i in range(n2)]
        for w, b in zip(whites, perm):
            adj[w].append(b)
        radj = [[] for _ in range(n2)]
        for u in range(n2):
            for v in adj[u]:
                radj[v].append(u)
        if reaches_all(adj) and reaches_all(radj):
            count += 1
    return count % MOD


def factorial_mod(n):
    result = 1
    for i in range(2, n + 1):
        result = result * i % MOD
    return result


class TestStronglyConnected(unittest.TestCase):
    # By hand: the only pairing adds 2->1, giving the cycle 1->2->1.
    def test_smallest_bw(self):
        run_case(self, stdin="1\nBW\n", expected="1")

    # By hand: the only pairing adds 1->2; vertex 2 cannot reach vertex 1.
    def test_smallest_wb(self):
        run_case(self, stdin="1\nWB\n", expected="0")

    # By hand: of {2->1, 4->3} and {2->3, 4->1}, only the second is
    # strongly connected (cycle 1->2->3->4->1).
    def test_bwbw(self):
        run_case(self, stdin="2\nBWBW\n", expected="1")

    # Exhaustive enumeration with brute() over all 4! pairings.
    def test_bwwbwbwb(self):
        run_case(self, stdin="4\nBWWBWBWB\n", expected="0")

    # Exhaustive enumeration with brute() over all 9! pairings (run offline,
    # too slow to repeat here).
    def test_n9_mixed(self):
        run_case(self, stdin="9\nBWWBWBBBWWBWBBWWBW\n", expected="240792")

    # By hand: vertex 1 has no path edge into it and is white, so nothing
    # ever enters it.
    def test_first_vertex_white(self):
        run_case(self, stdin="3\nWBBWBW\n", expected="0")

    # By hand: vertex 2N has no path edge out of it and is black, so nothing
    # ever leaves it.
    def test_last_vertex_black(self):
        run_case(self, stdin="2\nBWWB\n", expected="0")

    # By hand: blacks 1..N, whites N+1..2N. Every pairing is strongly
    # connected (2N reaches some black b <= N, then the path reaches the
    # white paired with 1, so 1 is reachable from everywhere), so the
    # answer is N! = 2.
    def test_bbww(self):
        run_case(self, stdin="2\nBBWW\n", expected="2")

    # Computed with brute() over all pairings.
    def test_bbwbww(self):
        run_case(self, stdin="3\nBBWBWW\n", expected=str(brute("BBWBWW")))

    # Computed with brute() over all pairings.
    def test_bwbwbw(self):
        run_case(self, stdin="3\nBWBWBW\n", expected=str(brute("BWBWBW")))

    # Computed with brute() over all pairings.
    def test_bwbbww(self):
        run_case(self, stdin="3\nBWBBWW\n", expected=str(brute("BWBBWW")))

    # Computed with brute() over all pairings.
    def test_bwbwbwbwbw(self):
        s = "BW" * 5
        run_case(self, stdin="5\n" + s + "\n", expected=str(brute(s)))

    # Same argument as test_bbww: answer is 13! = 6227020800, which
    # exceeds the modulus, so the output is 13! mod 998244353.
    def test_modulo_applied(self):
        n = 13
        s = "B" * n + "W" * n
        run_case(self, stdin=f"{n}\n{s}\n", expected=str(factorial_mod(n)))

    # Same argument as test_bbww: answer is 1000! mod 998244353.
    def test_large_all_black_then_white(self):
        n = 1000
        s = "B" * n + "W" * n
        run_case(self, stdin=f"{n}\n{s}\n", expected=str(factorial_mod(n)))

    # Same argument as test_first_vertex_white: answer is 0.
    def test_large_all_white_then_black(self):
        n = 1000
        s = "W" * n + "B" * n
        run_case(self, stdin=f"{n}\n{s}\n", expected="0")


if __name__ == "__main__":
    unittest.main()
