# spec.md gives only the title and starter code. The problem it names is
# LeetCode 3495 "Minimum Operations to Make Array Elements Zero": each
# query [l, r] is the array l, l+1, ..., r; one operation picks two
# elements a, b and replaces them with floor(a / 4) and floor(b / 4).
# The answer is the sum over queries of the minimum number of operations
# that make every element 0. Constraints: 1 <= len(queries) <= 10^5,
# 1 <= l < r <= 10^9.
import unittest
from collections import deque
from itertools import combinations

from sandbox.check import run_case


def brute_force(l, r):
    # Breadth-first search over every reachable array (kept sorted, since
    # order does not matter), trying every pair of positions per operation.
    # The first all-zero array found is reached in the fewest operations.
    start = tuple(range(l, r + 1))
    seen = {start}
    queue = deque([(start, 0)])
    while queue:
        state, dist = queue.popleft()
        if not any(state):
            return dist
        for i, j in combinations(range(len(state)), 2):
            nxt = list(state)
            nxt[i] //= 4
            nxt[j] //= 4
            nxt = tuple(sorted(nxt))
            if nxt not in seen:
                seen.add(nxt)
                queue.append((nxt, dist + 1))


class TestMinOperations(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, fn="minOperations", args=[[[1, 2], [2, 4]]], expected=3)

    def test_sample_2(self):
        run_case(self, fn="minOperations", args=[[[2, 6]]], expected=4)

    def test_smallest_query(self):
        # [1, 2]: one operation divides both 1 and 2 by 4, giving 0 and 0.
        run_case(self, fn="minOperations", args=[[[1, 2]]], expected=1)

    def test_small_ranges_brute_force(self):
        # Expected answer is the sum of the brute-force answers per query.
        queries = [[3, 4], [4, 8], [1, 7], [15, 17], [10, 13]]
        expected = sum(brute_force(l, r) for l, r in queries)
        run_case(self, fn="minOperations", args=[queries], expected=expected)

    def test_largest_values(self):
        # 4^14 <= 999999999 < 1000000000 < 4^15, so each element needs exactly
        # 15 divisions by 4 to reach 0. Each operation divides an element at
        # most once, so 15 operations is a lower bound; pairing the two
        # elements in every operation reaches it.
        run_case(self, fn="minOperations", args=[[[999999999, 1000000000]]], expected=15)

    def test_max_query_count(self):
        # 10^5 copies of [1, 2]; queries are independent, each needs 1 operation.
        run_case(self, fn="minOperations", args=[[[1, 2]] * 100000], expected=100000)

    def test_full_value_range(self):
        # Element x needs d(x) = number of divisions by 4 to reach 0; values in
        # [4^(k-1), 4^k - 1] have d = k. An operation gives one division each to
        # two different elements, so ops >= ceil(sum d / 2) and ops >= max d.
        # Repeatedly pairing the two elements with the most divisions left
        # reaches max(max d, ceil(sum d / 2)). Here max d = 15 is far below
        # half the sum.
        l, r = 1, 10**9
        total = 0
        for k in range(1, 16):
            lo, hi = max(l, 4 ** (k - 1)), min(r, 4 ** k - 1)
            if lo <= hi:
                total += k * (hi - lo + 1)
        expected = max(15, (total + 1) // 2)
        run_case(self, fn="minOperations", args=[[[l, r]]], expected=expected)


if __name__ == "__main__":
    unittest.main()
