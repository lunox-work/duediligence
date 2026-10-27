import itertools
import unittest

from sandbox.check import run_case

MOD = 998244353


def brute(a, queries):
    """Sum of dist(u, v) over every P with 1 <= P_i <= i-1, mod 998244353.

    Enumerates all (N-1)! parent sequences directly, so it is only used
    for N <= 7. a[i] is the weight of the edge from i to P_i (a[0], a[1]
    unused)."""
    n = len(a) - 1
    sums = [0] * len(queries)
    for parents in itertools.product(*[range(1, i) for i in range(2, n + 1)]):
        par = [0, 0] + list(parents)
        depth = [0] * (n + 1)
        for i in range(2, n + 1):
            depth[i] = depth[par[i]] + 1
        for k, (u, v) in enumerate(queries):
            d = 0
            while u != v:
                if depth[u] < depth[v]:
                    u, v = v, u
                d += a[u]
                u = par[u]
            sums[k] += d
    return [s % MOD for s in sums]


def make_input(weights, queries):
    """weights = [A_2, ..., A_N]."""
    lines = [f"{len(weights) + 1} {len(queries)}", " ".join(map(str, weights))]
    lines += [f"{u} {v}" for u, v in queries]
    return "\n".join(lines) + "\n"


def check_brute(tc, weights, queries):
    expected = brute([0, 0] + list(weights), queries)
    run_case(tc, stdin=make_input(weights, queries),
             expected="\n".join(map(str, expected)))


def all_pairs(n):
    return [(u, v) for u in range(1, n + 1) for v in range(u + 1, n + 1)]


class TestRandomTreeDistance(unittest.TestCase):
    # The statement contains no sample cases; every expected value below
    # is derived by hand or by the exhaustive enumeration in brute().

    def test_smallest_tree(self):
        # N = 2: the only tree is the edge 1-2 of weight A_2 = 5.
        run_case(self, stdin="2 1\n5\n1 2\n", expected="5")

    def test_smallest_tree_large_weight_reduced_mod(self):
        # N = 2, A_2 = 10^9: one tree, distance 10^9;
        # 10^9 - 998244353 = 1755647.
        run_case(self, stdin="2 1\n1000000000\n1 2\n", expected="1755647")

    def test_n3_all_pairs_by_hand(self):
        # A_2 = 2, A_3 = 3. Trees: P_3 = 1 or P_3 = 2.
        # d(1,2) = 2 + 2 = 4; d(1,3) = 3 + (2+3) = 8; d(2,3) = (2+3) + 3 = 8.
        run_case(self, stdin="3 3\n2 3\n1 2\n1 3\n2 3\n", expected="4\n8\n8")

    def test_n3_repeated_query(self):
        # Same derivation as above with A_2 = 1, A_3 = 1:
        # d(1,3) = 1 + 2 = 3, asked twice; d(1,2) = 2.
        run_case(self, stdin="3 3\n1 1\n1 3\n1 2\n1 3\n", expected="3\n2\n3")

    def test_n4_unit_weights_brute(self):
        check_brute(self, [1, 1, 1], all_pairs(4))

    def test_n5_distinct_weights_brute(self):
        check_brute(self, [3, 1, 4, 1], all_pairs(5))

    def test_n6_max_weights_mod_wrap_brute(self):
        # All weights 10^9, so the sums exceed the modulus.
        check_brute(self, [10**9] * 5, all_pairs(6))

    def test_n7_mixed_weights_brute(self):
        check_brute(self, [7, 1000000000, 2, 999999999, 5, 123456789],
                    all_pairs(7))

    def test_n7_queries_involving_last_vertex_brute(self):
        check_brute(self, [10**9, 1, 10**9, 1, 10**9, 1],
                    [(6, 7), (1, 7), (2, 7), (1, 2), (6, 7)])


if __name__ == "__main__":
    unittest.main()
