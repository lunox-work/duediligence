# spec.md gives only the title and input format. These cases take the problem
# to be AtCoder ABC396 G "Flip Row or Col": A is an H x W grid of 0/1; any
# number of times, flip every cell of one row or of one column; print the
# minimum possible sum of A. Constraints: 1 <= H <= 2*10^5, 1 <= W <= 18.
# The three samples were checked against a brute force over all column-flip
# masks (each row then independently takes min(ones, W - ones)).
import unittest

from sandbox.check import run_case


class TestFlipRowOrCol(unittest.TestCase):
    def test_sample_1(self):
        run_case(self, stdin="3 3\n100\n010\n110\n", expected="2")

    def test_sample_2(self):
        run_case(self, stdin="3 4\n1111\n1111\n1111\n", expected="0")

    def test_sample_3(self):
        run_case(
            self,
            stdin="10 5\n10000\n00111\n11000\n01000\n10110\n"
            "01110\n10101\n00100\n01100\n01110\n",
            expected="13",
        )

    def test_smallest_zero(self):
        # 1x1 grid that is already 0.
        run_case(self, stdin="1 1\n0\n", expected="0")

    def test_smallest_one(self):
        # 1x1 grid: flipping the only row makes it 0.
        run_case(self, stdin="1 1\n1\n", expected="0")

    def test_single_row_max_width(self):
        # H = 1: flip every column that holds a 1, so the answer is 0.
        run_case(self, stdin="1 18\n101101110010111001\n", expected="0")

    def test_single_column(self):
        # W = 1: flip every row that holds a 1, so the answer is 0.
        run_case(self, stdin="4 1\n1\n0\n1\n1\n", expected="0")

    def test_two_rows_max_width_half_differ(self):
        # Two rows differ in d = 9 of 18 columns. Column flips keep each
        # column's "same/different" state; a row flip toggles every column's
        # state. So 9 columns always differ and each adds at least 1;
        # flipping columns to zero row 1 reaches exactly 9.
        run_case(
            self,
            stdin="2 18\n000000000000000000\n111111111000000000\n",
            expected="9",
        )

    def test_two_rows_max_width_complementary(self):
        # Row 2 is row 1's complement: flip row 2 and both rows are all 1s,
        # then flip all columns, which leaves 0.
        run_case(
            self,
            stdin="2 18\n111111111111111111\n000000000000000000\n",
            expected="0",
        )

    def test_three_rows_max_width(self):
        # Rows 1 and 2 are complements, so flipping row 2 makes it equal row 1.
        # Rows 1 and 3 differ in 9 of 18 columns, so (same argument as above)
        # at least 9 is unavoidable; zeroing row 1 by column flips gives 9.
        # The brute force over all 2^18 column masks also gives 9.
        run_case(
            self,
            stdin="3 18\n010101010101010101\n101010101010101010\n"
            "000000000000000000\n",
            expected="9",
        )

    def test_max_height_max_width_all_ones(self):
        # H = 2*10^5, W = 18, every cell 1: flip every row, which gives 0.
        h, w = 200000, 18
        stdin = f"{h} {w}\n" + ("1" * w + "\n") * h
        run_case(self, stdin=stdin, expected="0")


if __name__ == "__main__":
    unittest.main()
