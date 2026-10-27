import unittest

from sandbox.check import run_case


class TestComplementIntervalGraph(unittest.TestCase):
    def test_sample_1(self):
        run_case(
            self,
            stdin="5\n5 1 4 2 2\n2 4\n1 2\n7 8\n4 5\n2 7\n3\n1 4\n4 3\n5 2\n",
            expected="11\n6\n-1\n",
        )

    def test_sample_2(self):
        run_case(
            self,
            stdin="8\n44 75 49 4 78 79 12 32\n5 13\n10 16\n6 8\n6 15\n12 15\n5 7\n1 15\n1 2\n"
            "5\n5 6\n3 2\n7 5\n4 5\n5 4\n",
            expected="157\n124\n-1\n114\n114\n",
        )

    def test_smallest_disjoint_both_directions(self):
        # [1,1] and [2,2] are disjoint, so 1-2 is an edge: weight 1 + 1.
        run_case(self, stdin="2\n1 1\n1 1\n2 2\n2\n1 2\n2 1\n", expected="2\n2\n")

    def test_smallest_overlapping_unreachable(self):
        # [1,2] and [2,3] share 2, so the only two vertices have no edge.
        run_case(self, stdin="2\n1 1\n1 2\n2 3\n1\n1 2\n", expected="-1\n")

    def test_identical_full_intervals_unreachable(self):
        # Both intervals are [1,2N]; they intersect, so no edge.
        run_case(self, stdin="2\n1 1\n1 4\n1 4\n1\n1 2\n", expected="-1\n")

    def test_max_weight_direct_edge(self):
        # [1,1] and [4,4] are disjoint: 10^9 + 10^9.
        run_case(
            self,
            stdin="2\n1000000000 1000000000\n1 1\n4 4\n1\n1 2\n",
            expected="2000000000\n",
        )

    def test_max_weight_through_middle_vertex(self):
        # [1,2] and [2,3] overlap; [5,6] is disjoint from both, so the only
        # path is 1-3-2: 3 * 10^9.
        run_case(
            self,
            stdin="3\n1000000000 1000000000 1000000000\n1 2\n2 3\n5 6\n1\n1 2\n",
            expected="3000000000\n",
        )

    def test_mixed_direct_and_via(self):
        # Intervals [1,2], [2,3], [5,6]; edges 1-3 and 2-3 only.
        # (1,2): 1-3-2 = 3+5+7 = 15; (1,3): 3+5 = 8; (2,3): 7+5 = 12.
        run_case(
            self,
            stdin="3\n3 7 5\n1 2\n2 3\n5 6\n3\n1 2\n1 3\n2 3\n",
            expected="15\n8\n12\n",
        )

    def test_path_needs_two_intermediates(self):
        # Intervals 1:[3,8], 2:[1,5], 3:[1,2], 4:[6,6]. Edges: 1-3, 3-4, 4-2
        # (1-2, 1-4, 2-3 intersect). Only path 1-3-4-2, weight 4.
        # Checked by hand and by Dijkstra over the explicit graph.
        run_case(
            self,
            stdin="4\n1 1 1 1\n3 8\n1 5\n1 2\n6 6\n2\n1 2\n2 1\n",
            expected="4\n4\n",
        )

    def test_longer_path_beats_heavy_common_neighbor(self):
        # As above plus vertex 5:[9,10] of weight 100, disjoint from all.
        # 1-5-2 costs 102; 1-3-4-2 costs 4. Neighbors of 1 are {3,5}, of 2
        # are {4,5}, so no 3-vertex path cheaper than 102 exists and the
        # answer is 4. Checked by hand and by Dijkstra over the explicit graph.
        run_case(
            self,
            stdin="5\n1 1 1 1 100\n3 8\n1 5\n1 2\n6 6\n9 10\n1\n1 2\n",
            expected="4\n",
        )

    def test_max_size_all_points_complete_graph(self):
        # N = Q = 2*10^5, vertex i has interval [i,i]: all pairwise disjoint,
        # so every pair is adjacent and the answer is W_s + W_t (a path
        # always contains both endpoints, so nothing can be cheaper).
        n = 200000
        weights = [10**9 - (i % 1000) for i in range(n)]
        queries = [(i + 1, (i * 7919 + 1) % n + 1) for i in range(n)]
        queries = [(s, t if t != s else s % n + 1) for s, t in queries]
        lines = [str(n), " ".join(map(str, weights))]
        lines += [f"{i} {i}" for i in range(1, n + 1)]
        lines.append(str(len(queries)))
        lines += [f"{s} {t}" for s, t in queries]
        expected = [str(weights[s - 1] + weights[t - 1]) for s, t in queries]
        run_case(self, stdin="\n".join(lines) + "\n", expected="\n".join(expected) + "\n")

    def test_max_size_all_full_intervals_no_edges(self):
        # N = Q = 2*10^5, every interval is [1,2N]: all intersect, no edges.
        n = 200000
        lines = [str(n), " ".join(["1000000000"] * n)]
        lines += [f"1 {2 * n}"] * n
        lines.append(str(n))
        lines += [f"{i} {i % n + 1}" for i in range(1, n + 1)]
        run_case(self, stdin="\n".join(lines) + "\n", expected="-1\n" * n)


if __name__ == "__main__":
    unittest.main()
