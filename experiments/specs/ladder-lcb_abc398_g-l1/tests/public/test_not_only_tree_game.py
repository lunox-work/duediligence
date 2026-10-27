import unittest
from functools import lru_cache

from sandbox.check import run_case


def fmt(n, edges):
    return "\n".join([f"{n} {len(edges)}"] + [f"{u} {v}" for u, v in edges]) + "\n"


def brute(n, edges):
    """Exhaustive game search over edge sets, straight from the rules:
    a move adds a missing edge (i, j) that leaves the graph bipartite;
    the player with no move loses. Only for tiny n."""
    pairs = [(i, j) for i in range(n) for j in range(i + 1, n)]
    index = {p: k for k, p in enumerate(pairs)}

    def bipartite(mask):
        adj = [[] for _ in range(n)]
        for k, (i, j) in enumerate(pairs):
            if mask >> k & 1:
                adj[i].append(j)
                adj[j].append(i)
        color = [-1] * n
        for s in range(n):
            if color[s] != -1:
                continue
            color[s] = 0
            stack = [s]
            while stack:
                x = stack.pop()
                for y in adj[x]:
                    if color[y] == -1:
                        color[y] = color[x] ^ 1
                        stack.append(y)
                    elif color[y] == color[x]:
                        return False
        return True

    @lru_cache(maxsize=None)
    def mover_wins(mask):
        for k in range(len(pairs)):
            if not mask >> k & 1:
                nxt = mask | 1 << k
                if bipartite(nxt) and not mover_wins(nxt):
                    return True
        return False

    start = 0
    for u, v in edges:
        start |= 1 << index[(u - 1, v - 1)]
    return "Aoki" if mover_wins(start) else "Takahashi"


class TestNotOnlyTreeGame(unittest.TestCase):
    # --- Hand-derived small cases ---

    def test_single_vertex(self):
        # N=1: no pair i<j exists, Aoki cannot move and loses.
        run_case(self, stdin="1 0\n", expected="Takahashi")

    def test_two_vertices_no_edge(self):
        # Aoki adds 1-2, then no pair remains for Takahashi.
        run_case(self, stdin="2 0\n", expected="Aoki")

    def test_two_vertices_one_edge(self):
        # The only pair is already an edge: Aoki cannot move.
        run_case(self, stdin="2 1\n1 2\n", expected="Takahashi")

    def test_even_cycle_already_complete_bipartite(self):
        # 4-cycle = K_{2,2}: missing pairs 1-3 and 2-4 each close a triangle,
        # so Aoki has no move.
        run_case(self, stdin="4 4\n1 2\n2 3\n3 4\n1 4\n", expected="Takahashi")

    # --- Tiny cases, expected value from the exhaustive brute() above ---

    def check_brute(self, n, edges):
        run_case(self, stdin=fmt(n, edges), expected=brute(n, edges))

    def test_brute_n3_empty(self):
        self.check_brute(3, [])

    def test_brute_n3_one_edge(self):
        self.check_brute(3, [(1, 2)])

    def test_brute_n4_empty(self):
        self.check_brute(4, [])

    def test_brute_n4_path(self):
        self.check_brute(4, [(1, 2), (2, 3), (3, 4)])

    def test_brute_n4_matching(self):
        self.check_brute(4, [(1, 2), (3, 4)])

    def test_brute_n4_one_edge(self):
        self.check_brute(4, [(2, 4)])

    def test_brute_n5_empty(self):
        self.check_brute(5, [])

    def test_brute_n5_star(self):
        self.check_brute(5, [(1, 2), (1, 3), (1, 4), (1, 5)])

    def test_brute_n6_empty(self):
        self.check_brute(6, [])

    def test_brute_n6_two_paths(self):
        self.check_brute(6, [(1, 2), (2, 3), (4, 5)])

    def test_brute_n6_even_cycle_plus_isolated(self):
        self.check_brute(6, [(1, 2), (2, 3), (3, 4), (1, 4)])

    # --- Parity argument for odd N ---
    # Any terminal graph is connected (else an edge between components is
    # legal) and contains every edge across its unique bipartition, so it is
    # K_{a,b} with a+b=N and exactly a*b-M moves are played. For odd N, a*b
    # is even, so Aoki wins iff M is odd.

    def test_odd_n_forest_odd_m(self):
        # N=9, M=5 odd -> Aoki.
        run_case(self, stdin="9 5\n2 9\n2 3\n4 6\n5 7\n1 8\n", expected="Aoki")

    def test_large_odd_n_empty(self):
        # N=199999, M=0 even -> Takahashi.
        run_case(self, stdin="199999 0\n", expected="Takahashi")

    def test_large_odd_n_one_edge(self):
        # N=199999, M=1 odd -> Aoki.
        run_case(self, stdin="199999 1\n1 199999\n", expected="Aoki")

    def test_large_odd_n_max_m(self):
        # N=199999, M=200000 (maximum): the path 1..N plus chords 1-4, 1-6,
        # every edge joining an odd and an even label, so bipartite.
        # M even -> Takahashi.
        n = 199999
        edges = [(i, i + 1) for i in range(1, n)] + [(1, 4), (1, 6)]
        self.assertEqual(len(edges), 200000)
        run_case(self, stdin=fmt(n, edges), expected="Takahashi")

    def test_large_odd_n_forest_odd_m(self):
        # N=199999, path 1..199998 (199997 edges) plus isolated vertex 199999.
        # M odd -> Aoki.
        n = 199999
        edges = [(i, i + 1) for i in range(1, n - 1)]
        run_case(self, stdin=fmt(n, edges), expected="Aoki")

    # --- Large even N, hand-derived ---

    def test_max_n_full_star(self):
        # N=200000, star centred at 1 = K_{1,199999}: already terminal,
        # Aoki has no move.
        n = 200000
        edges = [(1, v) for v in range(2, n + 1)]
        run_case(self, stdin=fmt(n, edges), expected="Takahashi")

    def test_max_n_star_plus_isolated(self):
        # N=200000, star centred at 1 on 1..199999, vertex 200000 isolated.
        # Aoki adds 1-200000, making K_{1,199999}: Takahashi has no move.
        n = 200000
        edges = [(1, v) for v in range(2, n)]
        run_case(self, stdin=fmt(n, edges), expected="Aoki")


if __name__ == "__main__":
    unittest.main()
