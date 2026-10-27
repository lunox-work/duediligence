import unittest

from sandbox.check import run_case


def brute_force(rows):
    """Minimum sum over every subset of row flips and every subset of
    column flips. Flips commute and flipping a line twice undoes it, so
    these subsets cover every reachable grid. Only for tiny grids."""
    h, w = len(rows), len(rows[0])
    best = h * w
    for row_mask in range(1 << h):
        for col_mask in range(1 << w):
            total = 0
            for i in range(h):
                for j in range(w):
                    total += int(rows[i][j]) ^ (row_mask >> i & 1) ^ (col_mask >> j & 1)
            best = min(best, total)
    return best


def grid_input(rows):
    return f"{len(rows)} {len(rows[0])}\n" + "\n".join(rows) + "\n"


class TestFlipRowOrCol(unittest.TestCase):
    # The statement gives no samples; every case below is derived by hand
    # or by brute_force above.

    def test_single_cell_zero(self):
        # Already all zeros; the sum cannot go below 0.
        run_case(self, stdin="1 1\n0\n", expected="0")

    def test_single_cell_one(self):
        # One Operation X on row 1 turns the only 1 into 0.
        run_case(self, stdin="1 1\n1\n", expected="0")

    def test_all_zeros(self):
        # Already all zeros; the sum cannot go below 0.
        run_case(self, stdin="2 4\n0000\n0000\n", expected="0")

    def test_all_ones(self):
        # Flipping every row (Operation X on 1..3) clears the grid.
        run_case(self, stdin="3 4\n1111\n1111\n1111\n", expected="0")

    def test_single_row(self):
        # With H = 1, Operation Y on each column holding a 1 clears it.
        run_case(self, stdin="1 5\n10101\n", expected="0")

    def test_single_column(self):
        # With W = 1, Operation X on each row holding a 1 clears it.
        run_case(self, stdin="3 1\n1\n0\n1\n", expected="0")

    def test_checkerboard_2x2(self):
        # Flip row 2 -> 10/10, then flip column 1 -> 00/00.
        run_case(self, stdin="2 2\n10\n01\n", expected="0")

    def test_lone_one_2x2(self):
        # Every operation flips exactly two of the four cells, so the
        # parity of the sum stays odd: at least 1, and 1 is the start.
        run_case(self, stdin="2 2\n10\n00\n", expected="1")

    def test_3x3_mixed(self):
        rows = ["100", "010", "110"]
        # brute_force(rows) == 2
        run_case(self, stdin=grid_input(rows), expected=str(brute_force(rows)))

    def test_3x3_identity(self):
        rows = ["100", "010", "001"]
        # brute_force(rows) == 2
        run_case(self, stdin=grid_input(rows), expected=str(brute_force(rows)))

    def test_4x4_identity(self):
        rows = ["1000", "0100", "0010", "0001"]
        # brute_force(rows) == 4
        run_case(self, stdin=grid_input(rows), expected=str(brute_force(rows)))

    def test_10x5_mixed(self):
        rows = [
            "10000", "00111", "11000", "01000", "10110",
            "01110", "10101", "00100", "01001", "10001",
        ]
        # brute_force(rows) == 13 (2^15 flip combinations)
        run_case(self, stdin=grid_input(rows), expected=str(brute_force(rows)))


if __name__ == "__main__":
    unittest.main()
