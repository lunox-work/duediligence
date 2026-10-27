import unittest

from src.solution import sum_to_n


class TestSumToNPrivate(unittest.TestCase):
    # Rule: the result is the sum of the integers 1..n. The docstring
    # examples print integers (465, not 465.0), so the result is an int.

    # Extends test_example_1: smallest n, result must be the int 1.
    def test_n_1_returns_int(self):
        result = sum_to_n(1)
        self.assertIs(type(result), int)
        self.assertEqual(result, 1)

    # Extends test_example_30: a float-returning formula n*(n+1)/2 passes
    # assertEqual(465.0, 465) but would print 465.0 in the doctest.
    def test_n_30_returns_int(self):
        result = sum_to_n(30)
        self.assertIs(type(result), int)
        self.assertEqual(result, 465)

    # Extends test_typical_n_4: n=3, by hand 1 + 2 + 3 = 6.
    def test_n_3(self):
        self.assertEqual(sum_to_n(3), 6)

    # Extends test_example_5: n=6, by hand 15 + 6 = 21.
    def test_n_6(self):
        self.assertEqual(sum_to_n(6), 21)

    # Extends test_example_10: n=11, by hand 55 + 11 = 66. Catches a
    # lookup table of the public values.
    def test_n_11(self):
        self.assertEqual(sum_to_n(11), 66)

    # Extends test_example_10: n=9, by hand 55 - 10 = 45. Catches an
    # off-by-one that drops the last term (sum of 1..n-1).
    def test_n_9(self):
        self.assertEqual(sum_to_n(9), 45)

    # Extends test_boundary_n_2_smallest_with_two_terms and
    # test_example_100: every n from 1 to 300 against a brute-force loop
    # adding 1, 2, ..., n one at a time.
    def test_range_1_to_300_brute_force(self):
        for n in range(1, 301):
            expected = 0
            for k in range(1, n + 1):
                expected += k
            with self.subTest(n=n):
                result = sum_to_n(n)
                self.assertIs(type(result), int)
                self.assertEqual(result, expected)

    # Extends test_example_100: n=1000, brute force sum(range(1, 1001)).
    def test_n_1000_brute_force(self):
        self.assertEqual(sum_to_n(1000), sum(range(1, 1001)))

    # Extends test_example_100: n=100000, brute force with the builtin sum
    # over range(1, n + 1) (fast enough at this size).
    def test_n_100000_brute_force(self):
        n = 100000
        self.assertEqual(sum_to_n(n), sum(range(1, n + 1)))

    # Extends test_example_100: n=10**18. Exact answer by Gauss's pairing,
    # n*(n+1)//2 with integer arithmetic, written out:
    # 10**18 * (10**18 + 1) / 2 = 500000000000000000500000000000000000.
    # A float formula loses precision at this size.
    def test_n_10_pow_18_exact(self):
        self.assertEqual(
            sum_to_n(10**18), 500000000000000000500000000000000000
        )

    # Extends test_example_100: consecutive results differ by exactly n,
    # since sum(1..n) - sum(1..n-1) = n.
    def test_consecutive_difference_is_n(self):
        for n in (2, 37, 101, 999, 12345):
            with self.subTest(n=n):
                self.assertEqual(sum_to_n(n) - sum_to_n(n - 1), n)


if __name__ == "__main__":
    unittest.main()
