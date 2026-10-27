# The statement accepts any valid pair, but run_case compares output
# exactly, so every case here has either no solution (-1) or exactly one
# pair. Uniqueness of the non-sample answers was checked by enumerating
# d = x - y over all d with d^3 < N (x^3 - y^3 = d(3y^2 + 3yd + d^2) > d^3)
# and solving the quadratic in y for each divisor d of N.
import unittest

from sandbox.check import run_case


class TestCubes(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="397\n", expected="12 11")

    def test_sample_2(self):
        run_case(self, stdin="1\n", expected="-1")

    def test_sample_3(self):
        run_case(self, stdin="39977273855577088\n", expected="342756 66212")

    def test_small_no_solution(self):
        # Smallest difference of positive cubes is 2^3 - 1^3 = 7.
        run_case(self, stdin="6\n", expected="-1")

    def test_smallest_solvable(self):
        # 2^3 - 1^3 = 7; only pair since d = 1 forces 3y^2 + 3y + 1 = 7.
        run_case(self, stdin="7\n", expected="2 1")

    def test_perfect_cube_needs_positive_y(self):
        # 8 = 2^3 - 0^3, but y must be positive; d = 1 gives 3y^2+3y+1 = 8
        # with no integer root, and d >= 2 needs d^3 < 8.
        run_case(self, stdin="8\n", expected="-1")

    def test_non_consecutive_pair(self):
        # 3^3 - 1^3 = 26; unique by the enumeration above.
        run_case(self, stdin="26\n", expected="3 1")

    def test_max_n_is_cube(self):
        # N = 10^18 = (10^6)^3 - 0^3; no pair with positive y exists
        # (enumeration above).
        run_case(self, stdin="1000000000000000000\n", expected="-1")

    def test_max_n_minus_one(self):
        # 10^18 - 1 = (10^6)^3 - 1^3; unique by the enumeration above.
        run_case(self, stdin="999999999999999999\n", expected="1000000 1")

    def test_largest_consecutive_cubes(self):
        # y = 577350268 is the largest y with 3y^2 + 3y + 1 <= 10^18;
        # N = (y+1)^3 - y^3 = 999999997611066277, unique by enumeration.
        run_case(self, stdin="999999997611066277\n", expected="577350269 577350268")

    def test_consecutive_near_million(self):
        # 1000000^3 - 999999^3 = 3*999999^2 + 3*999999 + 1 = 2999997000001;
        # unique by the enumeration above.
        run_case(self, stdin="2999997000001\n", expected="1000000 999999")


if __name__ == "__main__":
    unittest.main()
