import unittest

from sandbox.check import run_case


def brute(a):
    """Try every (i, j) with 1 <= i < j <= N-1 and count distinct values
    in each part directly. Obviously correct; only used on tiny inputs."""
    n = len(a)
    best = 0
    for i in range(1, n - 1):
        for j in range(i + 1, n):
            best = max(best, len(set(a[:i])) + len(set(a[i:j])) + len(set(a[j:])))
    return best


def make_input(a):
    return f"{len(a)}\n{' '.join(map(str, a))}\n"


class TestVarietySplit(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="5\n3 1 4 1 5\n", expected="5")

    def test_sample_2(self):
        run_case(self, stdin="10\n2 5 6 4 4 1 1 3 1 4\n", expected="9")

    # N = 3 forces (i, j) = (1, 2): three single-element parts, 1 each.
    def test_smallest_n_all_equal(self):
        run_case(self, stdin="3\n1 1 1\n", expected="3")

    # Smallest N with every element at its maximum value A_i = N = 3.
    def test_smallest_n_max_value(self):
        run_case(self, stdin="3\n3 3 3\n", expected="3")

    def test_smallest_n_distinct(self):
        run_case(self, stdin="3\n1 2 3\n", expected="3")

    # All equal: every non-empty part has exactly 1 distinct value.
    def test_all_equal_small(self):
        run_case(self, stdin="6\n2 2 2 2 2 2\n", expected="3")

    # All distinct: each part's count equals its length, total = N.
    def test_all_distinct_small(self):
        run_case(self, stdin="6\n6 1 5 2 4 3\n", expected="6")

    # By hand: (1)(2)(2 1) gives 1+1+2 = 4 = N, the upper bound.
    def test_hand_1221(self):
        run_case(self, stdin="4\n1 2 2 1\n", expected="4")

    # By hand: (1)(1 2)(2) gives 1+2+1 = 4 = N.
    def test_hand_1122(self):
        run_case(self, stdin="4\n1 1 2 2\n", expected="4")

    # By hand: only two values, so each part has at most 2; (1 2)(1 2)(1)
    # gives 2+2+1 = 5, and 6 would need three parts of length >= 2 (N >= 6).
    def test_hand_alternating_five(self):
        run_case(self, stdin="5\n1 2 1 2 1\n", expected="5")

    # Expected values below come from brute() above.
    def test_brute_small_a(self):
        a = [1, 2, 3, 1, 2, 3, 1]
        run_case(self, stdin=make_input(a), expected=str(brute(a)))

    def test_brute_small_b(self):
        a = [4, 4, 1, 2, 4, 3, 3, 1]
        run_case(self, stdin=make_input(a), expected=str(brute(a)))

    def test_brute_small_c(self):
        a = [5, 1, 5, 2, 5, 3, 5, 4, 9]
        run_case(self, stdin=make_input(a), expected=str(brute(a)))

    def test_brute_small_d(self):
        a = [1, 2, 2, 3, 3, 3, 2, 2, 1, 1]
        run_case(self, stdin=make_input(a), expected=str(brute(a)))

    def test_brute_small_e(self):
        a = [7, 3, 7, 3, 1, 1, 6, 2, 6, 2, 7, 4]
        run_case(self, stdin=make_input(a), expected=str(brute(a)))

    # Largest N, all equal to N (the largest allowed value): answer 3.
    def test_max_n_all_equal_max_value(self):
        n = 300000
        run_case(self, stdin=make_input([n] * n), expected="3")

    # Largest N, all distinct: total equals N.
    def test_max_n_all_distinct(self):
        n = 300000
        run_case(self, stdin=make_input(list(range(n, 0, -1))), expected=str(n))

    # 1..100000 three times: splitting at the block boundaries gives
    # 100000 per part, total N, which is the upper bound.
    def test_max_n_three_blocks(self):
        a = list(range(1, 100001)) * 3
        run_case(self, stdin=make_input(a), expected="300000")

    # Alternating 1, 2 over max N: each part has at most 2 distinct values
    # and parts of length >= 2 reach it, so the answer is 6.
    def test_max_n_alternating(self):
        a = [1, 2] * 150000
        run_case(self, stdin=make_input(a), expected="6")


if __name__ == "__main__":
    unittest.main()
