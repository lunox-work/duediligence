"""Public tests for "Maximize Distance" (spec.md).

spec.md contains no sample cases and no constraints section, so there are
no statement samples to reproduce here. Every case stays small (N <= 30,
M <= 100, 1 <= K <= M, u_j != v_j) and keeps vertex N reachable from
vertex 1, as the statement guarantees.

Expected answers for tiny graphs are derived by hand and cross-checked by
`brute`, which tries every choice of K edges and takes the largest 0/1
shortest distance from 1 to N. The larger cases are a single forward path
(optionally with extra backward edges) where the answer follows directly:
every walk from 1 to N uses each path edge, so the distance is the number
of weighted path edges, at most min(K, N - 1).
"""
import itertools
import unittest

from sandbox.check import run_case


def brute(stdin):
    """Exhaustive answer for a tiny input: all C(M, K) weightings, Bellman-Ford on each."""
    tokens = stdin.split()
    n, m, k = int(tokens[0]), int(tokens[1]), int(tokens[2])
    edges = [(int(tokens[3 + 2 * j]), int(tokens[4 + 2 * j])) for j in range(m)]
    best = 0
    for chosen in itertools.combinations(range(m), k):
        weight = [0] * m
        for j in chosen:
            weight[j] = 1
        inf = float("inf")
        dist = [inf] * (n + 1)
        dist[1] = 0
        for _ in range(n):
            for j, (u, v) in enumerate(edges):
                if dist[u] + weight[j] < dist[v]:
                    dist[v] = dist[u] + weight[j]
        best = max(best, dist[n])
    return str(best)


def graph(n, k, edges):
    lines = [f"{n} {len(edges)} {k}"] + [f"{u} {v}" for u, v in edges]
    return "\n".join(lines) + "\n"


# Forward path 1 -> 2 -> ... -> 30.
PATH_30 = [(i, i + 1) for i in range(1, 30)]
# 71 distinct backward edges (u > v + 1); none of them can shorten a 1 -> 30 walk.
BACKWARD_71 = [(u, v) for u in range(3, 31) for v in range(1, u - 1)][:71]


class TestMaximizeDistance(unittest.TestCase):
    def check(self, stdin, expected):
        # Self-check of the hand-derived answer before running the program.
        self.assertEqual(brute(stdin), expected)
        run_case(self, stdin=stdin, expected=expected)

    # --- smallest inputs -------------------------------------------------

    def test_single_edge(self):
        # N=2, one edge 1->2 forced to weight 1: distance 1.
        self.check("2 1 1\n1 2\n", "1")

    def test_two_vertices_edge_both_directions_k1(self):
        # Weight 1->2; the 2->1 edge never lies on a path to vertex 2.
        self.check("2 2 1\n1 2\n2 1\n", "1")

    def test_two_vertices_edge_both_directions_k2(self):
        # Both weighted; only 1->2 matters: distance 1.
        self.check("2 2 2\n1 2\n2 1\n", "1")

    def test_parallel_edges_one_weighted(self):
        # Two parallel 1->2 edges, only one can be weighted; the other stays 0.
        self.check("2 2 1\n1 2\n1 2\n", "0")

    def test_parallel_edges_both_weighted(self):
        self.check("2 2 2\n1 2\n1 2\n", "1")

    # --- small hand-derived graphs ---------------------------------------

    def test_triangle_with_shortcut(self):
        # Direct edge 1->3 caps the answer at 1; weight it and 1->2: distance 1.
        self.check("3 3 2\n1 2\n2 3\n1 3\n", "1")

    def test_k_equals_m_is_unweighted_bfs(self):
        # All edges weight 1: the hop distance 1->3 via the 1->3 edge is 1.
        self.check("3 3 3\n1 2\n2 3\n1 3\n", "1")

    def test_two_routes_merging(self):
        # Weight 2->4, 1->2 and one of 1->3 / 3->2: both routes cost 2.
        # 3 is impossible since 1->2->4 has only two edges.
        self.check("4 4 3\n1 2\n1 3\n3 2\n2 4\n", "2")

    def test_two_disjoint_routes_k1(self):
        # One weighted edge leaves the other route free: distance 0.
        self.check("4 4 1\n1 2\n2 4\n1 3\n3 4\n", "0")

    def test_two_disjoint_routes_k2(self):
        # One weight on each route: distance 1.
        self.check("4 4 2\n1 2\n2 4\n1 3\n3 4\n", "1")

    def test_two_disjoint_routes_k3(self):
        # Third weight makes one route cost 2, the other still costs 1.
        self.check("4 4 3\n1 2\n2 4\n1 3\n3 4\n", "1")

    def test_two_disjoint_routes_k4(self):
        self.check("4 4 4\n1 2\n2 4\n1 3\n3 4\n", "2")

    def test_useless_edges_present(self):
        # Edges into 1 or out of 3 lie on no shortest 1->3 path; with K=1,
        # weight 1->3 itself (the 1->2->3 route does not exist: no 2->3 edge).
        self.check("3 4 1\n1 3\n3 1\n2 1\n3 2\n", "1")

    def test_useless_edges_soak_up_extra_k(self):
        # K=3 still gives 1: the only 1->3 path is the single edge 1->3.
        self.check("3 4 3\n1 3\n3 1\n2 1\n3 2\n", "1")

    # --- small graphs answered by brute force alone ----------------------

    def test_brute_dag_five_vertices(self):
        stdin = graph(5, 3, [(1, 2), (1, 3), (2, 3), (2, 4), (3, 4), (3, 5), (4, 5), (1, 4)])
        # Answer computed by `brute` (all C(8,3) weightings).
        self.check(stdin, brute(stdin))

    def test_brute_with_cycle(self):
        stdin = graph(5, 4, [(1, 2), (2, 1), (2, 3), (3, 2), (3, 5), (2, 4), (4, 5), (1, 3), (4, 3)])
        # Answer computed by `brute` (all C(9,4) weightings).
        self.check(stdin, brute(stdin))

    # --- largest sizes ---------------------------------------------------

    def test_path_30_all_weighted(self):
        # Single path of 29 edges, all weighted: distance 29.
        run_case(self, stdin=graph(30, 29, PATH_30), expected="29")

    def test_path_30_partial(self):
        # Any 10 edges of the only path are all on it: distance 10.
        run_case(self, stdin=graph(30, 10, PATH_30), expected="10")

    def test_path_with_backward_edges_k1(self):
        # M=100; the single weight goes on a path edge: distance 1.
        run_case(self, stdin=graph(30, 1, PATH_30 + BACKWARD_71), expected="1")

    def test_path_with_backward_edges_k50(self):
        # 29 path edges can all be weighted; extra weights are irrelevant: 29.
        run_case(self, stdin=graph(30, 50, PATH_30 + BACKWARD_71), expected="29")

    def test_path_with_backward_edges_k_equals_m(self):
        # Every edge weighted: the hop distance along the path is 29.
        run_case(self, stdin=graph(30, 100, PATH_30 + BACKWARD_71), expected="29")


if __name__ == "__main__":
    unittest.main()
