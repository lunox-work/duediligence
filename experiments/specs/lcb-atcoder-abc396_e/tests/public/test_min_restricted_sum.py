import unittest

from sandbox.check import run_case

# The checker compares output exactly, so every non-sample case below is
# chosen so that the minimum-sum good sequence is unique: within each
# connected component, every bit position has strictly fewer ones under one
# choice of the free root bit than under the other (or the component has no
# constraint at all, where all-zero is the only minimum).


class TestMinRestrictedSum(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="3 2\n1 3 4\n1 2 3\n", expected="0 3 4")

    def test_sample_2(self):
        run_case(self, stdin="3 3\n1 3 4\n1 2 3\n2 3 5\n", expected="-1")

    def test_sample_3(self):
        run_case(
            self,
            stdin="5 8\n4 2 4\n2 3 11\n3 4 15\n4 5 6\n3 2 11\n3 3 0\n3 1 9\n3 4 15\n",
            expected="0 2 9 6 0",
        )

    def test_single_element_no_constraints(self):
        # N=1, M=0: any non-negative A_1 is good; the unique minimum is 0.
        run_case(self, stdin="1 0\n", expected="0")

    def test_self_loop_zero(self):
        # A_1 xor A_1 = 0 always holds, so A_1 = 0 is the unique minimum.
        run_case(self, stdin="1 1\n1 1 0\n", expected="0")

    def test_self_loop_nonzero_impossible(self):
        # A_1 xor A_1 = 0 != 5, so no good sequence exists.
        run_case(self, stdin="1 1\n1 1 5\n", expected="-1")

    def test_conflicting_parallel_edges(self):
        # A_1 xor A_2 must equal both 1 and 2: impossible.
        run_case(self, stdin="2 2\n1 2 1\n2 1 2\n", expected="-1")

    def test_isolated_vertices_are_zero(self):
        # No constraints: all-zero is the unique minimum.
        run_case(self, stdin="2 0\n", expected="0 0")

    def test_max_z(self):
        # A_2 = A_3 = A_1 xor Z with Z = 10^9. For each bit set in Z, giving
        # that bit to A_1 costs one 1 instead of two, and every other bit is
        # 0 everywhere; so A = (10^9, 0, 0) is the unique minimum.
        run_case(
            self,
            stdin="3 2\n1 2 1000000000\n1 3 1000000000\n",
            expected="1000000000 0 0",
        )

    def test_max_n_no_constraints(self):
        # N = 2*10^5, M = 0: every element is 0.
        n = 200000
        run_case(self, stdin=f"{n} 0\n", expected=" ".join(["0"] * n))

    def test_max_m_star(self):
        # N = 2*10^5, M = 10^5 edges (1, i, 1) for i = 2..100001. Vertices
        # 2..100001 equal A_1 xor 1. Setting bit 0 of A_1 costs 1 instead of
        # 10^5, other bits are 0, and vertices 100002..N are unconstrained
        # (0). So the unique minimum is A_1 = 1 and every other element 0.
        n, m = 200000, 100000
        lines = [f"{n} {m}"] + [f"1 {i} 1" for i in range(2, m + 2)]
        run_case(
            self,
            stdin="\n".join(lines) + "\n",
            expected=" ".join(["1"] + ["0"] * (n - 1)),
        )


if __name__ == "__main__":
    unittest.main()
