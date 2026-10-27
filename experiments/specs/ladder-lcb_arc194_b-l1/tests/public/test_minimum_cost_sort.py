import heapq
import unittest

from sandbox.check import run_case

MAX_N = 200000


def brute_force(p):
    """Dijkstra over every arrangement of a tiny permutation: the edge for
    each 1 <= i <= N-1 swaps positions i and i+1 at cost i, exactly the
    operation in the statement. Returns the cheapest cost to reach sorted."""
    start = tuple(p)
    goal = tuple(sorted(p))
    dist = {start: 0}
    heap = [(0, start)]
    while heap:
        d, state = heapq.heappop(heap)
        if state == goal:
            return d
        if d > dist[state]:
            continue
        for i in range(1, len(state)):
            nxt = list(state)
            nxt[i - 1], nxt[i] = nxt[i], nxt[i - 1]
            nxt = tuple(nxt)
            nd = d + i
            if nd < dist.get(nxt, nd + 1):
                dist[nxt] = nd
                heapq.heappush(heap, (nd, nxt))
    raise AssertionError("sorted state unreachable")


def stdin_for(p):
    return f"{len(p)}\n{' '.join(map(str, p))}\n"


class TestMinimumCostSort(unittest.TestCase):
    # spec.md gives no sample inputs, so every expected value below is
    # either computed with brute_force (tiny N) or argued in a comment.

    def check_brute(self, p):
        run_case(self, stdin=stdin_for(p), expected=str(brute_force(p)))

    # --- smallest input, N = 2 ---

    def test_n2_already_sorted(self):
        # Already sorted: zero operations, cost 0.
        run_case(self, stdin="2\n1 2\n", expected="0")

    def test_n2_reversed(self):
        # Unsorted, and the only operation is i = 1 at cost 1; one swap sorts it.
        run_case(self, stdin="2\n2 1\n", expected="1")

    # --- tiny cases checked by brute force ---

    def test_n3_reversed(self):
        # brute_force gives 4 (swap at 1, 2, 1).
        self.check_brute([3, 2, 1])

    def test_n3_rotate_left(self):
        # brute_force; by hand: 3 1 2 -> (i=1) 1 3 2 -> (i=2) 1 2 3, cost 3.
        self.check_brute([3, 1, 2])

    def test_n3_rotate_right(self):
        # brute_force on 2 3 1.
        self.check_brute([2, 3, 1])

    def test_n5_mixed(self):
        # brute_force on 2 4 1 3 5.
        self.check_brute([2, 4, 1, 3, 5])

    def test_n6_reversed(self):
        # brute_force on 6 5 4 3 2 1.
        self.check_brute([6, 5, 4, 3, 2, 1])

    def test_n6_mixed(self):
        # brute_force on 4 6 2 1 5 3.
        self.check_brute([4, 6, 2, 1, 5, 3])

    def test_n6_largest_last_pair(self):
        # brute_force on 1 2 3 4 6 5.
        self.check_brute([1, 2, 3, 4, 6, 5])

    # --- largest N ---

    def test_max_n_sorted(self):
        # Already sorted: cost 0.
        p = list(range(1, MAX_N + 1))
        run_case(self, stdin=stdin_for(p), expected="0")

    def test_max_n_first_two_swapped(self):
        # Unsorted, so cost >= 1 (cheapest operation); the single swap at
        # i = 1 sorts it.
        p = [2, 1] + list(range(3, MAX_N + 1))
        run_case(self, stdin=stdin_for(p), expected="1")

    def test_max_n_last_two_swapped(self):
        # P_N = N-1 must change, which only the swap at i = N-1 can do, so
        # cost >= N-1; that single swap sorts it. N-1 = 199999.
        p = list(range(1, MAX_N - 1)) + [MAX_N, MAX_N - 1]
        run_case(self, stdin=stdin_for(p), expected=str(MAX_N - 1))

    def test_max_n_largest_value_first(self):
        # N 1 2 ... N-1: the value N travels from position 1 to N, crossing
        # each boundary i (1 <= i <= N-1) at least once, each crossing a swap
        # at cost i, so cost >= N(N-1)/2; moving N right one step at a time
        # achieves it. N(N-1)/2 = 19999900000.
        p = [MAX_N] + list(range(1, MAX_N))
        run_case(self, stdin=stdin_for(p), expected=str(MAX_N * (MAX_N - 1) // 2))

    def test_max_n_smallest_value_last(self):
        # 2 3 ... N 1: the value 1 travels from position N to 1, crossing
        # every boundary, so by the same argument the answer is
        # N(N-1)/2 = 19999900000.
        p = list(range(2, MAX_N + 1)) + [1]
        run_case(self, stdin=stdin_for(p), expected=str(MAX_N * (MAX_N - 1) // 2))


if __name__ == "__main__":
    unittest.main()
