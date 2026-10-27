# Public tests for maximize-subarrays-after-removing-one-conflicting-pair.
#
# spec.md gives only the title and the starter signature. The semantics
# and samples below are those of the LeetCode problem with this slug
# (3480): nums = [1, 2, ..., n]; each [a, b] in conflictingPairs forbids a
# subarray from containing both a and b; remove exactly one pair and
# return the maximum number of non-empty subarrays of nums that contain
# no remaining conflicting pair. Constraints: 2 <= n <= 10**5,
# 1 <= len(conflictingPairs) <= 2 * n, 1 <= a, b <= n, a != b.
import unittest

from sandbox.check import run_case


def brute(n, pairs):
    """Try every removal; count subarrays [l, r] of 1..n that contain both
    ends of no remaining pair. Only for tiny inputs."""
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
    def test_sample_1(self):
        run_case(self, fn="maxSubarrays", args=[4, [[2, 3], [1, 4]]], expected=9)

    def test_sample_2(self):
        run_case(self, fn="maxSubarrays", args=[5, [[1, 2], [2, 5], [3, 5]]], expected=12)

    def test_smallest_single_pair(self):
        # n = 2, one pair: removing it leaves no conflicts, so all
        # 2 * 3 / 2 = 3 subarrays count.
        run_case(self, fn="maxSubarrays", args=[2, [[1, 2]]], expected=3)

    def test_smallest_duplicate_pair_reversed(self):
        # [2, 1] is the same conflict as [1, 2]; after removing one the
        # other still forbids [1, 2], leaving only [1] and [2].
        run_case(self, fn="maxSubarrays", args=[2, [[1, 2], [2, 1]]], expected=2)

    def test_smallest_max_pair_count(self):
        # n = 2 with 2 * n = 4 pairs, all {1, 2}: only the singletons survive.
        run_case(self, fn="maxSubarrays", args=[2, [[1, 2], [2, 1], [1, 2], [2, 1]]], expected=2)

    def test_reversed_pairs_brute(self):
        # Expected computed by the brute force above.
        n, pairs = 5, [[3, 1], [5, 2], [4, 3]]
        run_case(self, fn="maxSubarrays", args=[n, pairs], expected=brute(n, pairs))

    def test_overlapping_pairs_brute(self):
        # Expected computed by the brute force above.
        n, pairs = 6, [[1, 3], [2, 4], [2, 5], [4, 6], [3, 6]]
        run_case(self, fn="maxSubarrays", args=[n, pairs], expected=brute(n, pairs))

    def test_shared_left_end_brute(self):
        # Expected computed by the brute force above.
        n, pairs = 7, [[2, 7], [2, 4], [6, 2], [1, 5], [5, 7]]
        run_case(self, fn="maxSubarrays", args=[n, pairs], expected=brute(n, pairs))

    def test_largest_n_single_pair(self):
        # Removing the only pair leaves every subarray: n * (n + 1) / 2.
        n = 10 ** 5
        run_case(self, fn="maxSubarrays", args=[n, [[1, n]]], expected=n * (n + 1) // 2)

    def test_largest_n_duplicate_full_span(self):
        # Two copies of [1, n] (values at the upper bound n): one remains
        # and forbids only the whole array.
        n = 10 ** 5
        run_case(self, fn="maxSubarrays", args=[n, [[1, n], [n, 1]]], expected=n * (n + 1) // 2 - 1)

    def test_largest_n_adjacent_pairs_twice(self):
        # Every adjacent pair [i, i + 1] appears twice (2 * (n - 1) <= 2 * n
        # pairs). Any removal leaves all adjacent conflicts, so only the n
        # singletons survive.
        n = 10 ** 5
        pairs = [[i, i + 1] for i in range(1, n)] + [[i + 1, i] for i in range(1, n)]
        run_case(self, fn="maxSubarrays", args=[n, pairs], expected=n)


if __name__ == "__main__":
    unittest.main()
