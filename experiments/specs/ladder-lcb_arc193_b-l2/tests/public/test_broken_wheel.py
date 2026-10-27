import itertools
import unittest

from sandbox.check import run_case

MOD = 998244353


def brute(s):
    """Count distinct in-degree sequences by trying every orientation of
    every edge of G, straight from the statement. Only for tiny N."""
    n = len(s)
    edges = [(i, (i + 1) % n) for i in range(n)]
    edges += [(i, n) for i in range(n) if s[i] == "1"]
    seen = set()
    for heads in itertools.product((0, 1), repeat=len(edges)):
        d = [0] * (n + 1)
        for (u, v), h in zip(edges, heads):
            d[v if h else u] += 1
        seen.add(tuple(d))
    return len(seen) % MOD


def case(tc, s):
    run_case(tc, stdin=f"{len(s)}\n{s}\n", expected=str(brute(s)))


class TestBrokenWheel(unittest.TestCase):
    # G must be simple, so N >= 3 (N = 1 gives a self-loop, N = 2 a
    # double edge). Expected values for these small cases come from
    # brute() above, which enumerates all 2^|E| orientations.

    # Smallest N, every string.
    def test_n3_000(self):
        case(self, "000")

    def test_n3_001(self):
        case(self, "001")

    def test_n3_010(self):
        case(self, "010")

    def test_n3_100(self):
        case(self, "100")

    def test_n3_011(self):
        case(self, "011")

    def test_n3_101(self):
        case(self, "101")

    def test_n3_110(self):
        case(self, "110")

    def test_n3_111(self):
        case(self, "111")

    # Slightly larger, mixed spokes (brute force).
    def test_n4_0101(self):
        case(self, "0101")

    def test_n4_1100(self):
        case(self, "1100")

    def test_n4_1111(self):
        case(self, "1111")

    def test_n5_10010(self):
        case(self, "10010")

    def test_n5_11011(self):
        case(self, "11011")

    def test_n6_100000(self):
        case(self, "100000")

    def test_n6_010110(self):
        case(self, "010110")

    def test_n7_1010101(self):
        case(self, "1010101")

    def test_n7_1111111(self):
        case(self, "1111111")

    def test_n8_00100110(self):
        case(self, "00100110")

    def test_n8_11111111(self):
        case(self, "11111111")

    # No spokes: G is a cycle plus isolated vertex N (d_N = 0). With x_i = 1
    # when edge {i, i+1} points to i+1, d_i = x_{i-1} + 1 - x_i, so x_0 and
    # d fix the orientation; only the all-ones d comes from two orientations
    # (both cyclic ones). Answer: 2^N - 1, checked against brute() for small N.
    def test_no_spokes_n10(self):
        self.assertEqual(brute("0" * 10), 2 ** 10 - 1)
        run_case(self, stdin="10\n" + "0" * 10 + "\n", expected=str(2 ** 10 - 1))

    def test_no_spokes_n100_modulo(self):
        n = 100
        run_case(self, stdin=f"{n}\n{'0' * n}\n", expected=str((pow(2, n, MOD) - 1) % MOD))

    def test_no_spokes_n1000_modulo(self):
        n = 1000
        run_case(self, stdin=f"{n}\n{'0' * n}\n", expected=str((pow(2, n, MOD) - 1) % MOD))


if __name__ == "__main__":
    unittest.main()
