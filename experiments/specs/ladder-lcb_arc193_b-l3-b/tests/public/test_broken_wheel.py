import unittest

from sandbox.check import run_case

MOD = 998244353


def brute(s):
    """Count distinct in-degree sequences by trying every orientation of
    every edge of G. Only for tiny N (at most 2N edges, 2^(2N) orientations)."""
    n = len(s)
    edges = [(i, (i + 1) % n) for i in range(n)]
    edges += [(i, n) for i in range(n) if s[i] == "1"]
    seen = set()
    for mask in range(1 << len(edges)):
        deg = [0] * (n + 1)
        for k, (u, v) in enumerate(edges):
            deg[v if mask >> k & 1 else u] += 1
        seen.add(tuple(deg))
    return len(seen) % MOD


def case(s):
    return f"{len(s)}\n{s}\n", str(brute(s))


class TestBrokenWheel(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="3\n010\n", expected="14")

    def test_sample_2(self):
        run_case(self, stdin="20\n00001100111010100101\n", expected="261339902")

    def test_smallest_no_spokes(self):
        # Triangle with isolated vertex 3: the two cyclic orientations give
        # (1,1,1,0); the six transitive ones give the permutations of (0,1,2)
        # with d_3 = 0. Total 7 (by hand).
        run_case(self, stdin="3\n000\n", expected="7")

    def test_smallest_all_spokes(self):
        stdin, expected = case("111")  # brute force over all orientations
        run_case(self, stdin=stdin, expected=expected)

    def test_smallest_one_spoke_at_zero(self):
        stdin, expected = case("100")  # brute force
        run_case(self, stdin=stdin, expected=expected)

    def test_smallest_two_spokes(self):
        stdin, expected = case("110")  # brute force
        run_case(self, stdin=stdin, expected=expected)

    def test_n4_all_spokes(self):
        stdin, expected = case("1111")  # brute force
        run_case(self, stdin=stdin, expected=expected)

    def test_n5_alternating(self):
        stdin, expected = case("10100")  # brute force
        run_case(self, stdin=stdin, expected=expected)

    def test_n6_mixed(self):
        stdin, expected = case("011010")  # brute force
        run_case(self, stdin=stdin, expected=expected)

    def test_n7_last_spoke_only(self):
        stdin, expected = case("0000001")  # brute force
        run_case(self, stdin=stdin, expected=expected)

    def test_n8_all_spokes(self):
        stdin, expected = case("11111111")  # brute force
        run_case(self, stdin=stdin, expected=expected)

    def test_largest_no_spokes(self):
        # With no spokes G' is an oriented N-cycle plus isolated vertex N.
        # Fixing one cycle edge's direction, each d_i forces the next edge,
        # so a sequence comes from at most two orientations, which are
        # reverses of each other; reversal keeps all in-degrees only for the
        # two cyclic orientations (all d_i = 1). Hence 2^N - 1 sequences.
        n = 10 ** 6
        run_case(self, stdin=f"{n}\n{'0' * n}\n",
                 expected=str((pow(2, n, MOD) - 1) % MOD))


if __name__ == "__main__":
    unittest.main()
