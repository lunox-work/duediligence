# The statement in spec.md shows no sample cases and states no
# constraints, so every case here is tiny. Each expected answer was
# computed by the exhaustive game search `brute` below (it tries every
# legal edge addition from every reachable position), and each test
# re-checks its literal against `brute` before running the program. The
# two 4-vertex cases match AtCoder ABC398 G's samples 1 and 2.
import itertools
import unittest
from functools import lru_cache

from sandbox.check import run_case


def brute(n, edges):
    """Winner by full game-tree search; only feasible for n <= 6."""
    pairs = list(itertools.combinations(range(1, n + 1), 2))

    def bipartite(mask):
        adj = {v: [] for v in range(1, n + 1)}
        for k, (a, b) in enumerate(pairs):
            if mask >> k & 1:
                adj[a].append(b)
                adj[b].append(a)
        colour = {}
        for s in adj:
            if s in colour:
                continue
            colour[s] = 0
            stack = [s]
            while stack:
                u = stack.pop()
                for w in adj[u]:
                    if w not in colour:
                        colour[w] = colour[u] ^ 1
                        stack.append(w)
                    elif colour[w] == colour[u]:
                        return False
        return True

    @lru_cache(maxsize=None)
    def mover_wins(mask):
        for k in range(len(pairs)):
            nxt = mask | 1 << k
            if nxt != mask and bipartite(nxt) and not mover_wins(nxt):
                return True
        return False

    start = sum(1 << pairs.index(tuple(sorted(e))) for e in edges)
    return "Aoki" if mover_wins(start) else "Takahashi"


def stdin_for(n, edges):
    return "\n".join([f"{n} {len(edges)}"] + [f"{u} {v}" for u, v in edges])


class TestNotOnlyTreeGame(unittest.TestCase):
    def check(self, n, edges, expected):
        self.assertEqual(brute(n, edges), expected, "test literal disagrees with brute force")
        run_case(self, stdin=stdin_for(n, edges), expected=expected)

    def test_path_of_four(self):
        # ABC398 G sample 1.
        self.check(4, [(1, 2), (2, 3), (3, 4)], "Aoki")

    def test_two_disjoint_edges(self):
        # ABC398 G sample 2.
        self.check(4, [(1, 2), (3, 4)], "Takahashi")

    def test_single_vertex(self):
        # No pair i < j exists, so Aoki cannot move.
        self.check(1, [], "Takahashi")

    def test_two_vertices_no_edge(self):
        # Aoki adds 1-2; Takahashi has no pair left.
        self.check(2, [], "Aoki")

    def test_two_vertices_one_edge(self):
        # The only pair is already an edge.
        self.check(2, [(1, 2)], "Takahashi")

    def test_three_vertices_no_edge(self):
        # Any two edges form a path; the third would close a triangle.
        self.check(3, [], "Takahashi")

    def test_three_vertices_one_edge(self):
        # Aoki makes a path; the last pair would close a triangle.
        self.check(3, [(1, 2)], "Aoki")

    def test_three_vertex_path_no_moves(self):
        self.check(3, [(1, 2), (2, 3)], "Takahashi")

    def test_four_vertices_no_edge(self):
        self.check(4, [], "Takahashi")

    def test_four_cycle_complete_bipartite(self):
        # C4 is K_{2,2}: every missing pair would make a triangle.
        self.check(4, [(1, 2), (2, 3), (3, 4), (4, 1)], "Takahashi")

    def test_five_vertices_no_edge(self):
        self.check(5, [], "Takahashi")

    def test_five_vertex_path(self):
        self.check(5, [(1, 2), (2, 3), (3, 4), (4, 5)], "Takahashi")

    def test_five_vertices_with_isolated_vertex(self):
        self.check(5, [(1, 2), (2, 3), (1, 4)], "Aoki")

    def test_six_vertices_no_edge(self):
        self.check(6, [], "Aoki")

    def test_six_cycle(self):
        self.check(6, [(1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 1)], "Aoki")

    def test_perfect_matching_on_six(self):
        self.check(6, [(1, 2), (3, 4), (5, 6)], "Takahashi")

    def test_large_star_has_no_moves(self):
        # Star K_{1,1999} on 2000 vertices: every missing pair joins two
        # leaves, and with the centre that closes a triangle (an odd
        # cycle), so Aoki has no legal move. Too big for brute force;
        # argued by hand.
        n = 2000
        edges = [(1, v) for v in range(2, n + 1)]
        run_case(self, stdin=stdin_for(n, edges), expected="Takahashi")


if __name__ == "__main__":
    unittest.main()
