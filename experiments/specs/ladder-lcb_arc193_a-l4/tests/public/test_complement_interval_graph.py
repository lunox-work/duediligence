# Public tests for "Complement Interval Graph" (AtCoder ARC193 A).
#
# spec.md is truncated: it gives only the input/output format. The model
# below is taken from the original statement: vertices i != j are adjacent
# iff the integer sets [L_i, R_i] and [L_j, R_j] are disjoint; a path's
# weight is the sum of the weights of its vertices (endpoints included).
# Constraints: 2 <= N, 1 <= W_i <= 10^9, 1 <= L_i <= R_i <= 2N, s_i != t_i.
# Every non-sample expected value was derived by hand (see comments) and
# cross-checked with a brute-force Dijkstra over the explicit graph.
import unittest

from sandbox.check import run_case


class TestComplementIntervalGraph(unittest.TestCase):
    def test_sample_1(self):
        run_case(
            self,
            stdin="5\n5 1 4 2 2\n2 4\n1 2\n7 8\n4 5\n2 7\n3\n1 4\n4 3\n5 2\n",
            expected="11\n6\n-1\n",
        )

    def test_smallest_disjoint_pair_both_directions(self):
        # N=2, [1,2] and [3,4] are disjoint: direct edge, weight 1+1.
        run_case(self, stdin="2\n1 1\n1 2\n3 4\n2\n1 2\n2 1\n", expected="2\n2\n")

    def test_smallest_overlapping_pair_unreachable(self):
        # N=2, [1,2] and [2,3] share 2: no edges at all.
        run_case(self, stdin="2\n1 1\n1 2\n2 3\n1\n1 2\n", expected="-1\n")

    def test_max_weights_sum_exceeds_32_bits(self):
        # [1,3] and [2,4] overlap; [5,6] is disjoint from both, so the only
        # path is 1-3-2 with weight 3 * 10^9.
        run_case(
            self,
            stdin="3\n1000000000 1000000000 1000000000\n1 3\n2 4\n5 6\n1\n1 2\n",
            expected="3000000000\n",
        )

    def test_direct_edge_beats_cheap_detour(self):
        # 1 and 2 are adjacent: 7+9=16; any longer path adds a positive weight.
        run_case(self, stdin="3\n7 9 1\n1 2\n3 4\n5 6\n1\n1 2\n", expected="16\n")

    def test_picks_cheaper_common_neighbour(self):
        # [3,4] and [4,5] overlap; common neighbours [1,2] (w=10) and
        # [7,8] (w=1). Best is 1-4-2: 5+1+6=12.
        run_case(
            self,
            stdin="4\n5 6 10 1\n3 4\n4 5\n1 2\n7 8\n1\n1 2\n",
            expected="12\n",
        )

    def test_only_path_has_two_intermediates(self):
        # s=[2,5], t=[4,7] overlap; neighbours of s: only [6,8] (v3);
        # neighbours of t: only [1,3] (v4); v3-v4 adjacent. Path 1-3-4-2 = 10.
        run_case(
            self,
            stdin="4\n1 2 3 4\n2 5\n4 7\n6 8\n1 3\n2\n1 2\n2 1\n",
            expected="10\n10\n",
        )

    def test_two_intermediates_cheaper_than_common_neighbour(self):
        # s=[3,4], t=[4,5]; common neighbour [7,8] costs 100 (path 102).
        # Path s-[5,6]-[1,3]-t costs 1+1+1+1=4.
        run_case(
            self,
            stdin="5\n1 1 100 1 1\n3 4\n4 5\n7 8\n5 6\n1 3\n1\n1 2\n",
            expected="4\n",
        )


if __name__ == "__main__":
    unittest.main()
