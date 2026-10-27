import random
import unittest

from sandbox.check import run_case


def grid_input(rows):
    return f"{len(rows)} {len(rows[0])}\n" + "\n".join(rows) + "\n"


def brute_all_flips(rows):
    # Exhaustive: flipping a line twice cancels and flips commute, so every
    # reachable grid is given by a subset of rows and a subset of columns.
    # Try all 2^(H+W) of them. Only for tiny grids.
    h, w = len(rows), len(rows[0])
    best = None
    for rmask in range(1 << h):
        for cmask in range(1 << w):
            total = 0
            for i in range(h):
                for j in range(w):
                    total += int(rows[i][j]) ^ (rmask >> i & 1) ^ (cmask >> j & 1)
            best = total if best is None else min(best, total)
    return best


def brute_column_masks(rows):
    # Fix the subset of flipped columns (all 2^W of them); then each row is
    # independent and is flipped iff that lowers its count, so it costs
    # min(ones, W - ones).
    w = len(rows[0])
    vals = [int(r[::-1], 2) for r in rows]
    best = None
    for cmask in range(1 << w):
        total = 0
        for v in vals:
            ones = bin(v ^ cmask).count("1")
            total += min(ones, w - ones)
        best = total if best is None else min(best, total)
    return best


class TestFlipRowOrCol(unittest.TestCase):
    # The statement gives no samples; every expected value below is derived
    # by hand or by one of the brute forces above.

    def test_single_cell_zero(self):
        run_case(self, stdin="1 1\n0\n", expected="0")

    def test_single_cell_one(self):
        # Flip the only row.
        run_case(self, stdin="1 1\n1\n", expected="0")

    def test_single_row_max_width(self):
        # H = 1: flip every column holding a 1.
        run_case(self, stdin="1 18\n101101110010110101\n", expected="0")

    def test_single_column(self):
        # W = 1: flip every row holding a 1.
        run_case(self, stdin="4 1\n1\n0\n1\n1\n", expected="0")

    def test_two_by_two_odd_parity(self):
        # Every flip changes exactly 2 cells of a 2x2 grid, so the parity of
        # the sum (1) is invariant; 1 is the minimum and is already reached.
        run_case(self, stdin="2 2\n10\n00\n", expected="1")

    def test_two_by_two_checkerboard(self):
        # Flip column 1: 10/01 -> 00/11, then flip row 2 -> all zeros.
        run_case(self, stdin="2 2\n10\n01\n", expected="0")

    def test_three_by_three_brute(self):
        rows = ["100", "010", "110"]
        expected = brute_all_flips(rows)  # 2
        run_case(self, stdin=grid_input(rows), expected=str(expected))

    def test_all_ones(self):
        # Flip every row.
        run_case(self, stdin="3 4\n1111\n1111\n1111\n", expected="0")

    def test_identity_three(self):
        rows = ["100", "010", "001"]
        expected = brute_all_flips(rows)
        run_case(self, stdin=grid_input(rows), expected=str(expected))

    def test_ten_by_five_brute(self):
        rows = ["10000", "00111", "11000", "01000", "10110",
                "01110", "10101", "00100", "01001", "00110"]
        expected = brute_column_masks(rows)  # 12
        run_case(self, stdin=grid_input(rows), expected=str(expected))

    def test_small_random_grids_brute(self):
        # Exhaustive brute force over all row and column flips.
        rng = random.Random(396)
        for _ in range(5):
            h, w = rng.randint(1, 4), rng.randint(1, 4)
            rows = ["".join(rng.choice("01") for _ in range(w)) for _ in range(h)]
            run_case(self, stdin=grid_input(rows), expected=str(brute_all_flips(rows)))

    def test_medium_random_brute(self):
        rng = random.Random(18)
        rows = ["".join(rng.choice("01") for _ in range(10)) for _ in range(60)]
        expected = brute_column_masks(rows)
        run_case(self, stdin=grid_input(rows), expected=str(expected))

    def test_max_size_all_zero(self):
        rows = ["0" * 18] * 200000
        run_case(self, stdin=grid_input(rows), expected="0")

    def test_max_size_row_and_complement(self):
        # Every row is s or its complement: flip the complement rows, then
        # the columns where s has a 1.
        s = "110100111000101101"
        t = "".join("1" if c == "0" else "0" for c in s)
        rows = [s if i % 3 else t for i in range(200000)]
        run_case(self, stdin=grid_input(rows), expected="0")

    def test_max_size_unit_rows(self):
        # Row i has a single 1 at column i mod 18. A row costs 0 only when
        # the column flip set c equals its unit vector or the complement;
        # otherwise it costs >= 1. If c is e_j or ~e_j, rows of class j cost
        # 0 but every other row has 2 (or 16) ones and costs 2, giving
        # 2 * (H - 11112) > H. So the best is c = {} with cost H = 200000.
        h, w = 200000, 18
        rows = []
        for i in range(h):
            k = i % w
            rows.append("0" * k + "1" + "0" * (w - 1 - k))
        run_case(self, stdin=grid_input(rows), expected="200000")

    def test_max_height_width_two(self):
        # Rows are "00" (120000) or "01" (80000). Column flips {} or {1,2}
        # leave every "01" row at cost 1 and "00" at 0: 80000. Flips {1} or
        # {2} make every "00" row cost 1 instead: 120000. Answer 80000.
        rows = ["01" if i % 5 < 2 else "00" for i in range(200000)]
        run_case(self, stdin=grid_input(rows), expected="80000")


if __name__ == "__main__":
    unittest.main()
