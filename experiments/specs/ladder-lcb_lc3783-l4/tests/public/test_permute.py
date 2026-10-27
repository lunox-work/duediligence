# spec.md carries only the title "permutations-iv" and the signature
# permute(n, k) -> List[int]. These cases follow LeetCode 3470
# "Permutations IV", which that title and signature match:
#   An alternating permutation of 1..n has no two adjacent elements both
#   odd or both even. Return the k-th alternating permutation in
#   lexicographic order, or [] if there are fewer than k of them.
#   Constraints: 1 <= n <= 100, 1 <= k <= 10^15.
import unittest
from itertools import permutations
from math import factorial

from sandbox.check import run_case


def brute(n):
    """Every alternating permutation of 1..n, in lexicographic order
    (itertools.permutations of a sorted range yields that order)."""
    return [
        list(p)
        for p in permutations(range(1, n + 1))
        if all((p[i] - p[i + 1]) % 2 for i in range(n - 1))
    ]


def count(n):
    # Even n: odds and evens fill alternate slots, either parity first.
    # Odd n: the (n+1)/2 odds must take the ends. Matches brute() for n <= 7.
    odd, even = (n + 1) // 2, n // 2
    return (2 if n % 2 == 0 else 1) * factorial(odd) * factorial(even)


class TestPermute(unittest.TestCase):
    # Samples from the problem statement.
    def test_sample_1(self):
        run_case(self, fn="permute", args=[4, 6], expected=[3, 4, 1, 2])

    def test_sample_2(self):
        run_case(self, fn="permute", args=[3, 2], expected=[3, 2, 1])

    def test_sample_3(self):
        run_case(self, fn="permute", args=[2, 3], expected=[])

    # Smallest input: [1] is the only permutation of 1..1.
    def test_n1_k1(self):
        run_case(self, fn="permute", args=[1, 1], expected=[1])

    def test_n1_k2(self):
        run_case(self, fn="permute", args=[1, 2], expected=[])

    def test_n1_k_max(self):
        run_case(self, fn="permute", args=[1, 10**15], expected=[])

    # n = 2: both [1,2] and [2,1] alternate.
    def test_n2_k1(self):
        run_case(self, fn="permute", args=[2, 1], expected=[1, 2])

    def test_n2_k2(self):
        run_case(self, fn="permute", args=[2, 2], expected=[2, 1])

    # n = 3: only [1,2,3] and [3,2,1] alternate (by brute force).
    def test_n3_k3_too_few(self):
        run_case(self, fn="permute", args=[3, 3], expected=[])

    def test_n3_k_max(self):
        run_case(self, fn="permute", args=[3, 10**15], expected=[])

    # Every k from 1 to count+1 for small n, checked against brute().
    def test_brute_n4_all_k(self):
        self._all_k(4)

    def test_brute_n5_all_k(self):
        self._all_k(5)

    def test_brute_n6_all_k(self):
        self._all_k(6)

    def _all_k(self, n):
        perms = brute(n)
        self.assertEqual(len(perms), count(n))
        for k, perm in enumerate(perms, 1):
            with self.subTest(n=n, k=k):
                run_case(self, fn="permute", args=[n, k], expected=perm)
        with self.subTest(n=n, k=len(perms) + 1):
            run_case(self, fn="permute", args=[n, len(perms) + 1], expected=[])

    # Largest n: the identity alternates and is the smallest permutation.
    def test_n100_k1(self):
        run_case(self, fn="permute", args=[100, 1], expected=list(range(1, 101)))

    # Largest n, k = 2: keep 1..96, then the next suffix of 97..100 that
    # starts odd is 97,100,99,98 (same pattern as brute(6)[1] = [1,2,3,6,5,4]).
    def test_n100_k2(self):
        run_case(self, fn="permute", args=[100, 2],
                 expected=list(range(1, 97)) + [97, 100, 99, 98])

    # n = 20 and n = 21 have counts at most 10^15 (2*(10!)^2 and 11!*10!).
    # The descending permutation alternates and is the largest, so it is the
    # last; one more k gives [].
    def test_n20_last(self):
        run_case(self, fn="permute", args=[20, count(20)],
                 expected=list(range(20, 0, -1)))

    def test_n20_past_last(self):
        run_case(self, fn="permute", args=[20, count(20) + 1], expected=[])

    def test_n21_last(self):
        run_case(self, fn="permute", args=[21, count(21)],
                 expected=list(range(21, 0, -1)))

    def test_n21_past_last(self):
        run_case(self, fn="permute", args=[21, count(21) + 1], expected=[])


if __name__ == "__main__":
    unittest.main()
