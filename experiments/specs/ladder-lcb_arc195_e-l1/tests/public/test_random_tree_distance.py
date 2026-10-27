import itertools
import unittest

from sandbox.check import run_case

MOD = 998244353


def brute(n, a, queries):
    """Sum of dist(u, v) over every parent sequence P, by enumerating all
    (N-1)! trees directly. a[i] is A_i (a[0], a[1] unused)."""
    choices = [range(1, i) for i in range(2, n + 1)]
    totals = [0] * len(queries)
    for ps in itertools.product(*choices):
        parent = [0, 0] + list(ps)
        # depth[i]: weighted distance from the root; vertices are numbered
        # so that parents come first.
        depth = [0] * (n + 1)
        level = [0] * (n + 1)
        for i in range(2, n + 1):
            depth[i] = depth[parent[i]] + a[i]
            level[i] = level[parent[i]] + 1
        for k, (u, v) in enumerate(queries):
            x, y = u, v
            while x != y:
                if level[x] < level[y]:
                    x, y = y, x
                x = parent[x]
            totals[k] += depth[u] + depth[v] - 2 * depth[x]
    return [t % MOD for t in totals]


def make_input(n, a, queries):
    lines = [f"{n} {len(queries)}", " ".join(str(x) for x in a[2:])]
    lines += [f"{u} {v}" for u, v in queries]
    return "\n".join(lines) + "\n"


def all_pairs(n):
    return [(u, v) for u in range(1, n + 1) for v in range(u + 1, n + 1)]


class TestRandomTreeDistance(unittest.TestCase):
    def check_brute(self, n, a_tail, queries):
        a = [0, 0] + a_tail
        expected = "\n".join(str(x) for x in brute(n, a, queries))
        run_case(self, stdin=make_input(n, a, queries), expected=expected)

    def test_smallest_input(self):
        # N=2: the only tree is the edge 1-2, so the answer is A_2.
        run_case(self, stdin="2 1\n100\n1 2\n", expected="100")

    def test_smallest_input_max_weight(self):
        # N=2, A_2 = 10^9: one tree, answer 10^9 mod 998244353 = 1755647.
        run_case(self, stdin="2 1\n1000000000\n1 2\n", expected="1755647")

    def test_three_vertices_by_hand(self):
        # P_2 = 1; P_3 is 1 or 2. dist(1,2) = 1 in both trees -> 2.
        # dist(1,3) = 1 (P_3=1) or 2 (P_3=2) -> 3.
        run_case(self, stdin="3 2\n1 1\n1 2\n1 3\n", expected="2\n3")

    def test_three_vertices_all_pairs_by_hand(self):
        # A_2=2, A_3=5. Tree P_3=1: d(1,2)=2, d(1,3)=5, d(2,3)=7.
        # Tree P_3=2: d(1,2)=2, d(1,3)=7, d(2,3)=5. Sums: 4, 12, 12.
        run_case(self, stdin="3 3\n2 5\n1 2\n1 3\n2 3\n", expected="4\n12\n12")

    def test_four_vertices_all_pairs_brute(self):
        # Expected from brute force over all 3! trees.
        self.check_brute(4, [3, 1, 4], all_pairs(4))

    def test_five_vertices_all_pairs_brute(self):
        # Expected from brute force over all 4! trees.
        self.check_brute(5, [7, 2, 9, 5], all_pairs(5))

    def test_six_vertices_all_pairs_brute(self):
        # Expected from brute force over all 5! trees.
        self.check_brute(6, [1, 10, 100, 1000, 10000], all_pairs(6))

    def test_seven_vertices_repeated_queries_brute(self):
        # Expected from brute force over all 6! trees; queries repeat.
        queries = [(1, 7), (6, 7), (1, 7), (2, 3), (3, 5), (6, 7)]
        self.check_brute(7, [5, 3, 8, 1, 6, 2], queries)

    def test_max_weights_modulo_brute(self):
        # Every A_i = 10^9 so sums exceed the modulus; brute force over 5! trees.
        self.check_brute(6, [10 ** 9] * 5, all_pairs(6))

    def test_max_n_root_to_vertex_two(self):
        # Vertex 2's parent is always 1, so dist(1,2) = A_2 in every tree:
        # answer = A_2 * (N-1)! mod 998244353.
        n = 200000
        a2 = 10 ** 9
        f = 1
        for i in range(1, n):
            f = f * i % MOD
        stdin = f"{n} 1\n" + " ".join([str(a2)] + ["1"] * (n - 2)) + "\n1 2\n"
        run_case(self, stdin=stdin, expected=str(a2 * f % MOD))

    def test_max_queries(self):
        # N=3, Q=2*10^5 alternating (1,2) and (1,3); per the hand count in
        # test_three_vertices_all_pairs_by_hand with A=(2,5): 4 and 12.
        q = 200000
        queries = ["1 2", "1 3"] * (q // 2)
        stdin = f"3 {q}\n2 5\n" + "\n".join(queries) + "\n"
        expected = "\n".join(["4", "12"] * (q // 2))
        run_case(self, stdin=stdin, expected=expected)


if __name__ == "__main__":
    unittest.main()
