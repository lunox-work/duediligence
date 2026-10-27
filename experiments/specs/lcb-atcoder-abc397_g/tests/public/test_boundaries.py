import unittest

from sandbox.check import run_case


def chain_with_back_edges(k):
    # N=30, M=100: forward chain 1->2->...->30 (29 edges), then 71 backward
    # edges (i+1 -> i for i=1..29, cycled). Every edge out of i goes to i+1
    # or i-1, so the only simple path from 1 to 30 is the forward chain and
    # the distance is the number of weighted forward edges: min(K, 29).
    edges = [(i, i + 1) for i in range(1, 30)]
    back = [(i + 1, i) for i in range(1, 30)]
    edges += [back[j % 29] for j in range(71)]
    lines = ["30 100 %d" % k] + ["%d %d" % e for e in edges]
    return "\n".join(lines) + "\n"


class TestBoundaries(unittest.TestCase):
    def test_smallest_input(self):
        # N=2, M=1, K=1: the single edge 1->2 gets weight 1.
        run_case(self, stdin="2 1 1\n1 2\n", expected="1\n")

    def test_all_edges_weighted_parallel(self):
        # K=M: every copy of 1->2 has weight 1, so the distance is 1.
        run_case(self, stdin="2 2 2\n1 2\n1 2\n", expected="1\n")

    def test_max_multi_edges_one_left_zero(self):
        # 100 copies of 1->2 with K=99: one copy stays weight 0, distance 0.
        stdin = "2 100 99\n" + "1 2\n" * 100
        run_case(self, stdin=stdin, expected="0\n")

    def test_max_multi_edges_all_weighted(self):
        # 100 copies of 1->2 with K=M=100: every copy has weight 1, distance 1.
        stdin = "2 100 100\n" + "1 2\n" * 100
        run_case(self, stdin=stdin, expected="1\n")

    def test_k_equals_m_is_unweighted_bfs_distance(self):
        # K=M: all weights 1, so the answer is the BFS distance 1->3->4 = 2.
        run_case(self, stdin="4 4 4\n1 2\n2 3\n3 4\n1 3\n", expected="2\n")

    def test_two_disjoint_paths_k_odd(self):
        # Paths 1->2->4 and 1->3->4; with K=3 one path holds at most 1 weight
        # (by pigeonhole), and 1 is reached by weighting e.g. 1->2, 2->4, 1->3.
        # Checked by enumerating all C(4,3) subsets.
        run_case(self, stdin="4 4 3\n1 2\n2 4\n1 3\n3 4\n", expected="1\n")

    def test_two_disjoint_paths_all_weighted(self):
        # K=M=4: both paths have length 2.
        run_case(self, stdin="4 4 4\n1 2\n2 4\n1 3\n3 4\n", expected="2\n")

    def test_edges_off_any_path_are_useless(self):
        # Only 1->3 lies on a path from 1 to 3; 3->2 and 2->1 do not help.
        # Weighting 1->3 gives 1; nothing can exceed the single edge's weight.
        run_case(self, stdin="3 3 1\n3 2\n2 1\n1 3\n", expected="1\n")

    def test_max_n_single_path_k_one(self):
        # Chain 1->...->30, K=1: distance is the weight sum along the chain, 1.
        stdin = "30 29 1\n" + "".join("%d %d\n" % (i, i + 1) for i in range(1, 30))
        run_case(self, stdin=stdin, expected="1\n")

    def test_max_n_single_path_all_weighted(self):
        # Chain 1->...->30, K=M=29: all 29 edges weighted, distance 29.
        stdin = "30 29 29\n" + "".join("%d %d\n" % (i, i + 1) for i in range(1, 30))
        run_case(self, stdin=stdin, expected="29\n")

    def test_max_size_chain_k_10(self):
        run_case(self, stdin=chain_with_back_edges(10), expected="10\n")

    def test_max_size_chain_k_50(self):
        run_case(self, stdin=chain_with_back_edges(50), expected="29\n")

    def test_max_size_chain_k_max(self):
        run_case(self, stdin=chain_with_back_edges(100), expected="29\n")


if __name__ == "__main__":
    unittest.main()
