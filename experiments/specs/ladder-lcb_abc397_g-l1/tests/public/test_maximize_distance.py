import unittest

from sandbox.check import run_case

# spec.md gives no worked samples, so every expected value below was derived
# by hand. Each small case (M <= 4) was also checked with an exhaustive brute
# force: try every choice of K edges, run a 0-1 BFS from vertex 1, and take the
# maximum distance to N.


def graph(n, k, edges):
    lines = [f"{n} {len(edges)} {k}"] + [f"{u} {v}" for u, v in edges]
    return "\n".join(lines) + "\n"


# Chain 1->2->...->30 (29 forward edges) plus 71 backward edges j->i with
# j > i (j = i+1 for i = 1..29, j = i+2 for i = 1..28, j = i+3 for i = 1..14).
# M = 29 + 29 + 28 + 14 = 100. The only edge leaving {1..i} for {i+1..30} is
# i->i+1, so every 1->30 walk uses all 29 forward edges. Making those 29 edges
# weight 1 gives distance 29, and no choice can do better because the chain
# itself has only 29 edges. So the answer is 29 for any K >= 29.
CHAIN_EDGES = (
    [(i, i + 1) for i in range(1, 30)]
    + [(i + 1, i) for i in range(1, 30)]
    + [(i + 2, i) for i in range(1, 29)]
    + [(i + 3, i) for i in range(1, 15)]
)


class TestMaximizeDistance(unittest.TestCase):
    def test_smallest_input_single_edge(self):
        # N=2, M=K=1: the only edge 1->2 gets weight 1.
        run_case(self, stdin=graph(2, 1, [(1, 2)]), expected="1")

    def test_parallel_edges_one_left_zero(self):
        # One of the two parallel 1->2 edges stays at 0.
        run_case(self, stdin=graph(2, 1, [(1, 2), (1, 2)]), expected="0")

    def test_parallel_edges_all_weighted(self):
        # K=M: both parallel edges are 1.
        run_case(self, stdin=graph(2, 2, [(1, 2), (1, 2)]), expected="1")

    def test_path_of_two_edges_k1(self):
        run_case(self, stdin=graph(3, 1, [(1, 2), (2, 3)]), expected="1")

    def test_path_of_two_edges_k2(self):
        run_case(self, stdin=graph(3, 2, [(1, 2), (2, 3)]), expected="2")

    def test_triangle_k1(self):
        # Either the shortcut 1->3 or the path 1->2->3 stays all zero.
        run_case(self, stdin=graph(3, 1, [(1, 2), (2, 3), (1, 3)]), expected="0")

    def test_triangle_k2(self):
        # Weight 1->3 and one path edge.
        run_case(self, stdin=graph(3, 2, [(1, 2), (2, 3), (1, 3)]), expected="1")

    def test_triangle_k3(self):
        # The shortcut 1->3 caps the distance at 1.
        run_case(self, stdin=graph(3, 3, [(1, 2), (2, 3), (1, 3)]), expected="1")

    def test_two_disjoint_paths_k2(self):
        # Paths 1->2->4 and 1->3->4; one edge on each gives 1.
        edges = [(1, 2), (2, 4), (1, 3), (3, 4)]
        run_case(self, stdin=graph(4, 2, edges), expected="1")

    def test_two_disjoint_paths_k3(self):
        # With 3 ones, some path has at most one weighted edge.
        edges = [(1, 2), (2, 4), (1, 3), (3, 4)]
        run_case(self, stdin=graph(4, 3, edges), expected="1")

    def test_two_disjoint_paths_k4(self):
        edges = [(1, 2), (2, 4), (1, 3), (3, 4)]
        run_case(self, stdin=graph(4, 4, edges), expected="2")

    def test_extra_edges_off_any_path(self):
        # Only 1->3 lies on a 1->3 path; 3->1 and 2->1 do not, so the
        # remaining ones go to them and the answer stays 1.
        edges = [(1, 3), (3, 1), (2, 1)]
        run_case(self, stdin=graph(3, 2, edges), expected="1")

    def test_max_n_single_edge(self):
        # N=30, vertices 2..29 isolated, only edge 1->30.
        run_case(self, stdin=graph(30, 1, [(1, 30)]), expected="1")

    def test_max_m_parallel_edges_one_left_zero(self):
        # 100 parallel 1->30 edges, K=99: one edge stays at 0.
        run_case(self, stdin=graph(30, 99, [(1, 30)] * 100), expected="0")

    def test_max_m_parallel_edges_all_weighted(self):
        # 100 parallel 1->30 edges, K=M=100: all are 1.
        run_case(self, stdin=graph(30, 100, [(1, 30)] * 100), expected="1")

    def test_max_chain_k_equals_chain_length(self):
        # See CHAIN_EDGES: weight exactly the 29 forward edges.
        run_case(self, stdin=graph(30, 29, CHAIN_EDGES), expected="29")

    def test_max_chain_k_equals_m(self):
        # Every edge is 1; the distance is the 29 forward edges.
        run_case(self, stdin=graph(30, 100, CHAIN_EDGES), expected="29")

    def test_max_chain_k_below_chain_length(self):
        # K=28 < 29: some forward edge stays 0, so the answer is at most 28;
        # weighting the other 28 forward edges reaches 28.
        run_case(self, stdin=graph(30, 28, CHAIN_EDGES), expected="28")


if __name__ == "__main__":
    unittest.main()
