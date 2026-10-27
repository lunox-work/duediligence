# Public tests for "Rotated Inversions".
#
# spec.md carries only the title and the input/output format. Title and
# format identify the problem as AtCoder ABC396 F: for each k = 0..M-1,
# B_i = (A_i + k) mod M, print the inversion number of B.
# Constraints: 1 <= N, M <= 2*10^5, 0 <= A_i < M.
import unittest

from sandbox.check import run_case


def brute(m, a):
    # Direct definition: build B for every k and count pairs i < j with
    # B_i > B_j. Only used on tiny inputs.
    lines = []
    for k in range(m):
        b = [(x + k) % m for x in a]
        lines.append(sum(1 for i in range(len(b)) for j in range(i + 1, len(b)) if b[i] > b[j]))
    return "\n".join(map(str, lines))


class TestRotatedInversions(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="3 3\n2 1 0\n", expected="3\n1\n1\n")

    def test_sample_2(self):
        run_case(self, stdin="5 6\n5 3 5 0 1\n", expected="7\n3\n3\n1\n1\n5\n")

    def test_sample_3(self):
        run_case(self, stdin="7 7\n0 1 2 3 4 5 6\n", expected="0\n6\n10\n12\n12\n10\n6\n")

    def test_smallest_input(self):
        # N = M = 1: A_1 must be 0, one k, no pairs.
        run_case(self, stdin="1 1\n0\n", expected="0\n")

    def test_single_element_many_k(self):
        # N = 1: no pairs for any k, so M lines of 0.
        run_case(self, stdin="1 5\n4\n", expected="0\n0\n0\n0\n0\n")

    def test_m_one_all_zero(self):
        # M = 1 forces every A_i = 0; all equal, no inversions.
        run_case(self, stdin="4 1\n0 0 0 0\n", expected="0\n")

    def test_max_values_wrap(self):
        # A_i = M-1 wraps to 0 at k = 1. Expected from brute() above.
        run_case(self, stdin="3 5\n4 4 0\n", expected=brute(5, [4, 4, 0]))

    def test_alternating_extremes(self):
        # Expected from brute() above.
        run_case(self, stdin="4 4\n3 0 3 0\n", expected=brute(4, [3, 0, 3, 0]))

    def test_two_elements_all_k(self):
        # Expected from brute() above.
        run_case(self, stdin="2 3\n0 2\n", expected=brute(3, [0, 2]))

    def test_max_all_equal(self):
        # N = M = 2*10^5, all A_i = M-1: B stays constant for every k,
        # so every answer is 0.
        n = m = 200000
        stdin = f"{n} {m}\n" + " ".join([str(m - 1)] * n) + "\n"
        run_case(self, stdin=stdin, expected="\n".join(["0"] * m))

    def test_max_identity_permutation(self):
        # N = M = 2*10^5, A = 0..M-1. For k, B = [k..M-1, 0..k-1]: both
        # blocks increase and every element of the first block (M-k of
        # them) beats every element of the second (k of them), so the
        # answer is k*(M-k), up to 10^10.
        n = m = 200000
        stdin = f"{n} {m}\n" + " ".join(map(str, range(m))) + "\n"
        expected = "\n".join(str(k * (m - k)) for k in range(m))
        run_case(self, stdin=stdin, expected=expected)


if __name__ == "__main__":
    unittest.main()
