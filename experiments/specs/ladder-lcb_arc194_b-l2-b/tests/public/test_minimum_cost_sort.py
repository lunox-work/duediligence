import heapq
import unittest

from sandbox.check import run_case


def brute_force(p):
    """Dijkstra over all arrangements of a tiny permutation; swapping
    positions i and i+1 (1-indexed) costs i, exactly as the statement says."""
    n = len(p)
    start, goal = tuple(p), tuple(sorted(p))
    dist = {start: 0}
    heap = [(0, start)]
    while heap:
        cost, state = heapq.heappop(heap)
        if state == goal:
            return cost
        if cost > dist[state]:
            continue
        for i in range(n - 1):
            nxt = list(state)
            nxt[i], nxt[i + 1] = nxt[i + 1], nxt[i]
            nxt = tuple(nxt)
            if cost + i + 1 < dist.get(nxt, float("inf")):
                dist[nxt] = cost + i + 1
                heapq.heappush(heap, (cost + i + 1, nxt))


def stdin_for(p):
    return f"{len(p)}\n{' '.join(map(str, p))}\n"


MAX_N = 200000


class TestMinimumCostSort(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="3\n3 2 1\n", expected="4")

    def test_sample_2(self):
        run_case(self, stdin="5\n2 4 1 3 5\n", expected="6")

    def test_sample_3(self):
        run_case(self, stdin="2\n1 2\n", expected="0")

    def test_smallest_n_swapped(self):
        # The only useful operation is i = 1, needed exactly once: cost 1.
        run_case(self, stdin="2\n2 1\n", expected="1")

    def test_brute_force_reversed_six(self):
        p = [6, 5, 4, 3, 2, 1]
        run_case(self, stdin=stdin_for(p), expected=str(brute_force(p)))

    def test_brute_force_mixed_six(self):
        p = [3, 6, 1, 5, 2, 4]
        run_case(self, stdin=stdin_for(p), expected=str(brute_force(p)))

    def test_brute_force_mixed_seven(self):
        p = [4, 1, 7, 3, 6, 2, 5]
        run_case(self, stdin=stdin_for(p), expected=str(brute_force(p)))

    def test_max_n_already_sorted(self):
        p = list(range(1, MAX_N + 1))
        run_case(self, stdin=stdin_for(p), expected="0")

    def test_max_n_one_at_end(self):
        # (2, 3, ..., N, 1): value 1 must cross every boundary i = 1..N-1 at
        # least once, so cost >= 1 + 2 + ... + (N-1); moving 1 straight to
        # the front achieves it. Answer N(N-1)/2.
        p = list(range(2, MAX_N + 1)) + [1]
        run_case(self, stdin=stdin_for(p), expected=str(MAX_N * (MAX_N - 1) // 2))

    def test_max_n_largest_at_front(self):
        # (N, 1, 2, ..., N-1): value N must cross every boundary at least
        # once; moving it straight to the back achieves N(N-1)/2.
        p = [MAX_N] + list(range(1, MAX_N))
        run_case(self, stdin=stdin_for(p), expected=str(MAX_N * (MAX_N - 1) // 2))

    def test_max_n_reversed(self):
        # Reversed permutation: the answer is sum over positions i of
        # 1 + 2 + ... + (i-1) = (N+1)N(N-1)/6. This closed form matches
        # sample 1 (N=3 -> 4) and was checked against the Dijkstra brute
        # force above for every N from 2 to 7.
        p = list(range(MAX_N, 0, -1))
        run_case(self, stdin=stdin_for(p),
                 expected=str((MAX_N + 1) * MAX_N * (MAX_N - 1) // 6))


if __name__ == "__main__":
    unittest.main()
