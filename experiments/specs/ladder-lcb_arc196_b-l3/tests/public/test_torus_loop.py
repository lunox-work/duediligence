# Public tests for "Torus Loop".
#
# spec.md does not name the tile letters, give the constraints, or include
# samples. Everything below follows the original problem (AtCoder ARC196 B):
#   'A' = the tile joining two adjacent edges (4 distinct rotations),
#   'B' = the tile joining two opposite edges (2 distinct rotations),
#   1 <= T, 2 <= H, W, sum of H*W <= 10^6.
# The sample was checked against an exhaustive brute force over every
# rotation of every cell under this reading, and it gives 2 / 0 / 2.
import unittest

from sandbox.check import run_case

MOD = 998244353


def grid_case(rows):
    return f"{len(rows)} {len(rows[0])}\n" + "\n".join(rows) + "\n"


class TestTorusLoop(unittest.TestCase):
    def test_sample_1(self):
        run_case(
            self,
            stdin="3\n3 3\nAAB\nAAB\nBBB\n3 3\nBBA\nABA\nAAB\n3 4\nBAAB\nBABA\nBBAA\n",
            expected="2\n0\n2\n",
        )

    # Smallest grids, 2x2. Expected values from brute force over all
    # 4^a * 2^b rotations.
    def test_smallest_all_a(self):
        # Every row and column of A's alternates edges: 2^(H+W) = 2^4 = 16.
        run_case(self, stdin="1\n" + grid_case(["AA", "AA"]), expected="16\n")

    def test_smallest_all_b(self):
        # All B: all horizontal or all vertical, so 2.
        run_case(self, stdin="1\n" + grid_case(["BB", "BB"]), expected="2\n")

    def test_smallest_single_b(self):
        # Brute force: 0.
        run_case(self, stdin="1\n" + grid_case(["AA", "AB"]), expected="0\n")

    def test_smallest_checkerboard(self):
        # Brute force: 0.
        run_case(self, stdin="1\n" + grid_case(["AB", "BA"]), expected="0\n")

    def test_smallest_b_row(self):
        # Brute force: 0.
        run_case(self, stdin="1\n" + grid_case(["AA", "BB"]), expected="0\n")

    # Small odd dimensions, brute force.
    def test_all_a_odd_width(self):
        # Odd W means a row of A's cannot alternate around the wrap: 0.
        run_case(self, stdin="1\n" + grid_case(["AAA", "AAA"]), expected="0\n")

    def test_all_a_odd_height(self):
        run_case(self, stdin="1\n" + grid_case(["AA", "AA", "AA"]), expected="0\n")

    def test_b_column_2x3(self):
        # Brute force: 8.
        run_case(self, stdin="1\n" + grid_case(["AAB", "AAB"]), expected="8\n")

    def test_b_row_3x2(self):
        # Brute force: 8.
        run_case(self, stdin="1\n" + grid_case(["AA", "BB", "AA"]), expected="8\n")

    def test_all_a_2x4(self):
        # 2^(2+4) = 64, confirmed by brute force.
        run_case(self, stdin="1\n" + grid_case(["AAAA", "AAAA"]), expected="64\n")

    def test_all_b_3x3(self):
        run_case(self, stdin="1\n" + grid_case(["BBB", "BBB", "BBB"]), expected="2\n")

    def test_several_cases_in_one_input(self):
        # Answers from the single-case tests above, in order.
        stdin = "4\n" + grid_case(["AA", "AA"]) + grid_case(["AB", "BA"]) \
            + grid_case(["AAB", "AAB"]) + grid_case(["BB", "BB"])
        run_case(self, stdin=stdin, expected="16\n0\n8\n2\n")

    # Large grids, answers known in closed form.
    def test_large_all_b(self):
        # A horizontal B forces its whole row horizontal, and a vertical B
        # forces its whole column vertical, so the only placements are all
        # horizontal or all vertical: 2.
        rows = ["B" * 400] * 400
        run_case(self, stdin="1\n" + grid_case(rows), expected="2\n")

    def test_large_all_a_even(self):
        # In an all-A grid each cell touches exactly one horizontal edge and
        # one vertical edge, and those two choices fix its rotation. Each row's
        # horizontal edges must alternate (2 ways when W is even), and the same
        # goes for each column. So 2^(H+W) = 2^800, reduced mod 998244353.
        rows = ["A" * 400] * 400
        run_case(self, stdin="1\n" + grid_case(rows), expected=f"{pow(2, 800, MOD)}\n")

    def test_large_all_a_odd_width(self):
        # Same argument with W odd: no row can alternate, so 0.
        rows = ["A" * 399] * 400
        run_case(self, stdin="1\n" + grid_case(rows), expected="0\n")


if __name__ == "__main__":
    unittest.main()
