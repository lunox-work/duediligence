import itertools
import unittest
from collections import deque

from sandbox.check import run_case


def brute(l, r):
    """Fewest operations for nums = [l..r], by breadth-first search over
    every reachable array (sorted, since order does not matter). Obviously
    correct, and only used on tiny ranges."""
    start = tuple(range(l, r + 1))
    seen = {start}
    queue = deque([(start, 0)])
    while queue:
        state, dist = queue.popleft()
        if not any(state):
            return dist
        for i, j in itertools.combinations(range(len(state)), 2):
            nxt = list(state)
            nxt[i] //= 4
            nxt[j] //= 4
            nxt = tuple(sorted(nxt))
            if nxt not in seen:
                seen.add(nxt)
                queue.append((nxt, dist + 1))


def steps(x):
    """How many times x must be floor-divided by 4 to reach zero."""
    count = 0
    while x:
        x //= 4
        count += 1
    return count


def by_counting(l, r):
    """Fewest operations for nums = [l..r] on ranges too large to search.

    Each element x needs exactly steps(x) selections, and an operation
    selects two elements, so ceil(sum / 2) is a lower bound; so is
    max(steps). On a range of consecutive integers with l < r, the largest
    count is at most the sum of the others plus one, so the counts can be
    paired off (always pairing the two largest remaining) in exactly
    ceil(sum / 2) operations. Elements in [4^(k-1), 4^k - 1] have k steps,
    so the sum is counted block by block. Agrees with brute() on every
    range inside [1, 9]."""
    total = 0
    k, lo = 1, 1
    while lo <= r:
        a, b = max(l, lo), min(r, 4 * lo - 1)
        if a <= b:
            total += k * (b - a + 1)
        k, lo = k + 1, 4 * lo
    return (total + 1) // 2


class TestMinOperations(unittest.TestCase):
    def test_example_1(self):
        run_case(self, fn="minOperations", args=[[[1, 2], [2, 4]]], expected=3)

    def test_example_2(self):
        run_case(self, fn="minOperations", args=[[[2, 6]]], expected=4)

    def test_smallest_query(self):
        # [1, 2]: one operation turns both to 0 (first query of example 1).
        run_case(self, fn="minOperations", args=[[[1, 2]]], expected=1)

    def test_power_of_four_boundary(self):
        # [3, 4]: 4 must be divided twice, so at least 2; (3,4)->(0,1)->(0,0).
        run_case(self, fn="minOperations", args=[[[3, 4]]], expected=2)

    def test_three_single_step_elements(self):
        # [1, 3]: three elements each needing one selection; ceil(3/2) = 2.
        run_case(self, fn="minOperations", args=[[[1, 3]]], expected=2)

    def test_brute_force_2_to_3(self):
        # Expected value from breadth-first search (brute).
        run_case(self, fn="minOperations", args=[[[2, 3]]], expected=brute(2, 3))

    def test_brute_force_1_to_4(self):
        # Expected value from breadth-first search (brute).
        run_case(self, fn="minOperations", args=[[[1, 4]]], expected=brute(1, 4))

    def test_brute_force_4_to_7(self):
        # Expected value from breadth-first search (brute).
        run_case(self, fn="minOperations", args=[[[4, 7]]], expected=brute(4, 7))

    def test_brute_force_3_to_6(self):
        # Expected value from breadth-first search (brute).
        run_case(self, fn="minOperations", args=[[[3, 6]]], expected=brute(3, 6))

    def test_brute_force_1_to_7(self):
        # Expected value from breadth-first search (brute).
        run_case(self, fn="minOperations", args=[[[1, 7]]], expected=brute(1, 7))

    def test_tiny_ranges_summed(self):
        # Several tiny queries in one call; the answer is the sum of
        # brute-force answers.
        queries = [[1, 2], [3, 4], [4, 9], [1, 8], [5, 6]]
        expected = sum(brute(l, r) for l, r in queries)
        run_case(self, fn="minOperations", args=[queries], expected=expected)

    def test_largest_values(self):
        # 999999999 and 10^9 both need 15 divisions (4^14 <= x < 4^15);
        # 15 operations pairing them, and 15 is required.
        run_case(self, fn="minOperations", args=[[[999999999, 1000000000]]], expected=15)

    def test_across_largest_power_of_four(self):
        # 4^14 - 1 needs 14 steps, 4^14 needs 15; max is 15 = ceil(29/2).
        run_case(self, fn="minOperations", args=[[[268435455, 268435456]]], expected=15)

    def test_full_range(self):
        # [1, 10^9]; expected by counting (see by_counting).
        run_case(self, fn="minOperations", args=[[[1, 1000000000]]],
                 expected=by_counting(1, 1000000000))

    def test_max_queries_full_range(self):
        # 10^5 copies of [1, 10^9]; the total exceeds 32 bits.
        queries = [[1, 1000000000]] * 100000
        run_case(self, fn="minOperations", args=[queries],
                 expected=100000 * by_counting(1, 1000000000))


if __name__ == "__main__":
    unittest.main()
