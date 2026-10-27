# spec.md gives no sample inputs, so every expected value below is derived
# by hand. Each one was also checked against an exhaustive search over H
# and every final U' tuple (small cases), or against an independent solver
# cross-checked with that search (large cases).
#
# Throughout: after grinding, U'_i + D'_i = H with 0 <= U'_i <= U_i and
# 0 <= D'_i <= D_i, so the cost is sum(U_i + D_i) - N * H.
import unittest

from sandbox.check import run_case

B = 10**9
N_MAX = 2 * 10**5


def make_input(x, pairs):
    lines = [f"{len(pairs)} {x}"]
    lines.extend(f"{u} {d}" for u, d in pairs)
    return "\n".join(lines) + "\n"


class TestSmoothOcclusion(unittest.TestCase):
    def test_smallest_input_already_fits(self):
        # N=2, all lengths 1: H=2 and |1-1| <= 1, so nothing to grind.
        run_case(self, stdin="2 1\n1 1\n1 1\n", expected="0")

    def test_sums_equal_but_x_forces_grinding(self):
        # Sums are both 6, but |5-1| > X=1. U'_2 <= 1 so U'_1 <= 2, and
        # D'_1 <= 1 means H <= U'_1 + 1 <= 3. H=3 works with U'=(2,1),
        # D'=(1,2). Cost 12 - 2*3 = 6.
        run_case(self, stdin="2 1\n5 1\n1 5\n", expected="6")

    def test_sums_equal_and_x_large_enough(self):
        # Same teeth as above, but X=4 allows |5-1| = 4: cost 0.
        run_case(self, stdin="2 4\n5 1\n1 5\n", expected="0")

    def test_h_limited_by_smallest_sum(self):
        # Sums 5, 4, 5 so H <= 4. H=4 works with U'=(2,2,3), D'=(2,2,1);
        # adjacent differences are at most 1 <= X=5. Cost 14 - 3*4 = 2.
        run_case(self, stdin="3 5\n3 2\n2 2\n4 1\n", expected="2")

    def test_short_middle_upper_tooth(self):
        # Sums 8, 5, 8 so H <= 5. H=5 works with U'=(1,1,1), D'=(4,4,4).
        # Cost 21 - 3*5 = 6.
        run_case(self, stdin="3 1\n4 4\n1 4\n4 4\n", expected="6")

    def test_max_values_already_fit(self):
        # Every length 10^9, X=1: H=2*10^9 and differences are 0.
        run_case(self, stdin=f"2 1\n{B} {B}\n{B} {B}\n", expected="0")

    def test_max_values_max_x_already_fit(self):
        # Sums are both 10^9+1 and |10^9 - 1| <= X = 10^9: cost 0.
        run_case(self, stdin=f"2 {B}\n{B} 1\n1 {B}\n", expected="0")

    def test_max_values_x_one(self):
        # U'_2 <= 1 so U'_1 <= 2, and D'_1 <= 1 means H <= 3. H=3 works
        # with U'=(2,1), D'=(1,2). Cost (2*10^9 + 2) - 2*3 = 1999999996.
        run_case(self, stdin=f"2 1\n{B} 1\n1 {B}\n", expected="1999999996")

    def test_max_n_all_max_values(self):
        # N=2*10^5, every length 10^9: already fits, cost 0.
        run_case(self, stdin=make_input(1, [(B, B)] * N_MAX), expected="0")

    def test_max_n_ramp_already_fits(self):
        # U_i = i, D_i = N+1-i: every sum is N+1 and consecutive U differ
        # by exactly 1 = X. Cost 0.
        pairs = [(i, N_MAX + 1 - i) for i in range(1, N_MAX + 1)]
        run_case(self, stdin=make_input(1, pairs), expected="0")

    def test_max_n_alternating_large_answer(self):
        # Teeth alternate (10^9, 10^9) and (1, 1). The (1, 1) teeth force
        # H <= 2. H=2 works with every U'_i = D'_i = 1. Cost
        # (N/2)*(2*10^9) + (N/2)*2 - 2N = N*(10^9 - 1) = 199999999800000,
        # which needs more than 32 bits.
        pairs = [(B, B) if i % 2 == 0 else (1, 1) for i in range(N_MAX)]
        run_case(self, stdin=make_input(B, pairs), expected="199999999800000")


if __name__ == "__main__":
    unittest.main()
