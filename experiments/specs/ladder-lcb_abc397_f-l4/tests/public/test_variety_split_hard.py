# spec.md carries only the title and input format. The problem is taken to be
# AtCoder ABC397 F "Variety Split Hard": split A into three non-empty
# contiguous subarrays and print the maximum possible sum of the number of
# distinct integers in each. Constraints: 3 <= N <= 3*10^5, 1 <= A_i <= N.
import unittest

from sandbox.check import run_case


def brute(a):
    # Obviously correct for tiny inputs: try every pair of cut points.
    n = len(a)
    return max(
        len(set(a[:i])) + len(set(a[i:j])) + len(set(a[j:]))
        for i in range(1, n - 1)
        for j in range(i + 1, n)
    )


class TestVarietySplitHard(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="5\n3 1 4 1 5\n", expected="5")

    def test_sample_2(self):
        run_case(self, stdin="10\n2 5 6 4 4 1 1 3 1 4\n", expected="9")

    def test_smallest_n_all_equal(self):
        # N = 3: the only split is one element per part, each has 1 distinct.
        run_case(self, stdin="3\n1 1 1\n", expected="3")

    def test_smallest_n_max_value(self):
        # A_i = N = 3, the largest allowed value; one element per part -> 3.
        run_case(self, stdin="3\n3 3 3\n", expected="3")

    def test_smallest_n_all_distinct(self):
        # N = 3 distinct values; one element per part -> 3.
        run_case(self, stdin="3\n1 2 3\n", expected="3")

    def test_all_equal_max_value(self):
        # Every part contains only the value 5, so each contributes 1 -> 3.
        run_case(self, stdin="5\n5 5 5 5 5\n", expected="3")

    def test_value_reused_across_parts(self):
        # Split as [1 2] [1 2] [1 2]: each part has 2 distinct, and no part
        # can have more than 2 -> 6. Agrees with brute().
        a = [1, 2, 1, 2, 1, 2]
        self.assertEqual(brute(a), 6)
        run_case(self, stdin="6\n1 2 1 2 1 2\n", expected="6")

    def test_all_distinct_max_values(self):
        # All values distinct (1..N, including N): any split gives N in total.
        run_case(self, stdin="6\n6 5 4 3 2 1\n", expected="6")

    def test_small_mixed_brute(self):
        # Expected value computed by brute() over every pair of cut points.
        a = [2, 2, 1, 1]
        run_case(self, stdin="4\n2 2 1 1\n", expected=str(brute(a)))


if __name__ == "__main__":
    unittest.main()
