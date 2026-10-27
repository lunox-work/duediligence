import itertools
import unittest

from sandbox.check import run_case

MOD = 998244353

# Tile edges: 0 top, 1 right, 2 bottom, 3 left. Every rotation of each tile,
# as the pair of edge midpoints its segment joins.
ROT_A = [(0, 1), (1, 2), (2, 3), (3, 0)]
ROT_B = [(0, 2), (1, 3)]


def brute(grid):
    """Count placements by trying all 4^a * 2^b rotations and checking the
    two torus conditions of the statement literally. Only for tiny grids."""
    h, w = len(grid), len(grid[0])
    cells = [(i, j) for i in range(h) for j in range(w)]
    options = [ROT_A if grid[i][j] == "A" else ROT_B for i, j in cells]
    count = 0
    for choice in itertools.product(*options):
        seg = dict(zip(cells, choice))
        if all(
            (1 in seg[(i, j)]) == (3 in seg[(i, (j + 1) % w)])
            and (2 in seg[(i, j)]) == (0 in seg[((i + 1) % h, j)])
            for i, j in cells
        ):
            count += 1
    return count % MOD


def case_text(grid):
    return f"{len(grid)} {len(grid[0])}\n" + "\n".join(grid) + "\n"


def all_grids(h, w):
    for bits in itertools.product("AB", repeat=h * w):
        yield ["".join(bits[r * w:(r + 1) * w]) for r in range(h)]


class TestTorusLoop(unittest.TestCase):
    def test_sample_1(self):
        run_case(
            self,
            stdin="3\n3 3\nAAB\nAAB\nBBB\n3 3\nBBA\nABA\nAAB\n3 4\nBAAB\nBABA\nBBAA\n",
            expected="2\n0\n2\n",
        )

    def test_smallest_all_b(self):
        # Brute force (= 2: every tile horizontal, or every tile vertical).
        grid = ["BB", "BB"]
        self.assertEqual(brute(grid), 2)
        run_case(self, stdin="1\n" + case_text(grid), expected="2\n")

    def test_smallest_all_a(self):
        # Brute force (= 16).
        grid = ["AA", "AA"]
        self.assertEqual(brute(grid), 16)
        run_case(self, stdin="1\n" + case_text(grid), expected="16\n")

    def test_smallest_odd_width_all_a(self):
        # Brute force (= 0): each A tile uses exactly one of its left/right
        # edges, so the use alternates around a row, impossible on odd W.
        grid = ["AAA", "AAA"]
        self.assertEqual(brute(grid), 0)
        run_case(self, stdin="1\n" + case_text(grid), expected="0\n")

    def test_every_2x2_grid(self):
        # All 16 grids of size 2x2 in one input; answers by brute force.
        grids = list(all_grids(2, 2))
        stdin = f"{len(grids)}\n" + "".join(case_text(g) for g in grids)
        expected = "".join(f"{brute(g)}\n" for g in grids)
        run_case(self, stdin=stdin, expected=expected)

    def test_every_2x3_grid(self):
        # All 64 grids of size 2x3 in one input; answers by brute force.
        grids = list(all_grids(2, 3))
        stdin = f"{len(grids)}\n" + "".join(case_text(g) for g in grids)
        expected = "".join(f"{brute(g)}\n" for g in grids)
        run_case(self, stdin=stdin, expected=expected)

    def test_every_3x2_grid(self):
        # All 64 grids of size 3x2 in one input; answers by brute force.
        grids = list(all_grids(3, 2))
        stdin = f"{len(grids)}\n" + "".join(case_text(g) for g in grids)
        expected = "".join(f"{brute(g)}\n" for g in grids)
        run_case(self, stdin=stdin, expected=expected)

    def test_max_t_small_grids(self):
        # T = 10^5 cases of 2x2 (sum HW = 4*10^5), alternating all-B and
        # all-A; answers 2 and 16 from the brute force checks above.
        a, b = case_text(["AA", "AA"]), case_text(["BB", "BB"])
        t = 100000
        stdin = f"{t}\n" + "".join(b if k % 2 == 0 else a for k in range(t))
        expected = "".join("2\n" if k % 2 == 0 else "16\n" for k in range(t))
        run_case(self, stdin=stdin, expected=expected)

    # All-B grids of any size: a horizontal B tile forces its right
    # neighbour horizontal, so a row is all horizontal or has no
    # horizontal tile; likewise for vertical tiles and columns. A single
    # vertical tile then makes its column vertical, which puts a vertical
    # tile in every row, so every tile is vertical. Answer: exactly 2.

    def test_large_square_all_b(self):
        h = w = 1000
        stdin = f"1\n{h} {w}\n" + ("B" * w + "\n") * h
        run_case(self, stdin=stdin, expected="2\n")

    def test_large_wide_all_b(self):
        h, w = 2, 500000
        stdin = f"1\n{h} {w}\n" + ("B" * w + "\n") * h
        run_case(self, stdin=stdin, expected="2\n")

    def test_large_tall_all_b(self):
        h, w = 500000, 2
        stdin = f"1\n{h} {w}\n" + ("B" * w + "\n") * h
        run_case(self, stdin=stdin, expected="2\n")

    # All-A grids: an A tile is fixed by which of left/right and which of
    # top/bottom it uses. Its left/right use flips from tile to tile along a
    # row (so W must be even, then 2 choices per row), and its top/bottom
    # use flips down a column (H even, 2 choices per column), independently.
    # Answer: 2^(H+W) if H and W are both even, else 0. Matches the brute
    # force on 2x2 (16) and 2x3 (0).

    def test_large_square_all_a_needs_modulo(self):
        h = w = 1000
        stdin = f"1\n{h} {w}\n" + ("A" * w + "\n") * h
        run_case(self, stdin=stdin, expected=f"{pow(2, h + w, MOD)}\n")

    def test_large_odd_width_all_a(self):
        h, w = 2, 499999
        stdin = f"1\n{h} {w}\n" + ("A" * w + "\n") * h
        run_case(self, stdin=stdin, expected="0\n")


if __name__ == "__main__":
    unittest.main()
