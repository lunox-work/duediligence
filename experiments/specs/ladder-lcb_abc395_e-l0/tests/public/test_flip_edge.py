import unittest

from sandbox.check import run_case


def build(n, x, edges):
    lines = [f"{n} {len(edges)} {x}"] + [f"{u} {v}" for u, v in edges]
    return "\n".join(lines) + "\n"


class TestFlipEdge(unittest.TestCase):
    # Samples from the statement.

    def test_sample_1(self):
        run_case(self, stdin="5 6 5\n1 2\n2 4\n3 1\n3 5\n4 3\n5 2\n", expected="4")

    def test_sample_2(self):
        run_case(self, stdin="5 6 1\n1 2\n2 4\n3 1\n3 5\n4 3\n5 2\n", expected="3")

    def test_sample_3(self):
        run_case(
            self,
            stdin="8 7 613566756\n2 1\n2 3\n4 3\n4 5\n6 5\n6 7\n8 7\n",
            expected="4294967299",
        )

    def test_sample_4(self):
        run_case(
            self,
            stdin="20 13 5\n1 3\n14 18\n18 17\n12 19\n3 5\n4 6\n13 9\n8 5\n"
            "14 2\n20 18\n8 14\n4 9\n14 8\n",
            expected="21",
        )

    # Smallest inputs: N=2, M=1.

    def test_smallest_forward_edge(self):
        # One move along 1->2.
        run_case(self, stdin="2 1 1\n1 2\n", expected="1")

    def test_smallest_backward_edge_max_x(self):
        # Only edge is 2->1: one reversal (X = 10^9) then one move.
        run_case(self, stdin="2 1 1000000000\n2 1\n", expected="1000000001")

    def test_self_loop_and_duplicate_edges(self):
        # Self-loop on 1 and two copies of 1->2: a single move suffices.
        run_case(self, stdin="2 3 7\n1 1\n1 2\n1 2\n", expected="1")

    # Choosing between walking and reversing.

    def test_reverse_beats_long_walk(self):
        # Cycle 1->2->3->4->1. Walking costs 3; reversing (X=1) turns 4->1
        # into 1->4, then one move: 1 + 1 = 2. At least one move is needed
        # and no edge 1->4 exists initially, so 2 is minimal.
        run_case(self, stdin="4 4 1\n1 2\n2 3\n3 4\n4 1\n", expected="2")

    def test_walk_beats_reverse(self):
        # Same cycle with X=1000000000: walking 1->2->3->4 costs 3, any
        # reversal alone costs more than 3.
        run_case(self, stdin="4 4 1000000000\n1 2\n2 3\n3 4\n4 1\n", expected="3")

    def test_two_reversals_needed(self):
        # Path 1->2, 3->2, 3->4: the only route 1-2-3-4 alternates direction,
        # so it needs 3 moves and 2 reversals: 3 + 2*1 = 5.
        run_case(self, stdin="4 3 1\n1 2\n3 2\n3 4\n", expected="5")

    def test_two_reversals_max_x(self):
        # As above with X = 10^9: 3 + 2*10^9.
        run_case(self, stdin="4 3 1000000000\n1 2\n3 2\n3 4\n", expected="2000000003")

    # Largest sizes: N = 2*10^5, M = N - 1 or N.

    def test_max_reversed_chain(self):
        # Edges (i+1)->i for i=1..N-1. Every route uses all N-1 path edges,
        # and nothing leaves vertex 1 before a reversal; one reversal makes
        # the whole chain forward: X + (N-1) = 10^9 + 199999.
        n = 200000
        edges = [(i + 1, i) for i in range(1, n)]
        run_case(self, stdin=build(n, 10**9, edges), expected=str(10**9 + n - 1))

    def test_max_alternating_chain(self):
        # Edge i is i->(i+1) for odd i and (i+1)->i for even i. The route
        # crosses edges 1..N-1 in order with alternating orientation, so it
        # needs N-1 moves and N-2 reversals: 199999 + 199998 * 10^9.
        n = 200000
        edges = [(i, i + 1) if i % 2 == 1 else (i + 1, i) for i in range(1, n)]
        run_case(
            self,
            stdin=build(n, 10**9, edges),
            expected=str((n - 1) + (n - 2) * 10**9),
        )

    def test_max_chain_with_back_edge(self):
        # Chain 1->2->...->N plus N->1, X=1. Reverse then move 1->N: cost 2.
        # Cost 1 is impossible since there is no initial edge 1->N.
        n = 200000
        edges = [(i, i + 1) for i in range(1, n)] + [(n, 1)]
        run_case(self, stdin=build(n, 1, edges), expected="2")


if __name__ == "__main__":
    unittest.main()
