import unittest

from sandbox.check import run_case


def brute(n, m, a):
    # Direct from the statement: for each k build B, count pairs i<j with B_i > B_j.
    lines = []
    for k in range(m):
        b = [(x + k) % m for x in a]
        lines.append(str(sum(1 for i in range(n) for j in range(i + 1, n) if b[i] > b[j])))
    return "\n".join(lines)


def case(n, m, a):
    return f"{n} {m}\n{' '.join(map(str, a))}\n"


class TestRotatedInversions(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="3 3\n2 1 0\n", expected="3\n1\n1\n")

    def test_sample_2(self):
        run_case(self, stdin="5 6\n5 3 5 0 1\n", expected="7\n3\n3\n1\n1\n5\n")

    def test_sample_3(self):
        run_case(self, stdin="7 7\n0 1 2 3 4 5 6\n", expected="0\n6\n10\n12\n12\n10\n6\n")

    def test_smallest_input(self):
        # N=1, M=1: a single element has no pairs; one line for k=0.
        run_case(self, stdin="1 1\n0\n", expected="0\n")

    def test_single_element_max_value(self):
        # N=1: no pairs for any k; M lines of 0. A_1 = M-1 is the largest allowed value.
        m = 200000
        run_case(self, stdin=case(1, m, [m - 1]), expected="\n".join(["0"] * m) + "\n")

    def test_two_elements_m2(self):
        # By hand: k=0 B=(1,0) -> 1; k=1 B=(0,1) -> 0.
        run_case(self, stdin="2 2\n1 0\n", expected="1\n0\n")

    def test_two_elements_wraparound(self):
        # By hand: k=0 B=(0,1) -> 0; k=1 B=(1,2) -> 0; k=2 B=(2,0) -> 1.
        run_case(self, stdin="2 3\n0 1\n", expected="0\n0\n1\n")

    def test_max_m_two_elements_max_value(self):
        # By hand: k=0 B=(M-1,0) -> 1. For k>=1, B=(k-1,k) -> 0.
        m = 200000
        run_case(self, stdin=case(2, m, [m - 1, 0]), expected="1\n" + "\n".join(["0"] * (m - 1)) + "\n")

    def test_all_equal(self):
        # Equal elements stay equal after the same shift: every answer is 0.
        run_case(self, stdin="4 3\n2 2 2 2\n", expected="0\n0\n0\n")

    def test_max_n_max_m_all_equal(self):
        # Equal elements stay equal after the same shift: M lines of 0.
        n = m = 200000
        run_case(self, stdin=case(n, m, [m - 1] * n), expected="\n".join(["0"] * m) + "\n")

    def test_max_n_m1(self):
        # M=1 forces every A_i = 0; one line, 0 inversions.
        n = 200000
        run_case(self, stdin=case(n, 1, [0] * n), expected="0\n")

    def test_max_n_large_answer(self):
        # A = 1 x h then 0 x h, M=2. k=0: every (1, 0) pair is an inversion -> h*h = 10^10.
        # k=1: B = 0 x h then 1 x h, sorted -> 0.
        h = 100000
        run_case(self, stdin=case(2 * h, 2, [1] * h + [0] * h), expected=f"{h * h}\n0\n")

    def test_brute_small_mixed(self):
        # Expected computed by the O(M N^2) brute force above.
        n, m, a = 8, 5, [4, 0, 3, 3, 1, 4, 0, 2]
        run_case(self, stdin=case(n, m, a), expected=brute(n, m, a))

    def test_brute_m_larger_than_n(self):
        # Expected computed by the O(M N^2) brute force above.
        n, m, a = 5, 10, [9, 2, 7, 0, 9]
        run_case(self, stdin=case(n, m, a), expected=brute(n, m, a))

    def test_brute_descending_with_duplicates(self):
        # Expected computed by the O(M N^2) brute force above.
        n, m, a = 9, 4, [3, 3, 2, 2, 1, 1, 0, 0, 3]
        run_case(self, stdin=case(n, m, a), expected=brute(n, m, a))


if __name__ == "__main__":
    unittest.main()
