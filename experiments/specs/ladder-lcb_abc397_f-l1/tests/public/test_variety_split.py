# The statement gives no sample inputs, so every case here is either derived
# by hand (reasoning in the comment) or computed by `brute`, which tries every
# pair (i, j) with 1 <= i < j <= N-1 and counts distinct values directly.
import unittest

from sandbox.check import run_case


def brute(a):
    n = len(a)
    return max(
        len(set(a[:i])) + len(set(a[i:j])) + len(set(a[j:]))
        for i in range(1, n - 1)
        for j in range(i + 1, n)
    )


def stdin_of(a):
    return f"{len(a)}\n{' '.join(map(str, a))}\n"


class TestVarietySplit(unittest.TestCase):
    def check_brute(self, a):
        run_case(self, stdin=stdin_of(a), expected=str(brute(a)))

    # --- smallest input, N = 3: the only split is one element per part ---

    def test_n3_all_equal(self):
        # (1)(1)(1): 1 + 1 + 1
        run_case(self, stdin="3\n1 1 1\n", expected="3")

    def test_n3_all_distinct(self):
        # (1)(2)(3): 1 + 1 + 1
        run_case(self, stdin="3\n1 2 3\n", expected="3")

    def test_n3_max_value(self):
        # A_i = N = 3 everywhere; (3)(3)(3): 1 + 1 + 1
        run_case(self, stdin="3\n3 3 3\n", expected="3")

    # --- small hand-derived cases ---

    def test_n4_all_equal(self):
        # every part holds only the value 1, so each counts 1
        run_case(self, stdin="4\n1 1 1 1\n", expected="3")

    def test_n4_alternating(self):
        # (1)(2)(1 2) gives 1 + 1 + 2 = 4, and no split can exceed N = 4
        run_case(self, stdin="4\n1 2 1 2\n", expected="4")

    def test_n5_one_repeat(self):
        # (3 1)(4 1)(5) gives 2 + 2 + 1 = 5 = N, the upper bound
        run_case(self, stdin="5\n3 1 4 1 5\n", expected="5")

    def test_n6_value_only_at_ends(self):
        # value 6 at both ends, 1s between: a value appearing twice counts at
        # most twice, and 1 counts at most 3 times, so the bound is 2 + 3 = 5;
        # (6 1)(1)(1 6) gives 2 + 1 + 2 = 5
        run_case(self, stdin="6\n6 1 1 1 1 6\n", expected="5")

    # --- brute-force-checked small cases ---

    def test_brute_n10_mixed(self):
        self.check_brute([2, 5, 6, 4, 4, 1, 1, 3, 1, 4])

    def test_brute_n8_blocks(self):
        self.check_brute([1, 1, 2, 2, 3, 3, 1, 2])

    def test_brute_n9_palindrome(self):
        self.check_brute([1, 2, 3, 4, 5, 4, 3, 2, 1])

    def test_brute_n7_two_values(self):
        self.check_brute([7, 7, 1, 7, 1, 1, 7])

    def test_brute_n12_spread(self):
        self.check_brute([3, 9, 3, 12, 9, 1, 3, 12, 1, 9, 5, 3])

    # --- largest N = 3 * 10^5 ---

    def test_max_n_all_equal_max_value(self):
        # every A_i = N, the largest allowed value: each part counts 1
        n = 300000
        run_case(self, stdin=f"{n}\n{' '.join([str(n)] * n)}\n", expected="3")

    def test_max_n_all_distinct(self):
        # all values distinct, so every split's sum is exactly N
        n = 300000
        run_case(self, stdin=f"{n}\n{' '.join(map(str, range(1, n + 1)))}\n", expected=str(n))

    def test_max_n_alternating_two_values(self):
        # 1 2 1 2 ...: each part holds at most 2 distinct values, and any
        # split into parts of length >= 2 contains both, so 2 * 3 = 6
        n = 300000
        a = [1 + (k % 2) for k in range(n)]
        run_case(self, stdin=stdin_of(a), expected="6")


if __name__ == "__main__":
    unittest.main()
