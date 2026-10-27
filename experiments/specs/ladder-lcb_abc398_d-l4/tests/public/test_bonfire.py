# Public tests for "Bonfire".
#
# spec.md keeps only the input/output format; the samples, the rules and the
# constraints below are from the original statement (AtCoder ABC398 D):
#   - At time 0.5 there is smoke only at (0, 0).
#   - At time t (1 <= t <= N) all smoke moves one cell in direction S_t
#     (N: (r-1, c), W: (r, c-1), S: (r+1, c), E: (r, c+1)); then, if (0, 0)
#     has no smoke, new smoke is generated there.
#   - 1 <= N <= 200000, |R| <= N, |C| <= N, (R, C) != (0, 0),
#     S has length N and consists of N, W, S, E.
# The non-sample answers come from a direct set-based simulation of these
# rules. That simulation reproduces all three samples.
import unittest

from sandbox.check import run_case


class TestBonfire(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="6 -2 1\nNNEEWS\n", expected="001010")

    def test_sample_2(self):
        run_case(self, stdin="10 1 2\nNEESESWEES\n", expected="0001101011")

    def test_sample_3(self):
        run_case(self, stdin="20 -1 -2\nWWNNWSWEWNSWWENSNWWN\n",
                 expected="00100111111000101111")

    # Smallest input, N = 1: after the only step the smoke from time 0.5 is one
    # cell away from (0, 0) in the wind's direction, and new smoke is at (0, 0).
    def test_n1_north_target_hit(self):
        run_case(self, stdin="1 -1 0\nN\n", expected="1")

    def test_n1_north_target_opposite(self):
        run_case(self, stdin="1 1 0\nN\n", expected="0")

    def test_n1_west_target_hit(self):
        run_case(self, stdin="1 0 -1\nW\n", expected="1")

    def test_n1_south_target_hit(self):
        run_case(self, stdin="1 1 0\nS\n", expected="1")

    def test_n1_east_target_hit(self):
        run_case(self, stdin="1 0 1\nE\n", expected="1")

    def test_n1_east_target_diagonal(self):
        run_case(self, stdin="1 1 1\nE\n", expected="0")

    # Wind going back and forth: at the odd times the smoke is at (0, 1) and
    # (0, 0); at the even times it has all moved back, so (0, 1) has no smoke.
    # Worked out by hand and checked with the simulation.
    def test_alternating_east_west(self):
        run_case(self, stdin="4 0 1\nEWEW\n", expected="1010")

    # Largest N, |R| = N: the wind always blows north, so after t steps the
    # oldest smoke is at (-t, 0) and every newer puff is closer to the origin.
    # (-N, 0) gets smoke only at t = N.
    def test_max_n_far_north(self):
        n = 200000
        run_case(self, stdin=f"{n} {-n} 0\n{'N' * n}\n",
                 expected="0" * (n - 1) + "1")

    # Largest N, |C| = N, the same reasoning with the wind blowing east.
    def test_max_n_far_east(self):
        n = 200000
        run_case(self, stdin=f"{n} 0 {n}\n{'E' * n}\n",
                 expected="0" * (n - 1) + "1")

    # Largest N with the target on the side the wind never blows toward: every
    # puff has row <= 0, so (N, 0) never has smoke.
    def test_max_n_upwind_never(self):
        n = 200000
        run_case(self, stdin=f"{n} {n} 0\n{'N' * n}\n", expected="0" * n)


if __name__ == "__main__":
    unittest.main()
