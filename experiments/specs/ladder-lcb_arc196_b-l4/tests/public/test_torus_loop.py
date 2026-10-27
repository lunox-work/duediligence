# spec.md gives only the input/output format of "Torus Loop" (AtCoder
# ARC196 B). The cases below use that problem's definition: each cell
# holds tile A (an arc joining the midpoints of two adjacent edges) or
# tile B (a segment joining the midpoints of two opposite edges); each
# tile may be rotated; count the resulting placements on the H x W torus
# in which every line end meets a line end of the neighbouring tile.
# Placements are counted as distinct pictures (A: 4 shapes, B: 2).
#
# Expected values not quoted from the statement were computed with an
# exhaustive search over every shape of every cell on the tiny grid, or
# follow from the closed forms noted at each case, which that search
# confirmed on small grids. Grid sizes are kept at H, W >= 2 and far
# below the problem's limit on the total of H * W.
import unittest

from sandbox.check import run_case

MOD = 998244353


def grid(h, w, ch):
    return f"{h} {w}\n" + "\n".join(ch * w for _ in range(h))


class TestTorusLoop(unittest.TestCase):
    # Sample 1, first case.
    def test_sample_case_1(self):
        run_case(self, stdin="1\n3 3\nAAB\nAAB\nBBB\n", expected="2\n")

    # Sample 1, second case.
    def test_sample_case_2(self):
        run_case(self, stdin="1\n3 3\nBBA\nABA\nAAB\n", expected="0\n")

    # Smallest grid, all A: exhaustive search over 4^4 pictures gives 16.
    def test_smallest_all_a(self):
        run_case(self, stdin="1\n2 2\nAA\nAA\n", expected="16\n")

    # Smallest grid, all B: all horizontal or all vertical, 2 (exhaustive).
    def test_smallest_all_b(self):
        run_case(self, stdin="1\n2 2\nBB\nBB\n", expected="2\n")

    # Smallest grid with no valid placement: exhaustive search gives 0.
    def test_smallest_impossible(self):
        run_case(self, stdin="1\n2 2\nAB\nBA\n", expected="0\n")

    # A row with an odd number of A tiles cannot close up: 0 (exhaustive).
    def test_odd_a_in_row(self):
        run_case(self, stdin="1\n2 3\nAAA\nAAA\n", expected="0\n")

    # Mixed grid: exhaustive search over 4^4 * 2^2 pictures gives 8.
    def test_mixed_two_by_three(self):
        run_case(self, stdin="1\n2 3\nAAB\nAAB\n", expected="8\n")

    # All A, 2 x 4: exhaustive search gives 64 = 2^(H+W).
    def test_all_a_two_by_four(self):
        run_case(self, stdin="1\n2 4\nAAAA\nAAAA\n", expected="64\n")

    # Several cases in one input, answered in order, one per line;
    # the values are the ones established above.
    def test_multiple_cases(self):
        stdin = "3\n2 2\nAA\nAA\n2 2\nAB\nBA\n2 2\nBB\nBB\n"
        run_case(self, stdin=stdin, expected="16\n0\n2\n")

    # All B, larger grid: a horizontal B forces its whole row horizontal,
    # a vertical B its whole column vertical, and a row and a column
    # always cross, so only all-horizontal and all-vertical remain: 2.
    def test_large_all_b(self):
        run_case(self, stdin="1\n" + grid(300, 300, "B") + "\n", expected="2\n")

    # All A with H, W even: each row independently picks which of each
    # cell pair shares a vertical edge (2 ways), each column likewise for
    # horizontal edges, and each A shape is fixed by those choices, so the
    # count is 2^(H+W) (matches the search for 2x2, 2x4, 4x2). Exercises
    # the modulus.
    def test_large_all_a_modulo(self):
        expected = str(pow(2, 200 + 200, MOD))
        run_case(self, stdin="1\n" + grid(200, 200, "A") + "\n", expected=expected + "\n")


if __name__ == "__main__":
    unittest.main()
