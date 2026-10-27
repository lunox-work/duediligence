import heapq
import unittest

from sandbox.check import run_case


def brute_force(p):
    """Minimum sorting cost by Dijkstra over every arrangement reachable by
    adjacent swaps: swapping 1-indexed positions i and i+1 costs i. Exact
    by construction; only used on N <= 7 (at most 5040 states)."""
    start, goal = tuple(p), tuple(sorted(p))
    dist = {start: 0}
    heap = [(0, start)]
    while heap:
        d, state = heapq.heappop(heap)
        if state == goal:
            return d
        if d > dist[state]:
            continue
        for i in range(len(state) - 1):
            nxt = list(state)
            nxt[i], nxt[i + 1] = nxt[i + 1], nxt[i]
            nxt = tuple(nxt)
            nd = d + i + 1
            if nd < dist.get(nxt, float("inf")):
                dist[nxt] = nd
                heapq.heappush(heap, (nd, nxt))
    raise AssertionError("unreachable")


def case(tc, p, expected):
    # Every expected value is also re-derived by brute force before use.
    tc.assertEqual(brute_force(p), expected, "test's own expected value is wrong")
    stdin = f"{len(p)}\n{' '.join(map(str, p))}\n"
    run_case(tc, stdin=stdin, expected=str(expected))


class TestMinimumCostSort(unittest.TestCase):
    # spec.md lists no samples and no constraints, so every case is small:
    # each expected value is worked by hand (comment says how) or obtained
    # from brute_force above, and case() re-checks it against brute_force.

    def test_single_element(self):
        # N = 1: already sorted, no swap needed.
        case(self, [1], 0)

    def test_two_sorted(self):
        # Already sorted: cost 0.
        case(self, [1, 2], 0)

    def test_two_reversed(self):
        # One swap at position 1, cost 1.
        case(self, [2, 1], 1)

    def test_three_reversed(self):
        # By hand: 3 2 1 -> (i=1) 2 3 1 -> (i=2) 2 1 3 -> (i=1) 1 2 3 costs
        # 1+2+1 = 4; the other order of three swaps costs 2+1+2 = 5, and
        # three inversions need at least three swaps.
        case(self, [3, 2, 1], 4)

    def test_last_pair_swapped(self):
        # Single swap at position 2, cost 2; one inversion needs one swap.
        case(self, [1, 3, 2], 2)

    def test_five_mixed(self):
        # Expected obtained from brute_force (Dijkstra over permutations).
        case(self, [2, 4, 1, 3, 5], 6)

    def test_five_reversed(self):
        # Expected obtained from brute_force.
        case(self, [5, 4, 3, 2, 1], 20)

    def test_five_sorted(self):
        case(self, [1, 2, 3, 4, 5], 0)

    def test_six_rotation_left(self):
        # Expected obtained from brute_force.
        case(self, [2, 3, 4, 5, 6, 1], 15)

    def test_six_rotation_right(self):
        # Expected obtained from brute_force.
        case(self, [6, 1, 2, 3, 4, 5], 15)

    def test_seven_reversed(self):
        # Expected obtained from brute_force.
        case(self, [7, 6, 5, 4, 3, 2, 1], 56)

    def test_seven_mixed(self):
        # Expected obtained from brute_force.
        case(self, [4, 7, 1, 6, 2, 5, 3], 42)


if __name__ == "__main__":
    unittest.main()
