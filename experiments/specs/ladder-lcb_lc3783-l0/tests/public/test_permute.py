import itertools
import math
import unittest

from sandbox.check import run_case


def brute(n, k):
    # itertools.permutations of a sorted range yields permutations in
    # lexicographic order; keep the alternating ones and take the k-th.
    seen = 0
    for p in itertools.permutations(range(1, n + 1)):
        if all((p[i] - p[i + 1]) % 2 for i in range(n - 1)):
            seen += 1
            if seen == k:
                return list(p)
    return []


def count(n):
    # Parities must alternate: n even -> either parity may start, 2*(n/2)!^2;
    # n odd -> must start odd, ((n+1)/2)! * ((n-1)/2)!.
    if n % 2 == 0:
        return 2 * math.factorial(n // 2) ** 2
    return math.factorial((n + 1) // 2) * math.factorial(n // 2)


class TestPermute(unittest.TestCase):
    # Samples from the statement.
    def test_example_1(self):
        run_case(self, fn="permute", args=[4, 6], expected=[3, 4, 1, 2])

    def test_example_2(self):
        run_case(self, fn="permute", args=[3, 2], expected=[3, 2, 1])

    def test_example_3(self):
        run_case(self, fn="permute", args=[2, 3], expected=[])

    # Smallest n: only [1] exists.
    def test_n1_k1(self):
        run_case(self, fn="permute", args=[1, 1], expected=[1])

    def test_n1_k2(self):
        run_case(self, fn="permute", args=[1, 2], expected=[])

    def test_n1_k_max(self):
        run_case(self, fn="permute", args=[1, 10**15], expected=[])

    # n = 2 (list given in example 3).
    def test_n2_k1(self):
        run_case(self, fn="permute", args=[2, 1], expected=[1, 2])

    def test_n2_k2(self):
        run_case(self, fn="permute", args=[2, 2], expected=[2, 1])

    # n = 3 (list given in example 2): exactly 2 permutations.
    def test_n3_k1(self):
        run_case(self, fn="permute", args=[3, 1], expected=[1, 2, 3])

    def test_n3_k3(self):
        run_case(self, fn="permute", args=[3, 3], expected=[])

    # n = 4 (list given in example 1): exactly 8 permutations.
    def test_n4_k1(self):
        run_case(self, fn="permute", args=[4, 1], expected=[1, 2, 3, 4])

    def test_n4_k8(self):
        run_case(self, fn="permute", args=[4, 8], expected=[4, 3, 2, 1])

    def test_n4_k9(self):
        run_case(self, fn="permute", args=[4, 9], expected=[])

    def test_n4_k_max(self):
        run_case(self, fn="permute", args=[4, 10**15], expected=[])

    # Small n, expected values from the brute force above.
    def test_n5_last(self):
        self.assertEqual(count(5), 12)
        run_case(self, fn="permute", args=[5, 12], expected=brute(5, 12))

    def test_n5_past_end(self):
        self.assertEqual(brute(5, 13), [])
        run_case(self, fn="permute", args=[5, 13], expected=[])

    def test_n6_k37(self):
        run_case(self, fn="permute", args=[6, 37], expected=brute(6, 37))

    def test_n6_past_end(self):
        self.assertEqual(brute(6, 73), [])
        run_case(self, fn="permute", args=[6, 73], expected=[])

    def test_n7_k50(self):
        run_case(self, fn="permute", args=[7, 50], expected=brute(7, 50))

    def test_n8_k1000(self):
        run_case(self, fn="permute", args=[8, 1000], expected=brute(8, 1000))

    def test_n8_past_end(self):
        self.assertEqual(brute(8, 1153), [])
        run_case(self, fn="permute", args=[8, 1153], expected=[])

    # Larger n. The descending permutation alternates and is the
    # lexicographically largest of all permutations, so it is the last one,
    # at k = count(n); k = count(n) + 1 is past the end.
    def test_n20_last(self):
        run_case(self, fn="permute", args=[20, count(20)],
                 expected=list(range(20, 0, -1)))

    def test_n20_k_max(self):
        # count(20) = 2 * (10!)^2 = 26336378880000 < 10^15.
        self.assertLess(count(20), 10**15)
        run_case(self, fn="permute", args=[20, 10**15], expected=[])

    def test_n21_last(self):
        run_case(self, fn="permute", args=[21, count(21)],
                 expected=list(range(21, 0, -1)))

    def test_n21_past_end(self):
        run_case(self, fn="permute", args=[21, count(21) + 1], expected=[])

    def test_n21_k_max(self):
        # count(21) = 11! * 10! = 144850083840000 < 10^15.
        self.assertLess(count(21), 10**15)
        run_case(self, fn="permute", args=[21, 10**15], expected=[])

    # Largest n: the identity alternates and is lexicographically smallest.
    def test_n100_k1(self):
        run_case(self, fn="permute", args=[100, 1],
                 expected=list(range(1, 101)))

    def test_n100_k2(self):
        # With prefix 1..98 the tail {99, 100} is forced; with prefix 1..97
        # the tail {98, 99, 100} must start even: 98,99,100 or 100,99,98.
        # So the second permutation is 1..97 followed by 100, 99, 98.
        run_case(self, fn="permute", args=[100, 2],
                 expected=list(range(1, 98)) + [100, 99, 98])


if __name__ == "__main__":
    unittest.main()
