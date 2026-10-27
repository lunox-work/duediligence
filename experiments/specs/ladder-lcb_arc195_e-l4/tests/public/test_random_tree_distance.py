# spec.md carries only the title and the input/output format. These cases
# assume the original problem it names (AtCoder ARC195 E "Random Tree
# Distance"): for every sequence P = (P_2, ..., P_N) with 1 <= P_i <= i - 1,
# T(P) is the tree on vertices 1..N where i's parent is P_i via an edge of
# weight A_i; each query (u, v) asks for the sum over all (N-1)! sequences P
# of the u-v distance in T(P), modulo 998244353.
# Constraints: 2 <= N <= 2*10^5, 1 <= Q <= 2*10^5, 1 <= A_i <= 10^9,
# 1 <= u_i < v_i <= N.
import itertools
import unittest

from sandbox.check import run_case

MOD = 998244353


def brute(n, a, queries):
    """Sum of distances over every parent sequence, enumerated outright.
    a[i] is the weight of the edge from i to its parent (indices 2..n)."""
    sums = [0] * len(queries)
    for p in itertools.product(*(range(1, i) for i in range(2, n + 1))):
        parent = {i: p[i - 2] for i in range(2, n + 1)}
        dist_root = {1: 0}
        for i in range(2, n + 1):
            dist_root[i] = dist_root[parent[i]] + a[i]
        for k, (u, v) in enumerate(queries):
            ancestors = {u}
            x = u
            while x != 1:
                x = parent[x]
                ancestors.add(x)
            w = v
            while w not in ancestors:
                w = parent[w]
            sums[k] += dist_root[u] + dist_root[v] - 2 * dist_root[w]
    return [s % MOD for s in sums]


def case(n, weights, queries):
    """stdin and expected output for weights A_2..A_N, answers by brute force."""
    a = [0, 0] + list(weights)
    stdin = f"{n} {len(queries)}\n{' '.join(map(str, weights))}\n"
    stdin += "".join(f"{u} {v}\n" for u, v in queries)
    expected = "\n".join(map(str, brute(n, a, queries)))
    return stdin, expected


class TestRandomTreeDistance(unittest.TestCase):
    def test_sample_1(self):
        # ARC195 E sample 1. By hand: P_2 = 1 always and P_3 is 1 or 2, so
        # dist(1,2) = 1 + 1 = 2 and dist(1,3) = 1 + (1 + 1) = 3.
        run_case(self, stdin="3 2\n1 1\n1 2\n1 3\n", expected="2\n3")

    def test_smallest_input(self):
        # N = 2: the only tree is the single edge 1-2 of weight A_2.
        run_case(self, stdin="2 1\n1\n1 2\n", expected="1")

    def test_smallest_input_max_weight(self):
        # N = 2, A_2 = 10^9: one tree, distance 10^9, reduced mod 998244353.
        run_case(self, stdin="2 1\n1000000000\n1 2\n", expected=str(10**9 % MOD))

    def test_n3_max_weights_all_pairs(self):
        # By hand with A_2 = A_3 = W = 10^9. P_3 = 1: dist(1,3) = W,
        # dist(2,3) = 2W. P_3 = 2: dist(1,3) = 2W, dist(2,3) = W.
        # dist(1,2) = W in both trees. Sums: 2W, 3W, 3W.
        w = 10**9
        run_case(
            self,
            stdin=f"3 3\n{w} {w}\n1 2\n1 3\n2 3\n",
            expected=f"{2 * w % MOD}\n{3 * w % MOD}\n{3 * w % MOD}",
        )

    def test_n4_all_pairs_brute(self):
        # Expected by enumerating all 3! = 6 trees.
        queries = [(u, v) for u in range(1, 5) for v in range(u + 1, 5)]
        stdin, expected = case(4, [3, 1, 4], queries)
        run_case(self, stdin=stdin, expected=expected)

    def test_n5_all_pairs_brute(self):
        # Expected by enumerating all 4! = 24 trees.
        queries = [(u, v) for u in range(1, 6) for v in range(u + 1, 6)]
        stdin, expected = case(5, [1, 2, 3, 4], queries)
        run_case(self, stdin=stdin, expected=expected)

    def test_n6_distinct_weights_brute(self):
        # Expected by enumerating all 5! = 120 trees.
        queries = [(1, 6), (2, 3), (2, 6), (4, 5), (5, 6), (3, 6)]
        stdin, expected = case(6, [7, 1, 9, 2, 5], queries)
        run_case(self, stdin=stdin, expected=expected)

    def test_n7_max_weights_brute(self):
        # Expected by enumerating all 6! = 720 trees; every weight is 10^9,
        # so the sums exceed the modulus and must be reduced.
        queries = [(u, v) for u in range(1, 8) for v in range(u + 1, 8)]
        stdin, expected = case(7, [10**9] * 6, queries)
        run_case(self, stdin=stdin, expected=expected)

    def test_n7_mixed_weights_brute(self):
        # Expected by enumerating all 6! = 720 trees.
        queries = [(1, 7), (6, 7), (2, 5), (3, 4), (1, 2), (4, 7)]
        stdin, expected = case(7, [1000000000, 1, 999999999, 2, 123456789, 3], queries)
        run_case(self, stdin=stdin, expected=expected)

    def test_largest_n_and_q(self):
        # N = Q = 2*10^5, every A_i = 10^9, every query (1, 2). Vertex 2 always
        # has parent 1, so dist(1,2) = A_2 in each of the (N-1)! trees and the
        # answer is A_2 * (N-1)! mod 998244353.
        n = q = 200000
        fact = 1
        for i in range(1, n):
            fact = fact * i % MOD
        answer = str(10**9 * fact % MOD)
        stdin = f"{n} {q}\n" + " ".join(["1000000000"] * (n - 1)) + "\n" + "1 2\n" * q
        run_case(self, stdin=stdin, expected="\n".join([answer] * q))


if __name__ == "__main__":
    unittest.main()
