import itertools
import unittest

from sandbox.check import run_case

MOD = 998244353

# Each tile's possible line segments, as the set of edge midpoints it touches
# (U = top, R = right, D = bottom, L = left). Type A joins two adjacent edges
# (4 rotations), type B joins two opposite edges (2 rotations).
ORIENT = {"A": ["UR", "RD", "DL", "LU"], "B": ["UD", "LR"]}


def brute(grid):
    """Try every rotation of every tile and count the placements meeting the
    statement's two torus conditions for every cell. Only for tiny grids."""
    h, w = len(grid), len(grid[0])
    cells = [ORIENT[c] for row in grid for c in row]
    total = 0
    for pick in itertools.product(*cells):
        t = [pick[i * w:(i + 1) * w] for i in range(h)]
        if all(("R" in t[i][j]) == ("L" in t[i][(j + 1) % w])
               and ("D" in t[i][j]) == ("U" in t[(i + 1) % h][j])
               for i in range(h) for j in range(w)):
            total += 1
    return total % MOD


def case_text(grid):
    return f"{len(grid)} {len(grid[0])}\n" + "\n".join(grid) + "\n"


def stdin_for(grids):
    return f"{len(grids)}\n" + "".join(case_text(g) for g in grids)


# Closed forms used for the large cases:
#
# All B: a B tile is either horizontal (L,R) or vertical (U,D). The row
# condition forces horizontal(i,j) <=> horizontal(i,j+1), so each row is
# uniform; the column condition forces vertical(i,j) <=> vertical(i+1,j), so
# each column is uniform. Hence the whole grid is all horizontal or all
# vertical, both valid: the answer is 2 for every H, W.
#
# All A: every A tile touches exactly one of L/R and exactly one of U/D, and
# the 4 rotations are exactly the 4 combinations. In a row, let x_j say whether
# the segment crosses the boundary left of column j; each cell uses exactly one
# of x_j, x_{j+1}, so x alternates around the cycle: W must be even, then 2
# choices per row. Likewise H must be even, then 2 choices per column. The
# choices fix every tile, so the answer is 2^(H+W) if H and W are both even,
# else 0. (Agrees with brute(): 2x2 -> 16, 2x4 -> 64, 2x3 -> 0.)


def all_a(h, w):
    return pow(2, h + w, MOD) if h % 2 == 0 and w % 2 == 0 else 0


class TestTorusLoop(unittest.TestCase):
    # The statement as given contains no sample input/output, so every case
    # below is computed by brute() or by the closed forms above.

    def check(self, grids, expected=None):
        if expected is None:
            expected = [brute(g) for g in grids]
        run_case(self, stdin=stdin_for(grids),
                 expected="\n".join(str(v) for v in expected) + "\n")

    # Smallest grids, H = W = 2 (brute force).
    def test_2x2_all_a(self):
        self.check([["AA", "AA"]])  # 16

    def test_2x2_all_b(self):
        self.check([["BB", "BB"]])  # 2

    def test_2x2_diagonal_mix(self):
        self.check([["AB", "BA"]])  # 0

    def test_2x2_column_mix(self):
        self.check([["AB", "AB"]])  # 0

    def test_2x2_single_b(self):
        self.check([["AA", "AB"]])  # 0

    def test_2x2_row_of_b(self):
        self.check([["AA", "BB"]])  # 0

    # Odd dimension (brute force).
    def test_2x3_all_a(self):
        self.check([["AAA", "AAA"]])  # 0

    def test_2x3_column_of_b(self):
        self.check([["AAB", "AAB"]])  # 8

    def test_3x2_row_of_b(self):
        self.check([["AA", "BB", "AA"]])  # 8

    def test_2x4_all_a(self):
        self.check([["AAAA", "AAAA"]])  # 64

    def test_2x4_mixed(self):
        self.check([["ABBA", "ABBA"]])  # 8

    def test_2x4_mixed_zero(self):
        self.check([["AAAA", "ABBA"]])  # 0

    def test_3x3_mixed_two(self):
        self.check([["AAB", "AAB", "BBB"]])  # 2

    def test_3x3_mixed_zero(self):
        self.check([["BBA", "ABA", "AAB"]])  # 0

    def test_3x4_mixed(self):
        self.check([["BAAB", "BABA", "BBAA"]])  # 2

    # Several test cases in one input, each answered on its own line.
    def test_multiple_cases(self):
        self.check([
            ["AAB", "AAB", "BBB"],
            ["BBA", "ABA", "AAB"],
            ["BAAB", "BABA", "BBAA"],
            ["AA", "AA"],
            ["ABAB", "ABAB"],
        ])

    # Largest inputs: HW = 10^6 in a single case (closed forms).
    def test_large_all_b_square(self):
        self.check([["B" * 1000] * 1000], [2])

    def test_large_all_b_wide(self):
        self.check([["B" * 500000] * 2], [2])

    def test_large_all_b_tall(self):
        self.check([["BB"] * 500000], [2])

    def test_large_all_a_square(self):
        self.check([["A" * 1000] * 1000], [all_a(1000, 1000)])

    def test_large_all_a_wide(self):
        # 2^500002 mod 998244353
        self.check([["A" * 500000] * 2], [all_a(2, 500000)])

    def test_large_all_a_odd_width(self):
        self.check([["A" * 499999] * 2], [0])

    # Largest T: 10^5 cases of 2x2 (sum HW = 4 * 10^5), alternating all-A and
    # all-B, whose answers 16 and 2 are checked by brute() above.
    def test_max_t(self):
        grids = [["AA", "AA"] if k % 2 == 0 else ["BB", "BB"]
                 for k in range(100000)]
        self.check(grids, [16 if k % 2 == 0 else 2 for k in range(100000)])


if __name__ == "__main__":
    unittest.main()
