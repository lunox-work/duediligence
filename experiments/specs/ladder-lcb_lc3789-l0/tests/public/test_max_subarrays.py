import unittest

from sandbox.check import run_case


def brute(n, pairs):
    """Obviously-correct reference for tiny inputs: try removing each pair,
    then count every subarray [l..r] of 1..n that contains no remaining
    pair (a pair is contained when both its values lie in [l, r])."""
    best = 0
    for skip in range(len(pairs)):
        rest = [p for i, p in enumerate(pairs) if i != skip]
        count = 0
        for l in range(1, n + 1):
            for r in range(l, n + 1):
                if not any(l <= min(a, b) and max(a, b) <= r for a, b in rest):
                    count += 1
        best = max(best, count)
    return best


class TestMaxSubarrays(unittest.TestCase):
    # Samples from the statement.
    def test_example_1(self):
        run_case(self, fn="maxSubarrays", args=[4, [[2, 3], [1, 4]]], expected=9)

    def test_example_2(self):
        run_case(self, fn="maxSubarrays", args=[5, [[1, 2], [2, 5], [3, 5]]], expected=12)

    # Smallest input: n = 2, one pair. Removing it leaves no conflicts,
    # so all 2*3/2 = 3 subarrays count (by hand).
    def test_smallest_single_pair(self):
        run_case(self, fn="maxSubarrays", args=[2, [[1, 2]]], expected=3)

    # n = 2 with the same conflict written both ways: removing either leaves
    # {1, 2} conflicting, so only [1] and [2] count (by hand).
    def test_smallest_pair_both_orders(self):
        run_case(self, fn="maxSubarrays", args=[2, [[1, 2], [2, 1]]], expected=2)

    # Example 1 with each pair reversed; a pair is unordered, so the answer
    # is unchanged.
    def test_example_1_reversed_pairs(self):
        run_case(self, fn="maxSubarrays", args=[4, [[3, 2], [4, 1]]], expected=9)

    # Duplicate pair: removing one copy still leaves [1, 4], which excludes
    # only the whole array: 10 - 1 = 9 (by hand).
    def test_duplicate_pair(self):
        run_case(self, fn="maxSubarrays", args=[4, [[1, 4], [1, 4]]], expected=9)

    # Small cases checked against the brute force above.
    def test_brute_small_1(self):
        n, pairs = 5, [[1, 3], [2, 4], [3, 5]]
        run_case(self, fn="maxSubarrays", args=[n, pairs], expected=brute(n, pairs))

    def test_brute_small_2(self):
        n, pairs = 6, [[2, 5], [1, 6], [3, 4], [4, 2]]
        run_case(self, fn="maxSubarrays", args=[n, pairs], expected=brute(n, pairs))

    def test_brute_small_3(self):
        n, pairs = 3, [[1, 2], [2, 3], [1, 3], [3, 1], [2, 1], [3, 2]]
        run_case(self, fn="maxSubarrays", args=[n, pairs], expected=brute(n, pairs))

    # Largest n with a single pair: removing it leaves no conflicts, so all
    # n(n+1)/2 subarrays count; exceeds 32-bit range.
    def test_max_n_single_pair(self):
        n = 10 ** 5
        run_case(self, fn="maxSubarrays", args=[n, [[1, 2]]], expected=n * (n + 1) // 2)

    # Largest n and maximum pair count (2n), all [1, n]: after removing one,
    # [1, n] remains and excludes only the whole array.
    def test_max_n_max_pairs_full_span(self):
        n = 10 ** 5
        pairs = [[1, n]] * (2 * n)
        run_case(self, fn="maxSubarrays", args=[n, pairs], expected=n * (n + 1) // 2 - 1)

    # Largest n, every adjacent pair conflicting. Removing [k, k+1] leaves
    # all other adjacent pairs, so only the n singletons and [k, k+1] count:
    # n + 1 whichever pair is removed.
    def test_max_n_all_adjacent(self):
        n = 10 ** 5
        pairs = [[i, i + 1] for i in range(1, n)]
        run_case(self, fn="maxSubarrays", args=[n, pairs], expected=n + 1)


if __name__ == "__main__":
    unittest.main()
