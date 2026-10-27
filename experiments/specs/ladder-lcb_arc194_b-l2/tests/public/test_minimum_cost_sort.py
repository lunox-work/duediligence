# Public tests for "Minimum Cost Sort" (spec.md).
#
# spec.md gives no sample cases and no explicit constraints, so every case
# here is a small permutation with N >= 2. Expected answers come from
# _brute below: Dijkstra over all N! arrangements, where swapping positions
# i and i+1 (1-indexed) costs i, exactly as the statement defines. Small
# cases also carry a hand derivation in a comment.
import heapq
import unittest

from sandbox.check import run_case


def _brute(p):
    """Minimum total cost to sort p, by Dijkstra over permutations."""
    start, target = tuple(p), tuple(sorted(p))
    dist = {start: 0}
    heap = [(0, start)]
    while heap:
        cost, cur = heapq.heappop(heap)
        if cur == target:
            return cost
        if cost > dist[cur]:
            continue
        for i in range(len(cur) - 1):
            nxt = list(cur)
            nxt[i], nxt[i + 1] = nxt[i + 1], nxt[i]
            nxt = tuple(nxt)
            new = cost + i + 1  # 0-indexed i is the statement's i + 1
            if new < dist.get(nxt, float("inf")):
                dist[nxt] = new
                heapq.heappush(heap, (new, nxt))
    raise AssertionError("unreachable")


def _case(tc, p, expected):
    # The literal answer is cross-checked against the brute force so a
    # typo in a hand-written value cannot slip through.
    tc.assertEqual(_brute(p), expected)
    stdin = f"{len(p)}\n{' '.join(map(str, p))}\n"
    run_case(tc, stdin=stdin, expected=str(expected))


class TestMinimumCostSort(unittest.TestCase):
    def test_n2_sorted(self):
        # Already sorted: zero operations, cost 0.
        _case(self, [1, 2], 0)

    def test_n2_swapped(self):
        # Only possible operation is i = 1, cost 1.
        _case(self, [2, 1], 1)

    def test_n3_reversed(self):
        # 3 inversions need 3 adjacent swaps; orders 1,2,1 (cost 4) and
        # 2,1,2 (cost 5) are the only ones, so 4.
        _case(self, [3, 2, 1], 4)

    def test_n3_swap_at_front(self):
        # One inversion at positions 1-2: a single swap i = 1, cost 1.
        _case(self, [2, 1, 3], 1)

    def test_n3_swap_at_back(self):
        # One inversion at positions 2-3: the single swap must be i = 2.
        _case(self, [1, 3, 2], 2)

    def test_n3_rotate_left(self):
        # Brute force.
        _case(self, [3, 1, 2], 3)

    def test_n3_rotate_right(self):
        # Brute force.
        _case(self, [2, 3, 1], 3)

    def test_n5_mixed(self):
        # Brute force.
        _case(self, [2, 4, 1, 3, 5], 6)

    def test_n5_sorted(self):
        # Already sorted: cost 0.
        _case(self, [1, 2, 3, 4, 5], 0)

    def test_n5_last_pair_swapped(self):
        # One inversion at positions 4-5: the single swap must be i = 4.
        _case(self, [1, 2, 3, 5, 4], 4)

    def test_n5_one_moves_from_end(self):
        # Brute force.
        _case(self, [2, 3, 4, 5, 1], 10)

    def test_n5_max_moves_from_front(self):
        # Brute force.
        _case(self, [5, 1, 2, 3, 4], 10)

    def test_n4_reversed(self):
        # Brute force.
        _case(self, [4, 3, 2, 1], 10)

    def test_n5_reversed(self):
        # Brute force.
        _case(self, [5, 4, 3, 2, 1], 20)

    def test_n6_adjacent_pairs_swapped(self):
        # Three disjoint inversions, each fixed by one forced swap:
        # i = 1, 3, 5, total 9.
        _case(self, [2, 1, 4, 3, 6, 5], 9)

    def test_n8_reversed(self):
        # Brute force over all 8! arrangements.
        _case(self, [8, 7, 6, 5, 4, 3, 2, 1], _brute([8, 7, 6, 5, 4, 3, 2, 1]))


if __name__ == "__main__":
    unittest.main()
