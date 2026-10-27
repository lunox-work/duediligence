"""Public tests for "Maximize Distance" (spec.md).

spec.md gives no sample cases and no numeric constraints, so every case
here is hand-built and kept tiny (N <= 4, M <= 5, 1 <= K <= M, no self
loops or parallel edges, vertex N reachable from vertex 1), which any
plausible constraint set admits. Reading of the statement used: vertices
are 1..N, "first vertex" is 1 and "last vertex" is N, line `u v` is the
directed edge u -> v, and exactly K distinct edges get weight 1.

Each expected value was derived by hand (reasoning in the comment) and
cross-checked with a brute force that tries every K-subset of edges and
runs Bellman-Ford on the resulting 0/1 weights.
"""
import unittest

from sandbox.check import run_case


class TestMaximizeDistance(unittest.TestCase):
    def test_smallest_single_edge(self):
        # Only edge 1->2 must be chosen; the only path has weight 1.
        run_case(self, stdin="2 1 1\n1 2\n", expected="1")

    def test_path_k1(self):
        # 1->2->3 is the only route; either chosen edge lies on it: 1.
        run_case(self, stdin="3 2 1\n1 2\n2 3\n", expected="1")

    def test_path_all_edges_chosen(self):
        # K = M on the single route 1->2->3: both edges weigh 1, total 2.
        run_case(self, stdin="3 2 2\n1 2\n2 3\n", expected="2")

    def test_triangle_k1_cannot_block(self):
        # Routes 1->3 and 1->2->3 are edge-disjoint; one edge leaves the
        # other route at weight 0, so the answer is 0.
        run_case(self, stdin="3 3 1\n1 2\n2 3\n1 3\n", expected="0")

    def test_triangle_k2(self):
        # Subsets: {12,23} -> min(2,0)=0; {12,13} -> min(1,1)=1;
        # {23,13} -> min(1,1)=1. Maximum is 1.
        run_case(self, stdin="3 3 2\n1 2\n2 3\n1 3\n", expected="1")

    def test_triangle_k_equals_m(self):
        # All edges weigh 1; the direct edge 1->3 gives distance 1.
        run_case(self, stdin="3 3 3\n1 2\n2 3\n1 3\n", expected="1")

    def test_edge_off_every_route_is_useless(self):
        # 2->1 lies on no shortest 1->3 route; choosing {12,23} gives 2,
        # the most possible since the route has only two edges.
        run_case(self, stdin="3 3 2\n1 2\n2 3\n2 1\n", expected="2")

    def test_diamond_k1(self):
        # Edges 1->2, 1->3, 2->3, 2->4, 3->4. Routes 1-2-4 and 1-3-4 are
        # edge-disjoint, so a single weighted edge leaves one at 0.
        run_case(self, stdin="4 5 1\n1 2\n1 3\n2 3\n2 4\n3 4\n", expected="0")

    def test_diamond_k2(self):
        # {12,13} cuts every route, giving 1. Distance 2 would need both
        # edges of 1-2-4 and both of 1-3-4 (4 edges), so the answer is 1.
        run_case(self, stdin="4 5 2\n1 2\n1 3\n2 3\n2 4\n3 4\n", expected="1")

    def test_diamond_k3(self):
        # Still fewer than the 4 edges needed for distance 2; {12,13} plus
        # any edge keeps 1.
        run_case(self, stdin="4 5 3\n1 2\n1 3\n2 3\n2 4\n3 4\n", expected="1")

    def test_diamond_k4(self):
        # {12,24,13,34}: 1-2-4 = 2, 1-3-4 = 2, 1-2-3-4 = 1+0+1 = 2.
        # No choice can exceed 2, the fewest-edge route length. Answer 2.
        run_case(self, stdin="4 5 4\n1 2\n1 3\n2 3\n2 4\n3 4\n", expected="2")

    def test_diamond_k_equals_m(self):
        # All edges weigh 1: the fewest-edge route 1->2->4 has length 2.
        run_case(self, stdin="4 5 5\n1 2\n1 3\n2 3\n2 4\n3 4\n", expected="2")


if __name__ == "__main__":
    unittest.main()
