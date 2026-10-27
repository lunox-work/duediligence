import unittest

from sandbox.check import run_case

# Non-sample expectations are derived by hand from the statement: smoke
# born at time s sits at P_t - P_s at time t + 0.5, where P_t is the sum of
# the first t wind moves, and (0,0) always holds smoke after each step. Each
# pattern was also confirmed on small N by literally simulating the rules.

N_MAX = 200000


class TestBonfire(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="6 -2 1\nNNEEWS\n", expected="001010\n")

    def test_sample_2(self):
        run_case(self, stdin="10 1 2\nNEESESWEES\n", expected="0001101011\n")

    def test_sample_3(self):
        run_case(self, stdin="20 -1 -2\nWWNNWSWEWNSWWENSNWWN\n", expected="00100111111000101111\n")

    def test_smallest_input_smoke_arrives(self):
        # The time-0 smoke blows from (0,0) to (-1,0) at t=1.
        run_case(self, stdin="1 -1 0\nN\n", expected="1\n")

    def test_smallest_input_no_smoke(self):
        # At t=1 smoke is only at (-1,0) and the fresh (0,0); (1,0) is empty.
        run_case(self, stdin="1 1 0\nN\n", expected="0\n")

    def test_no_generation_when_smoke_returns_to_origin(self):
        # t=1: {(-1,0),(0,0)}. t=2 (S): {(0,0),(1,0)}, so (0,0) is already
        # smoky and nothing new is made. t=3 (N): {(-1,0),(0,0)}.
        # Cell (1,0) has smoke only at t=2.
        run_case(self, stdin="3 1 0\nNSN\n", expected="010\n")

    def test_no_generation_cell_above(self):
        # Same sets as above; cell (-1,0) has smoke at t=1 and t=3.
        run_case(self, stdin="3 -1 0\nNSN\n", expected="101\n")

    def test_max_n_far_corner_reached_last(self):
        # All N: smoke at time t covers (-1,0)..(-t,0), so (-N,0) is
        # reached only at t=N. R=-N is the extreme allowed value.
        stdin = f"{N_MAX} {-N_MAX} 0\n{'N' * N_MAX}\n"
        run_case(self, stdin=stdin, expected="0" * (N_MAX - 1) + "1\n")

    def test_max_n_adjacent_cell_always_smoky(self):
        # All N: (-1,0) holds the smoke generated at the previous step at every t.
        stdin = f"{N_MAX} -1 0\n{'N' * N_MAX}\n"
        run_case(self, stdin=stdin, expected="1" * N_MAX + "\n")

    def test_max_n_east_extreme_column(self):
        # All E: smoke at time t covers (0,1)..(0,t); C=N is reached at t=N.
        stdin = f"{N_MAX} 0 {N_MAX}\n{'E' * N_MAX}\n"
        run_case(self, stdin=stdin, expected="0" * (N_MAX - 1) + "1\n")

    def test_max_n_unreachable_corner(self):
        # (-N,-N) is 2N steps from the origin but only N moves happen.
        stdin = f"{N_MAX} {-N_MAX} {-N_MAX}\n{'N' * (N_MAX // 2)}{'W' * (N_MAX // 2)}\n"
        run_case(self, stdin=stdin, expected="0" * N_MAX + "\n")

    def test_max_n_alternating_below(self):
        # NS repeated: P_t is (-1,0) for odd t and (0,0) for even t, so the
        # smoke set is {(-1,0),(0,0)} at odd t and {(0,0),(1,0)} at even t.
        stdin = f"{N_MAX} 1 0\n{'NS' * (N_MAX // 2)}\n"
        run_case(self, stdin=stdin, expected="01" * (N_MAX // 2) + "\n")

    def test_max_n_alternating_above(self):
        # Same smoke sets as the previous case, observed at (-1,0).
        stdin = f"{N_MAX} -1 0\n{'NS' * (N_MAX // 2)}\n"
        run_case(self, stdin=stdin, expected="10" * (N_MAX // 2) + "\n")


if __name__ == "__main__":
    unittest.main()
