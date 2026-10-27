# Public tests for "Flip Edge".
#
# spec.md keeps only the title and the input/output format. The rules
# below are those of AtCoder ABC395 E, which that title and format belong to:
# a directed graph with N vertices and M edges u_i -> v_i; you start at
# vertex 1; moving along an outgoing edge costs 1; reversing every edge
# costs X. Vertex N is guaranteed reachable.
# Constraints: 2 <= N <= 2*10^5, 1 <= M <= 2*10^5, 1 <= X <= 10^9.
# No case uses a self-loop or a repeated edge.
#
# Every expected value below was derived by hand (reasoning in each
# comment) and cross-checked with a Dijkstra over (vertex, flipped) states.
import unittest

from sandbox.check import run_case


class TestFlipEdge(unittest.TestCase):
    def test_sample_1(self):
        # 1->2->4->3->5 without flipping: 4.
        run_case(self, stdin="5 6 5\n1 2\n2 4\n3 1\n3 5\n4 3\n5 2\n", expected="4")

    def test_sample_2(self):
        # 1->2, flip (cost 1), then 2->5 along the reversed 5->2: 3.
        run_case(self, stdin="5 6 1\n1 2\n2 4\n3 1\n3 5\n4 3\n5 2\n", expected="3")

    def test_sample_3(self):
        # Edge directions alternate, so each of the 7 moves needs a flip
        # first: 7 + 7 * 613566756 = 4294967299.
        run_case(
            self,
            stdin="8 7 613566756\n2 1\n2 3\n4 3\n4 5\n6 5\n6 7\n8 7\n",
            expected="4294967299",
        )

    def test_smallest_graph_forward_edge(self):
        # N=2, the single edge 1->2: one move, no flip.
        run_case(self, stdin="2 1 1\n1 2\n", expected="1")

    def test_smallest_graph_reversed_edge_max_x(self):
        # N=2, the single edge 2->1, largest X: one flip plus one move.
        run_case(self, stdin="2 1 1000000000\n2 1\n", expected="1000000001")

    def test_flip_twice_small_x(self):
        # Edges 2->1, 2->3: flip, move 1->2, flip back, move 2->3: 1+1+1+1.
        run_case(self, stdin="3 2 1\n2 1\n2 3\n", expected="4")

    def test_flip_twice_max_x(self):
        # Same graph with X = 10^9: 2 moves + 2 flips = 2000000002.
        run_case(self, stdin="3 2 1000000000\n2 1\n2 3\n", expected="2000000002")

    def test_flip_beats_long_path(self):
        # Edge 4->1 plus the path 1->2->3->4. Flip then 1->4 costs X+1 = 2,
        # less than the 3 moves of the path.
        run_case(self, stdin="4 4 1\n4 1\n1 2\n2 3\n3 4\n", expected="2")

    def test_flip_ties_long_path(self):
        # Same graph, X=2: flip route 3, path 3.
        run_case(self, stdin="4 4 2\n4 1\n1 2\n2 3\n3 4\n", expected="3")

    def test_long_path_beats_flip(self):
        # Same graph, X=3: flip route 4, the 3-edge path wins.
        run_case(self, stdin="4 4 3\n4 1\n1 2\n2 3\n3 4\n", expected="3")

    def test_max_n_forward_chain(self):
        # N = 2*10^5, chain 1->2->...->N, so N-1 moves and no flips.
        n = 200000
        edges = "".join(f"{i} {i + 1}\n" for i in range(1, n))
        run_case(self, stdin=f"{n} {n - 1} 1000000000\n{edges}", expected=str(n - 1))

    def test_max_n_alternating_chain_max_x(self):
        # N = 2*10^5, chain edges alternate direction, starting with 2->1:
        # every one of the N-1 moves needs a flip before it, so the answer
        # is (N-1) * (X+1) = 199999 * 1000000001 = 199999000199999.
        n = 200000
        edges = "".join(
            f"{i} {i + 1}\n" if i % 2 == 0 else f"{i + 1} {i}\n" for i in range(1, n)
        )
        run_case(
            self,
            stdin=f"{n} {n - 1} 1000000000\n{edges}",
            expected=str((n - 1) * (10**9 + 1)),
        )


if __name__ == "__main__":
    unittest.main()
