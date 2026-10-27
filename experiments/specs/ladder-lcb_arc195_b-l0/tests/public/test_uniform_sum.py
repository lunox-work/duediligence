import unittest

from sandbox.check import run_case


def make_input(a, b):
    return f"{len(a)}\n{' '.join(map(str, a))}\n{' '.join(map(str, b))}\n"


class TestUniformSum(unittest.TestCase):
    # Samples from the statement.

    def test_sample_1(self):
        run_case(self, stdin="4\n2 0 -1 3\n3 -1 4 2\n", expected="Yes")

    def test_sample_2(self):
        run_case(self, stdin="3\n1 2 3\n1 2 4\n", expected="No")

    def test_sample_3(self):
        run_case(self, stdin="3\n1 2 -1\n1 2 4\n", expected="No")

    # Smallest N. Expected answers derived by hand (N=2 has only two
    # arrangements of A) and cross-checked with a brute force over all
    # permutations of A.

    def test_min_all_unknown(self):
        # Fill everything with 0.
        run_case(self, stdin="2\n-1 -1\n-1 -1\n", expected="Yes")

    def test_min_all_zero(self):
        run_case(self, stdin="2\n0 0\n0 0\n", expected="Yes")

    def test_min_fixed_mismatch(self):
        # B is (0,0), so any arrangement gives sums {0,1}.
        run_case(self, stdin="2\n0 1\n0 0\n", expected="No")

    def test_min_max_values_cross_pair(self):
        # Rearrange A to (0, 10^9): both sums are 10^9.
        run_case(self, stdin="2\n1000000000 0\n0 1000000000\n", expected="Yes")

    def test_min_max_values_already_paired(self):
        # Rearrange A to (10^9, 0): both sums are 10^9.
        run_case(self, stdin="2\n0 1000000000\n0 1000000000\n", expected="Yes")

    def test_min_max_values_impossible(self):
        # A is (10^9, 10^9) in any order; sums are 10^9 and 2*10^9.
        run_case(self, stdin="2\n1000000000 1000000000\n0 1000000000\n", expected="No")

    def test_min_all_max_values(self):
        # Every sum is 2*10^9.
        run_case(self, stdin="2\n1000000000 1000000000\n1000000000 1000000000\n", expected="Yes")

    def test_unknown_a_needs_large_sum(self):
        # Fill A with (10^9, 0): sums are 10^9.
        run_case(self, stdin="2\n-1 -1\n0 1000000000\n", expected="Yes")

    def test_both_sides_unknown_max_value(self):
        # Pair 10^9 with B=-1 and A=-1 with B=0; fill both so sums are 10^9.
        run_case(self, stdin="2\n1000000000 -1\n-1 0\n", expected="Yes")

    def test_unknown_b_pairing_matters(self):
        # A=(3,0): pair 3 with B=1 (sum 4), fill the other B with 4.
        run_case(self, stdin="2\n3 0\n-1 1\n", expected="Yes")

    # Filled values must be non-negative. Derived by hand: the only
    # arrangement with equal fixed sums forces S=2 (resp. S=3), which is
    # below the remaining known value, so the filled value would be
    # negative. Cross-checked with a brute force over all permutations.

    def test_negative_fill_in_b(self):
        # Fixed sums equal only for A=(1,1) on B=(1,1): S=2 < 5.
        run_case(self, stdin="3\n5 1 1\n1 1 -1\n", expected="No")

    def test_negative_fill_in_a(self):
        # Fixed sums equal only for A=(2,2) on B=(1,1): S=3 < 5.
        run_case(self, stdin="3\n2 2 -1\n1 1 5\n", expected="No")

    # Largest N.

    def test_max_n_all_unknown(self):
        n = 2000
        run_case(self, stdin=make_input([-1] * n, [-1] * n), expected="Yes")

    def test_max_n_all_max_values(self):
        n = 2000
        run_case(self, stdin=make_input([10**9] * n, [10**9] * n), expected="Yes")

    def test_max_n_reversed_pairs(self):
        # A_i = i, B_i = i for i in 0..1999: reverse A so every sum is 1999.
        n = 2000
        run_case(self, stdin=make_input(list(range(n)), list(range(n))), expected="Yes")

    def test_max_n_single_mismatch(self):
        # B is all 0 and A has one 1 among 0s: sums are always {0, 1}.
        n = 2000
        a = [0] * (n - 1) + [1]
        run_case(self, stdin=make_input(a, [0] * n), expected="No")


if __name__ == "__main__":
    unittest.main()
