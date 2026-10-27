"""Public tests for Broken Wheel.

The statement in spec.md shows no sample inputs, so every expected value
here is either computed by the brute force below (tiny inputs) or follows
from the all-zeros argument in test_all_zeros_max_n.
"""

import unittest
from itertools import product

from sandbox.check import run_case

MOD = 998244353


def brute(s):
    """Try every orientation of every edge of G and count the distinct
    in-degree sequences (d_0, ..., d_N). Exponential; tiny inputs only."""
    n = len(s)
    edges = [(i, (i + 1) % n) for i in range(n)]
    edges += [(i, n) for i in range(n) if s[i] == "1"]
    seen = set()
    for choice in product((0, 1), repeat=len(edges)):
        deg = [0] * (n + 1)
        for (u, v), c in zip(edges, choice):
            deg[v if c else u] += 1
        seen.add(tuple(deg))
    return len(seen) % MOD


def case(tc, s):
    run_case(tc, stdin=f"{len(s)}\n{s}\n", expected=str(brute(s)))


class TestBrokenWheel(unittest.TestCase):
    # Smallest N = 3: all eight strings, expected by brute force.
    def test_n3_000(self):
        case(self, "000")

    def test_n3_001(self):
        case(self, "001")

    def test_n3_010(self):
        case(self, "010")

    def test_n3_011(self):
        case(self, "011")

    def test_n3_100(self):
        case(self, "100")

    def test_n3_101(self):
        case(self, "101")

    def test_n3_110(self):
        case(self, "110")

    def test_n3_111(self):
        case(self, "111")

    # Slightly larger tiny inputs, expected by brute force.
    def test_n4_all_ones(self):
        case(self, "1111")

    def test_n4_0101(self):
        case(self, "0101")

    def test_n5_10000(self):
        case(self, "10000")

    def test_n5_11010(self):
        case(self, "11010")

    def test_n6_all_ones(self):
        case(self, "111111")

    def test_n6_100100(self):
        case(self, "100100")

    def test_n7_0110001(self):
        case(self, "0110001")

    def test_n8_all_zeros(self):
        case(self, "00000000")

    def test_n8_10110010(self):
        case(self, "10110010")

    def test_n9_all_ones(self):
        case(self, "111111111")

    def test_n10_0000011111(self):
        case(self, "0000011111")

    def test_all_zeros_max_n(self):
        # All zeros: G is an N-cycle plus isolated vertex N (d_N = 0). If
        # some d_i is 0 or 2, both edges at i are forced and the rest of
        # the cycle follows, so each such sequence comes from exactly one
        # orientation; all d_i = 1 comes from the two cyclic orientations.
        # Hence 2^N - 1 distinct sequences (checked against brute force by
        # test_n3_000 and test_n8_all_zeros).
        n = 10**6
        expected = (pow(2, n, MOD) - 1) % MOD
        run_case(self, stdin=f"{n}\n{'0' * n}\n", expected=str(expected))


if __name__ == "__main__":
    unittest.main()
