import unittest
from functools import lru_cache
from itertools import combinations

from sandbox.check import run_case


def is_bipartite(n, edges):
    """Plain BFS 2-colouring of the graph on vertices 1..n."""
    adj = {v: [] for v in range(1, n + 1)}
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    colour = {}
    for s in range(1, n + 1):
        if s in colour:
            continue
        colour[s] = 0
        stack = [s]
        while stack:
            u = stack.pop()
            for w in adj[u]:
                if w not in colour:
                    colour[w] = 1 - colour[u]
                    stack.append(w)
                elif colour[w] == colour[u]:
                    return False
    return True


def brute_winner(n, edges):
    """Exhaustive minimax over every legal move sequence; only for tiny n.
    A graph has no odd cycle exactly when it is bipartite, so a move (i, j)
    is legal when the edge is absent and the graph stays bipartite."""
    pairs = list(combinations(range(1, n + 1), 2))

    @lru_cache(maxsize=None)
    def mover_wins(state):
        for p in pairs:
            if p in state:
                continue
            nxt = state | {p}
            if is_bipartite(n, nxt) and not mover_wins(frozenset(nxt)):
                return True
        return False

    return "Aoki" if mover_wins(frozenset(tuple(e) for e in edges)) else "Takahashi"


def make_input(n, edges):
    return f"{n} {len(edges)}\n" + "".join(f"{u} {v}\n" for u, v in edges)


class TestNotOnlyTreeGame(unittest.TestCase):
    # Samples from the statement.

    def test_sample_1(self):
        run_case(self, stdin="4 3\n1 2\n2 3\n3 4\n", expected="Aoki")

    def test_sample_2(self):
        run_case(self, stdin="4 2\n1 2\n3 4\n", expected="Takahashi")

    def test_sample_3(self):
        run_case(self, stdin="9 5\n2 9\n2 3\n4 6\n5 7\n1 8\n", expected="Aoki")

    # Smallest inputs, derived by hand.

    def test_single_vertex(self):
        # N=1: no pair i<j exists, Aoki cannot move and loses.
        run_case(self, stdin="1 0\n", expected="Takahashi")

    def test_two_vertices_no_edge(self):
        # Aoki adds (1,2); then no pair is left, so Takahashi loses.
        run_case(self, stdin="2 0\n", expected="Aoki")

    def test_two_vertices_one_edge(self):
        # The only pair is already an edge: Aoki cannot move.
        run_case(self, stdin="2 1\n1 2\n", expected="Takahashi")

    def test_three_vertices_no_edge(self):
        # Any first edge, then any second edge forms a path of 3 vertices;
        # the third edge would close a triangle (odd cycle). Exactly 2 moves.
        run_case(self, stdin="3 0\n", expected="Takahashi")

    def test_three_vertices_one_edge(self):
        # From edge (1,2) exactly one more move is possible (see above).
        run_case(self, stdin="3 1\n1 2\n", expected="Aoki")

    def test_three_vertices_path(self):
        # Path 1-2-3: the only missing edge (1,3) closes a triangle.
        run_case(self, stdin="3 2\n1 2\n2 3\n", expected="Takahashi")

    # Tiny cases whose expected answer is computed by exhaustive minimax
    # (brute_winner above); its answers on samples 1 and 2 are checked too.

    def test_brute_agrees_with_samples(self):
        self.assertEqual(brute_winner(4, [(1, 2), (2, 3), (3, 4)]), "Aoki")
        self.assertEqual(brute_winner(4, [(1, 2), (3, 4)]), "Takahashi")

    def test_brute_four_vertices_no_edge(self):
        edges = []
        run_case(self, stdin=make_input(4, edges), expected=brute_winner(4, edges))

    def test_brute_four_vertices_one_edge(self):
        edges = [(2, 3)]
        run_case(self, stdin=make_input(4, edges), expected=brute_winner(4, edges))

    def test_brute_five_vertices_no_edge(self):
        edges = []
        run_case(self, stdin=make_input(5, edges), expected=brute_winner(5, edges))

    def test_brute_five_vertices_two_edges(self):
        edges = [(1, 2), (4, 5)]
        run_case(self, stdin=make_input(5, edges), expected=brute_winner(5, edges))

    def test_brute_five_vertices_path_of_three(self):
        edges = [(1, 3), (3, 5)]
        run_case(self, stdin=make_input(5, edges), expected=brute_winner(5, edges))

    def test_brute_six_vertices_two_components(self):
        edges = [(1, 2), (2, 3), (4, 5)]
        run_case(self, stdin=make_input(6, edges), expected=brute_winner(6, edges))

    # Largest inputs. A connected bipartite graph has a unique 2-colouring
    # (sides of size a and b), so every legal move adds a missing edge across
    # the sides and the game always lasts exactly a*b - M moves; Aoki wins
    # exactly when that count is odd.

    def test_max_star(self):
        # Star centred at 1 on N=200000: sides 1 and 199999, a*b = M, 0 moves.
        n = 200000
        edges = [(1, v) for v in range(2, n + 1)]
        run_case(self, stdin=make_input(n, edges), expected="Takahashi")

    def test_max_path_even(self):
        # Path on N=200000: sides 100000/100000, 10^10 - 199999 is odd.
        n = 200000
        edges = [(v, v + 1) for v in range(1, n)]
        run_case(self, stdin=make_input(n, edges), expected="Aoki")

    def test_max_path_odd(self):
        # Path on N=199999: sides 100000/99999, 9999900000 - 199998 is even.
        n = 199999
        edges = [(v, v + 1) for v in range(1, n)]
        run_case(self, stdin=make_input(n, edges), expected="Takahashi")

    def test_max_path_reversed_edge_order(self):
        # Same path on N=200000 as test_max_path_even, edges listed in
        # reverse order, so the first edge read is (199999, 200000).
        n = 200000
        edges = [(v, v + 1) for v in range(1, n)]
        edges = edges[::-1]
        run_case(self, stdin=make_input(n, edges), expected="Aoki")


if __name__ == "__main__":
    unittest.main()
