# Public tests for "Cost to Flip" (spec.md).
#
# The statement gives no samples and no explicit constraints, so every case
# here is tiny (N <= 5, small positive weights). Expected answers are either
# derived by hand (explained in the comment) or computed by `_brute`, a
# Dijkstra search over all 2^N states of A, which is obviously correct for
# such small N: each move flips one bit and costs the sum of C_i over the
# positions holding 1 afterwards, exactly as the statement defines it.
import heapq
import unittest

from sandbox.check import run_case


def _brute(a, b, c):
    n = len(a)
    start = sum(bit << i for i, bit in enumerate(a))
    goal = sum(bit << i for i, bit in enumerate(b))
    weight = [sum(c[i] for i in range(n) if mask >> i & 1) for mask in range(1 << n)]
    dist = {start: 0}
    heap = [(0, start)]
    while heap:
        d, mask = heapq.heappop(heap)
        if mask == goal:
            return d
        if d > dist[mask]:
            continue
        for i in range(n):
            nxt = mask ^ (1 << i)
            nd = d + weight[nxt]
            if nd < dist.get(nxt, nd + 1):
                dist[nxt] = nd
                heapq.heappush(heap, (nd, nxt))
    raise AssertionError("goal unreachable")


def _stdin(a, b, c):
    return "%d\n%s\n%s\n%s\n" % (
        len(a),
        " ".join(map(str, a)),
        " ".join(map(str, b)),
        " ".join(map(str, c)),
    )


class TestCostToFlip(unittest.TestCase):
    def _check(self, a, b, c, expected):
        run_case(self, stdin=_stdin(a, b, c), expected=str(expected))

    # --- smallest input, N = 1 (by hand) ---

    def test_n1_already_equal_zero(self):
        # A == B: no moves needed, cost 0.
        self._check([0], [0], [7], 0)

    def test_n1_already_equal_one(self):
        # A == B: no moves needed, cost 0.
        self._check([1], [1], [7], 0)

    def test_n1_zero_to_one(self):
        # The single flip leaves A = (1), costing C_1 = 7.
        self._check([0], [1], [7], 7)

    def test_n1_one_to_zero(self):
        # The single flip leaves A = (0), costing nothing.
        self._check([1], [0], [7], 0)

    # --- small cases derived by hand ---

    def test_n2_turn_off_both(self):
        # Turn off position 2 first (A becomes 1 0, cost 3), then position 1
        # (cost 0): total 3. The other order costs 5.
        self._check([1, 1], [0, 0], [3, 5], 3)

    def test_n2_turn_on_both(self):
        # Turn on position 1 first (cost 3), then position 2 (cost 3+5=8):
        # total 11. The other order costs 5+8=13.
        self._check([0, 0], [1, 1], [3, 5], 11)

    def test_all_equal_ones_costs_zero(self):
        # A == B already: cost 0.
        self._check([1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1], 0)

    def test_heavy_one_turned_off_and_back_on(self):
        # Keeping the weight-100 bit on while turning off positions 2 and 3
        # costs (100+1) + 100 = 201. Turning it off first, then 2, then 3,
        # then back on costs 2 + 1 + 0 + 100 = 103, which is optimal
        # (also confirmed by _brute).
        a, b, c = [1, 1, 1], [1, 0, 0], [100, 1, 1]
        self.assertEqual(_brute(a, b, c), 103)
        self._check(a, b, c, 103)

    # --- small cases computed by the brute force ---

    def test_brute_mixed_n4(self):
        a, b, c = [0, 1, 1, 1], [1, 0, 1, 0], [4, 6, 2, 9]
        self._check(a, b, c, _brute(a, b, c))

    def test_brute_mixed_n5(self):
        a, b, c = [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [5, 2, 8, 3, 1]
        self._check(a, b, c, _brute(a, b, c))

    def test_brute_all_zero_to_all_one_n5(self):
        a, b, c = [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [3, 1, 4, 1, 5]
        self._check(a, b, c, _brute(a, b, c))

    def test_brute_all_one_to_all_zero_n5(self):
        a, b, c = [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [3, 1, 4, 1, 5]
        self._check(a, b, c, _brute(a, b, c))

    def test_brute_heavy_kept_bits_n5(self):
        a, b, c = [1, 1, 1, 1, 0], [1, 1, 0, 0, 1], [20, 30, 1, 2, 3]
        self._check(a, b, c, _brute(a, b, c))


if __name__ == "__main__":
    unittest.main()
