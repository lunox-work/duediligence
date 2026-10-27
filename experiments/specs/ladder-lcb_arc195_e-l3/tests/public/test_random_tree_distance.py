import itertools
import unittest

from sandbox.check import run_case

MOD = 998244353


def brute(n, a, queries):
    """Enumerate every parent choice (vertex i picks a parent in 1..i-1),
    walk both endpoints up to their lowest common ancestor in each tree,
    and sum the path weights. a[i] is the weight of edge i -> parent(i)."""
    totals = [0] * len(queries)
    for parents in itertools.product(*[range(1, i) for i in range(2, n + 1)]):
        par = {i: parents[i - 2] for i in range(2, n + 1)}
        for k, (u, v) in enumerate(queries):
            d = 0
            # Parents always have smaller labels, so stepping up the larger
            # label until the two meet reaches the LCA.
            while u != v:
                if u > v:
                    d += a[u]
                    u = par[u]
                else:
                    d += a[v]
                    v = par[v]
            totals[k] += d
    return [t % MOD for t in totals]


def make_input(n, weights, queries):
    lines = [f"{n} {len(queries)}", " ".join(map(str, weights))]
    lines += [f"{u} {v}" for u, v in queries]
    return "\n".join(lines) + "\n"


def brute_case(tc, n, weights, queries):
    a = {i: w for i, w in zip(range(2, n + 1), weights)}
    expected = "\n".join(map(str, brute(n, a, queries)))
    run_case(tc, stdin=make_input(n, weights, queries), expected=expected)


class TestRandomTreeDistance(unittest.TestCase):
    def test_smallest_tree_single_edge(self):
        # N=2: the only tree is the edge 2-1 of weight 5.
        run_case(self, stdin="2 1\n5\n1 2\n", expected="5")

    def test_three_vertices_unit_weights(self):
        # By hand: vertex 3's parent is 1 or 2 (two trees), 2's parent is 1.
        # d(1,2) = 1+1 = 2; d(1,3) = 1 (p=1) + 2 (p=2) = 3;
        # d(2,3) = 2 (p=1) + 1 (p=2) = 3.
        run_case(self, stdin="3 3\n1 1\n1 2\n1 3\n2 3\n", expected="2\n3\n3")

    def test_three_vertices_distinct_weights(self):
        # By hand with A_2=2, A_3=7: d(1,2) = 2+2 = 4;
        # d(1,3) = 7 (p=1) + 9 (p=2) = 16; d(2,3) = 9 (p=1) + 7 (p=2) = 16.
        run_case(self, stdin="3 3\n2 7\n1 2\n1 3\n2 3\n", expected="4\n16\n16")

    def test_repeated_query(self):
        # The same pair asked twice gets the same answer (N=3 values above).
        run_case(self, stdin="3 2\n1 1\n1 3\n1 3\n", expected="3\n3")

    def test_four_vertices_all_pairs_brute(self):
        # Expected values from the exhaustive enumeration in brute().
        pairs = [(u, v) for u in range(1, 5) for v in range(u + 1, 5)]
        brute_case(self, 4, [3, 1, 4], pairs)

    def test_six_vertices_brute(self):
        # Expected values from the exhaustive enumeration in brute() (120 trees).
        brute_case(self, 6, [5, 2, 9, 1, 6], [(1, 6), (2, 5), (3, 4), (4, 6), (1, 2), (5, 6)])

    def test_eight_vertices_answer_wraps_modulus_brute(self):
        # 5040 trees with weights near 10^9, so every total exceeds 998244353
        # and must be reduced. Expected values from brute() with exact integers.
        brute_case(
            self,
            8,
            [999999999, 123456789, 987654321, 1000000000, 555555555, 777777777, 314159265],
            [(1, 8), (2, 7), (3, 5), (6, 8), (1, 2)],
        )

    def test_nine_vertices_large_weights_brute(self):
        # 40320 trees; expected values from brute() with exact integers.
        brute_case(
            self,
            9,
            [765689282, 93267307, 563699854, 951829154, 801512848, 389123318, 924504746, 596035433],
            [(3, 8), (2, 5), (5, 8), (2, 9), (8, 9), (5, 7)],
        )


if __name__ == "__main__":
    unittest.main()
