# spec.md gives only the input format. The statement, samples and
# constraints below are those of AtCoder ARC 194 C "Cost to Flip", which
# the title and format identify:
#   A, B are 0/1 sequences, C positive. One operation flips one A_i and
#   costs sum(A_k * C_k) over k, taken after the flip. Print the minimum
#   total cost to make A equal to B.
#   1 <= N <= 2*10^5, A_i, B_i in {0, 1}, 1 <= C_i <= 10^6.
# The three sample answers were re-checked with a Dijkstra brute force
# over all 2^N states of A.
import unittest

from sandbox.check import run_case


class TestCostToFlip(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="4\n0 1 1 1\n1 0 1 0\n4 6 2 9\n", expected="16")

    def test_sample_2(self):
        run_case(self, stdin="5\n1 1 1 1 1\n1 1 1 1 1\n1 1 1 1 1\n", expected="0")

    def test_sample_3(self):
        run_case(
            self,
            stdin="20\n"
            "1 1 1 1 0 0 1 1 0 0 0 1 0 1 0 1 1 0 1 0\n"
            "0 0 0 1 1 1 0 1 1 0 0 0 0 0 0 1 0 1 0 0\n"
            "52 73 97 72 54 15 79 67 13 55 65 22 36 90 84 46 1 2 27 8\n",
            expected="2867",
        )

    # N = 1, A = B: nothing to do, so 0.
    def test_single_equal_zero(self):
        run_case(self, stdin="1\n0\n0\n1\n", expected="0")

    def test_single_equal_one_max_c(self):
        run_case(self, stdin="1\n1\n1\n1000000\n", expected="0")

    # N = 1, 0 -> 1: one flip, after which A_1 = 1, cost C_1 = 10^6.
    def test_single_turn_on_max_c(self):
        run_case(self, stdin="1\n0\n1\n1000000\n", expected="1000000")

    # N = 1, 1 -> 0: one flip, after which A is all zero, cost 0.
    def test_single_turn_off_max_c(self):
        run_case(self, stdin="1\n1\n0\n1000000\n", expected="0")

    # By hand (and brute force): turn off index 2 (cost 5), index 3 (0),
    # then turn on index 1 (5). Total 10.
    def test_off_before_on(self):
        run_case(self, stdin="3\n0 1 1\n1 0 0\n5 5 5\n", expected="10")

    # By hand (and brute force): turn off index 3 (cost 1), index 1 (0),
    # then turn on index 2 (2). Total 3.
    def test_off_largest_first(self):
        run_case(self, stdin="3\n1 0 1\n0 1 0\n1 2 3\n", expected="3")

    # Largest N, A = B: answer 0.
    def test_max_n_already_equal(self):
        n = 200000
        ones = " ".join(["1"] * n)
        cs = " ".join(["1000000"] * n)
        run_case(self, stdin=f"{n}\n{ones}\n{ones}\n{cs}\n", expected="0")

    # Largest N, all 0 -> all 1, every C_i = 10^6. Once an index is
    # turned on for the last time it stays on, so the j-th such event
    # costs at least j * 10^6. Turning them on one by one reaches that
    # bound: 10^6 * N(N+1)/2 = 10^6 * 20000100000.
    def test_max_n_all_turn_on(self):
        n = 200000
        zeros = " ".join(["0"] * n)
        ones = " ".join(["1"] * n)
        cs = " ".join(["1000000"] * n)
        run_case(self, stdin=f"{n}\n{zeros}\n{ones}\n{cs}\n", expected="20000100000000000")

    # Largest N, all 1 -> all 0, every C_i = 10^6. When an index is turned
    # off for the first time, every index not yet flipped is still on, so
    # the j-th such event costs at least (N - j) * 10^6. Turning them off
    # one by one reaches that bound: 10^6 * N(N-1)/2 = 10^6 * 19999900000.
    def test_max_n_all_turn_off(self):
        n = 200000
        zeros = " ".join(["0"] * n)
        ones = " ".join(["1"] * n)
        cs = " ".join(["1000000"] * n)
        run_case(self, stdin=f"{n}\n{ones}\n{zeros}\n{cs}\n", expected="19999900000000000")


if __name__ == "__main__":
    unittest.main()
