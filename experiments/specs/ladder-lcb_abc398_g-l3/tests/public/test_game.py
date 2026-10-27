import unittest
from functools import lru_cache
from itertools import combinations

from sandbox.check import run_case

# The statement gives no samples, so every expected answer below is derived.
#
# Hand rule for a CONNECTED input graph: it has no odd cycle, so its
# 2-colouring (sides of size a and b, a + b = N) is fixed, and an edge can be
# added exactly when it joins the two sides. Every move keeps the graph
# connected, so the game always ends at the complete bipartite graph K(a, b)
# after exactly a*b - M moves, whatever is played. Aoki (first) wins iff that
# count is odd.
#
# Disconnected inputs use brute_force_winner below: an exhaustive,
# memoised search of the game itself, run only on graphs with N <= 6.


def _no_odd_cycle(n, edges):
    adj = {v: [] for v in range(1, n + 1)}
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    colour = {}
    for s in adj:
        if s in colour:
            continue
        colour[s] = 0
        stack = [s]
        while stack:
            x = stack.pop()
            for y in adj[x]:
                if y not in colour:
                    colour[y] = 1 - colour[x]
                    stack.append(y)
                elif colour[y] == colour[x]:
                    return False
    return True


def brute_force_winner(n, edges):
    """Play the game exhaustively: a position is winning for the player to
    move iff some legal new edge leads to a losing position."""
    pairs = list(combinations(range(1, n + 1), 2))

    @lru_cache(maxsize=None)
    def mover_wins(state):
        for p in pairs:
            if p not in state:
                nxt = state | {p}
                if _no_odd_cycle(n, nxt) and not mover_wins(nxt):
                    return True
        return False

    start = frozenset(tuple(sorted(e)) for e in edges)
    return "Aoki" if mover_wins(start) else "Takahashi"


def make_input(n, edges):
    lines = [f"{n} {len(edges)}"] + [f"{u} {v}" for u, v in edges]
    return "\n".join(lines) + "\n"


def path(n):
    return [(i, i + 1) for i in range(1, n)]


class TestNotOnlyTreeGame(unittest.TestCase):
    # ---- No move available: the first player loses at once ----

    def test_single_edge_two_vertices(self):
        # Smallest graph with an edge: K(1,1) already, 1*1 - 1 = 0 moves.
        run_case(self, stdin="2 1\n1 2\n", expected="Takahashi")

    def test_path_three_adding_only_edge_makes_triangle(self):
        # Only missing edge is 1-3, which would close a triangle (odd cycle).
        # Connected, sides {1,3},{2}: 2*1 - 2 = 0 moves.
        run_case(self, stdin="3 2\n1 2\n2 3\n", expected="Takahashi")

    def test_four_cycle_complete_bipartite(self):
        # Already K(2,2): 2*2 - 4 = 0 moves.
        run_case(self, stdin="4 4\n1 2\n2 3\n3 4\n1 4\n", expected="Takahashi")

    def test_star_four_vertices(self):
        # Already K(1,3): 1*3 - 3 = 0 moves.
        run_case(self, stdin="4 3\n1 2\n1 3\n1 4\n", expected="Takahashi")

    # ---- Connected graphs (hand rule above) ----

    def test_path_four(self):
        # Sides 2,2: 2*2 - 3 = 1 move (only 1-4), odd.
        run_case(self, stdin="4 3\n1 2\n2 3\n3 4\n", expected="Aoki")

    def test_path_five(self):
        # Sides 3,2: 3*2 - 4 = 2 moves, even.
        run_case(self, stdin=make_input(5, path(5)), expected="Takahashi")

    def test_path_eight(self):
        # Sides 4,4: 4*4 - 7 = 9 moves, odd.
        run_case(self, stdin=make_input(8, path(8)), expected="Aoki")

    def test_long_path_even_length(self):
        # N = 1000, sides 500,500: 250000 - 999 = 249001 moves, odd.
        run_case(self, stdin=make_input(1000, path(1000)), expected="Aoki")

    def test_long_path_odd_length(self):
        # N = 999, sides 500,499: 249500 - 998 = 248502 moves, even.
        run_case(self, stdin=make_input(999, path(999)), expected="Takahashi")

    # ---- Disconnected graphs ----

    def test_edge_plus_isolated_vertex(self):
        # By hand: either legal move (1-3 or 2-3) gives a connected path,
        # which has no further move. Exactly 1 move. Also brute-forced.
        edges = [(1, 2)]
        self.assertEqual(brute_force_winner(3, edges), "Aoki")
        run_case(self, stdin="3 1\n1 2\n", expected="Aoki")

    def test_two_disjoint_edges(self):
        # Expected from the exhaustive search.
        edges = [(1, 2), (3, 4)]
        run_case(self, stdin=make_input(4, edges), expected=brute_force_winner(4, edges))

    def test_single_edge_four_vertices(self):
        # Expected from the exhaustive search.
        edges = [(1, 2)]
        run_case(self, stdin=make_input(4, edges), expected=brute_force_winner(4, edges))

    def test_path_three_plus_isolated(self):
        # Expected from the exhaustive search.
        edges = [(1, 2), (2, 3)]
        run_case(self, stdin=make_input(4, edges), expected=brute_force_winner(4, edges))

    def test_single_edge_five_vertices(self):
        # Expected from the exhaustive search.
        edges = [(1, 2)]
        run_case(self, stdin=make_input(5, edges), expected=brute_force_winner(5, edges))

    def test_two_edges_plus_isolated_five(self):
        # Expected from the exhaustive search.
        edges = [(1, 2), (3, 4)]
        run_case(self, stdin=make_input(5, edges), expected=brute_force_winner(5, edges))

    def test_path_three_plus_edge(self):
        # Expected from the exhaustive search.
        edges = [(1, 2), (2, 3), (4, 5)]
        run_case(self, stdin=make_input(5, edges), expected=brute_force_winner(5, edges))

    def test_single_edge_six_vertices(self):
        # Expected from the exhaustive search.
        edges = [(1, 2)]
        run_case(self, stdin=make_input(6, edges), expected=brute_force_winner(6, edges))

    def test_three_disjoint_edges(self):
        # Expected from the exhaustive search.
        edges = [(1, 2), (3, 4), (5, 6)]
        run_case(self, stdin=make_input(6, edges), expected=brute_force_winner(6, edges))

    def test_two_paths_of_three(self):
        # Expected from the exhaustive search.
        edges = [(1, 2), (2, 3), (4, 5), (5, 6)]
        run_case(self, stdin=make_input(6, edges), expected=brute_force_winner(6, edges))


if __name__ == "__main__":
    unittest.main()
