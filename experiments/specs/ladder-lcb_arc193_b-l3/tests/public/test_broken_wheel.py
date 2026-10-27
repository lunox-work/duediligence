# The statement gives no samples and no constraints. Every expected value
# below is either computed by brute() -- every orientation of every edge
# enumerated, distinct in-degree tuples counted -- on a tiny wheel, or
# follows from the closed form argued in test_no_spokes_n64.
#
# Graph as the statement describes it: cycle vertices 0..N-1 with edges
# i -- (i+1) mod N, and an edge i -- center whenever s_i is 1. Only N >= 3
# is used, so the cycle is simple. Whether the center's in-degree counts
# as part of the sequence does not change the answer: it equals the edge
# count minus the cycle vertices' in-degrees, so it is determined by them.
import unittest
from itertools import product

from sandbox.check import run_case

MOD = 998244353


def brute(s):
    n = len(s)
    center = n
    edges = [(i, (i + 1) % n) for i in range(n)]
    edges += [(i, center) for i in range(n) if s[i] == "1"]
    seen = set()
    for bits in product((0, 1), repeat=len(edges)):
        deg = [0] * (n + 1)
        for (u, v), b in zip(edges, bits):
            deg[v if b else u] += 1
        seen.add(tuple(deg))
    return len(seen) % MOD


class TestBrokenWheel(unittest.TestCase):
    def check_brute(self, s):
        run_case(self, stdin=f"{len(s)}\n{s}\n", expected=str(brute(s)))

    # Smallest wheel, N = 3, every spoke pattern up to rotation.
    def test_n3_no_spokes(self):
        self.check_brute("000")  # brute force: 7

    def test_n3_one_spoke_middle(self):
        self.check_brute("010")  # brute force: 14

    def test_n3_one_spoke_last(self):
        self.check_brute("001")  # brute force: 14

    def test_n3_two_spokes(self):
        self.check_brute("011")  # brute force: 24

    def test_n3_all_spokes(self):
        self.check_brute("111")  # brute force: 38

    def test_n4_no_spokes(self):
        self.check_brute("0000")  # brute force: 15

    def test_n4_alternating_spokes(self):
        self.check_brute("0101")  # brute force: 54

    def test_n4_adjacent_spokes(self):
        self.check_brute("0110")  # brute force: 52

    def test_n4_all_spokes(self):
        self.check_brute("1111")  # brute force: 134

    def test_n5_all_spokes(self):
        self.check_brute("11111")  # brute force: 462

    def test_n5_spokes_10101(self):
        self.check_brute("10101")  # brute force: 190

    def test_n6_all_spokes(self):
        self.check_brute("111111")  # brute force: 1582

    def test_n6_spokes_100110(self):
        self.check_brute("100110")  # brute force: 398

    def test_n7_spokes_1101001(self):
        self.check_brute("1101001")  # brute force: 1366

    def test_no_spokes_n64(self):
        # With no spokes the center is isolated and the graph is a plain
        # N-cycle. If some vertex has in-degree 0 or 2, both its edges are
        # fixed, and walking around the cycle each next vertex's in-degree
        # fixes its other edge, so the orientation is unique. If every
        # in-degree is 1, exactly the two cyclic orientations give it. So
        # the 2^N orientations give 2^N - 1 sequences (brute force agrees
        # for N = 3..6: 7, 15, 31, 63). 2^64 - 1 exceeds the modulus.
        n = 64
        run_case(self, stdin=f"{n}\n{'0' * n}\n", expected=str((pow(2, n, MOD) - 1) % MOD))


if __name__ == "__main__":
    unittest.main()
