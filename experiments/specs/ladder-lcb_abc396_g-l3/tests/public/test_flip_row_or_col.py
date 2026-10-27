import itertools
import unittest

from sandbox.check import run_case


def brute_force(rows):
    """Minimum number of 1s over every choice of which rows and which
    columns to flip. Flipping a line twice undoes it and flips commute, so
    every reachable grid is one row subset plus one column subset; trying
    all 2^(H+W) of them is exhaustive."""
    h, w = len(rows), len(rows[0])
    grid = [[int(c) for c in row] for row in rows]
    best = h * w
    for rflip in itertools.product((0, 1), repeat=h):
        for cflip in itertools.product((0, 1), repeat=w):
            ones = sum(grid[i][j] ^ rflip[i] ^ cflip[j] for i in range(h) for j in range(w))
            best = min(best, ones)
    return best


def stdin_for(rows):
    return f"{len(rows)} {len(rows[0])}\n" + "\n".join(rows) + "\n"


class TestFlipRowOrCol(unittest.TestCase):
    # Hand-derived: a 1x1 grid holding 0 already has no 1s.
    def test_single_cell_zero(self):
        run_case(self, stdin="1 1\n0\n", expected="0")

    # Hand-derived: flipping the only row turns the single 1 into 0.
    def test_single_cell_one(self):
        run_case(self, stdin="1 1\n1\n", expected="0")

    # Hand-derived: with one row, each column is a single cell and can be
    # flipped on its own, so every 1 can be cleared.
    def test_single_row_mixed(self):
        run_case(self, stdin="1 5\n10110\n", expected="0")

    # Hand-derived: with one column, each row is a single cell, so every 1
    # can be cleared.
    def test_single_column_mixed(self):
        run_case(self, stdin="4 1\n1\n0\n1\n1\n", expected="0")

    # Hand-derived: a wide single row of all 1s; flip the row.
    def test_single_row_all_ones_wide(self):
        run_case(self, stdin="1 18\n111111111111111111\n", expected="0")

    # Hand-derived: an all-zero grid needs no flips.
    def test_all_zeros(self):
        run_case(self, stdin="3 4\n0000\n0000\n0000\n", expected="0")

    # Hand-derived: an all-ones grid; flip every row.
    def test_all_ones(self):
        run_case(self, stdin="3 4\n1111\n1111\n1111\n", expected="0")

    # Hand-derived: a checkerboard is A[i][j] = i xor j, so flipping the
    # odd rows and odd columns clears it.
    def test_checkerboard(self):
        run_case(self, stdin="4 4\n1010\n0101\n1010\n0101\n", expected="0")

    # Hand-derived: every flip changes exactly two cells of a 2x2 grid, so
    # the parity of the number of 1s is invariant. One 1 is odd, so at
    # least one 1 always remains, and the grid already has exactly one.
    def test_two_by_two_single_one(self):
        run_case(self, stdin="2 2\n10\n00\n", expected="1")

    # Hand-derived: same parity argument; three 1s is odd, and flipping the
    # first row of 11/10 gives 00/10 with one 1.
    def test_two_by_two_three_ones(self):
        run_case(self, stdin="2 2\n11\n10\n", expected="1")

    # Expected value computed by brute_force above (exhaustive over all
    # row/column flip subsets).
    def test_three_by_three_brute(self):
        rows = ["100", "010", "110"]
        run_case(self, stdin=stdin_for(rows), expected=str(brute_force(rows)))

    # Expected value computed by brute_force above.
    def test_identity_three_by_three_brute(self):
        rows = ["100", "010", "001"]
        run_case(self, stdin=stdin_for(rows), expected=str(brute_force(rows)))

    # Expected value computed by brute_force above.
    def test_four_by_five_brute(self):
        rows = ["10110", "01101", "11000", "00111"]
        run_case(self, stdin=stdin_for(rows), expected=str(brute_force(rows)))

    # Expected value computed by brute_force above; tall grid.
    def test_six_by_three_brute(self):
        rows = ["101", "011", "000", "110", "100", "111"]
        run_case(self, stdin=stdin_for(rows), expected=str(brute_force(rows)))

    # Expected value computed by brute_force above; wide grid.
    def test_three_by_seven_brute(self):
        rows = ["1001011", "0110100", "1110001"]
        run_case(self, stdin=stdin_for(rows), expected=str(brute_force(rows)))

    # Expected value computed by brute_force above.
    def test_five_by_five_identity_brute(self):
        rows = ["10000", "01000", "00100", "00010", "00001"]
        run_case(self, stdin=stdin_for(rows), expected=str(brute_force(rows)))


if __name__ == "__main__":
    unittest.main()
