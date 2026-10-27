import unittest
from itertools import product

from sandbox.check import run_case


def brute(rows):
    # Obviously correct for tiny grids: each row and each column is flipped
    # an even or odd number of times, so try every subset of rows and columns.
    h, w = len(rows), len(rows[0])
    best = None
    for rf in product((0, 1), repeat=h):
        for cf in product((0, 1), repeat=w):
            total = sum(int(rows[i][j]) ^ rf[i] ^ cf[j] for i in range(h) for j in range(w))
            if best is None or total < best:
                best = total
    return best


def make_input(rows):
    return f"{len(rows)} {len(rows[0])}\n" + "\n".join(rows) + "\n"


class TestFlipRowOrCol(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="3 3\n100\n010\n110\n", expected="2")

    def test_sample_2(self):
        run_case(self, stdin="3 4\n1111\n1111\n1111\n", expected="0")

    def test_sample_3(self):
        run_case(
            self,
            stdin="10 5\n10000\n00111\n11000\n01000\n10110\n01110\n10101\n00100\n00100\n10001\n",
            expected="13",
        )

    def test_single_cell_zero(self):
        run_case(self, stdin="1 1\n0\n", expected="0")

    def test_single_cell_one(self):
        # Flip the only row.
        run_case(self, stdin="1 1\n1\n", expected="0")

    def test_single_row_max_width(self):
        # With one row, flipping each column holding a 1 clears it.
        run_case(self, stdin="1 18\n101101011100101011\n", expected="0")

    def test_2x2_odd_parity(self):
        # With W = H = 2 every flip changes the sum by an even amount, so an
        # odd sum stays odd and 1 is the best; brute force agrees.
        rows = ["10", "00"]
        self.assertEqual(brute(rows), 1)
        run_case(self, stdin=make_input(rows), expected="1")

    def test_brute_force_3x4(self):
        # Expected value computed by exhaustive brute force over all flips.
        rows = ["1010", "0110", "1101"]
        run_case(self, stdin=make_input(rows), expected=str(brute(rows)))

    def test_brute_force_4x4(self):
        # Expected value computed by exhaustive brute force over all flips.
        rows = ["1000", "0100", "0010", "0001"]
        run_case(self, stdin=make_input(rows), expected=str(brute(rows)))

    def test_brute_force_5x3(self):
        # Expected value computed by exhaustive brute force over all flips.
        rows = ["100", "010", "001", "111", "011"]
        run_case(self, stdin=make_input(rows), expected=str(brute(rows)))

    def test_brute_force_4x5(self):
        # Expected value computed by exhaustive brute force over all flips.
        rows = ["11010", "00111", "10001", "01100"]
        run_case(self, stdin=make_input(rows), expected=str(brute(rows)))

    def test_max_height_width_one(self):
        # W = 1: each row is one cell, so flip every row holding a 1.
        rows = ["1" if i % 3 else "0" for i in range(200000)]
        run_case(self, stdin=make_input(rows), expected="0")

    def test_max_all_ones(self):
        # Flip every row (or every column).
        rows = ["1" * 18] * 200000
        run_case(self, stdin=make_input(rows), expected="0")

    def test_max_checkerboard(self):
        # Flipping every odd-indexed column turns each row into all 0s or
        # all 1s; then flip the all-1 rows.
        rows = [("01" * 9) if i % 2 else ("10" * 9) for i in range(200000)]
        run_case(self, stdin=make_input(rows), expected="0")

    def test_max_one_odd_row(self):
        # 199999 zero rows and one row with nine 1s. Without column flips the
        # odd row costs min(9, 9) = 9 and the rest 0. Any nonempty set of
        # column flips leaves every zero row with k ones, 1 <= k <= 17, so each
        # costs at least 1, totalling at least 199999 > 9. Answer: 9.
        rows = ["0" * 18] * 199999 + ["111111111000000000"]
        run_case(self, stdin=make_input(rows), expected="9")


if __name__ == "__main__":
    unittest.main()
