import itertools
import unittest

from sandbox.check import run_case

MOD = 998244353

# The statement as given has no sample section and no constraints, so every
# case below is either derived by hand (argument in the comment) or computed
# here by exhaustive enumeration of all 4^a * 2^b placements of a tiny grid.
# Grids keep H, W >= 2.

# Endpoints of each rotation: T/R/D/L = top/right/bottom/left edge midpoint.
ROTATIONS = {
    "A": [("T", "R"), ("R", "D"), ("D", "L"), ("L", "T")],
    "B": [("L", "R"), ("T", "D")],
}


def brute(grid):
    """Count placements with no dead ends on the torus by trying every one."""
    h, w = len(grid), len(grid[0])
    choices = [ROTATIONS[grid[i][j]] for i in range(h) for j in range(w)]
    count = 0
    for p in itertools.product(*choices):
        if all(
            ("R" in p[i * w + j]) == ("L" in p[i * w + (j + 1) % w])
            and ("D" in p[i * w + j]) == ("T" in p[((i + 1) % h) * w + j])
            for i in range(h)
            for j in range(w)
        ):
            count += 1
    return count % MOD


def make_input(grids):
    lines = [str(len(grids))]
    for g in grids:
        lines.append(f"{len(g)} {len(g[0])}")
        lines.extend(g)
    return "\n".join(lines) + "\n"


def all_grids(h, w):
    for cells in itertools.product("AB", repeat=h * w):
        yield ["".join(cells[i * w:(i + 1) * w]) for i in range(h)]


class TestTorusLoop(unittest.TestCase):
    def test_smallest_all_b(self):
        # All B, 2x2. A horizontal B forces its right neighbour horizontal, so
        # each row is all-horizontal or has none; likewise columns are
        # all-vertical or have none. One horizontal row therefore rules out
        # every vertical cell: only "all horizontal" and "all vertical" work.
        run_case(self, stdin="1\n2 2\nBB\nBB\n", expected="2")

    def test_smallest_all_a(self):
        # All A, 2x2. Each A has exactly one left/right and one top/bottom
        # endpoint, and the pair picks its rotation. In a row of even length
        # choosing whether the first left edge is used fixes the whole row
        # (2 ways per row); same per column: 2^(2+2) = 16. Brute force agrees.
        run_case(self, stdin="1\n2 2\nAA\nAA\n", expected="16")

    def test_all_2x2_grids_brute_force(self):
        # All 16 tile patterns of a 2x2 grid as one input of T = 16 cases.
        grids = list(all_grids(2, 2))
        expected = "\n".join(str(brute(g)) for g in grids)
        run_case(self, stdin=make_input(grids), expected=expected)

    def test_all_2x3_grids_brute_force(self):
        grids = list(all_grids(2, 3))
        expected = "\n".join(str(brute(g)) for g in grids)
        run_case(self, stdin=make_input(grids), expected=expected)

    def test_all_3x2_grids_brute_force(self):
        grids = list(all_grids(3, 2))
        expected = "\n".join(str(brute(g)) for g in grids)
        run_case(self, stdin=make_input(grids), expected=expected)

    def test_3x3_and_3x4_brute_force(self):
        # Expected by brute force: 2, 0, 2.
        grids = [
            ["AAB", "AAB", "BBB"],
            ["BBA", "ABA", "AAB"],
            ["BAAB", "BABA", "BBAA"],
        ]
        expected = "\n".join(str(brute(g)) for g in grids)
        run_case(self, stdin=make_input(grids), expected=expected)

    def test_all_a_odd_width_is_zero(self):
        # A row of only A tiles has one horizontal endpoint per tile, and
        # every used vertical edge carries two endpoints, so the row's tile
        # count must be even. W = 3 is odd: 0.
        run_case(self, stdin="1\n2 3\nAAA\nAAA\n", expected="0")

    def test_all_a_odd_height_is_zero(self):
        # Same parity argument on a column of H = 3 A tiles: 0.
        run_case(self, stdin="1\n3 2\nAA\nAA\nAA\n", expected="0")

    def test_large_all_b(self):
        # Argument of test_smallest_all_b holds for any size: 2.
        n = 500
        stdin = "1\n%d %d\n" % (n, n) + ("B" * n + "\n") * n
        run_case(self, stdin=stdin, expected="2")

    def test_large_all_a_even(self):
        # Argument of test_smallest_all_a: 2 ways per row and per column,
        # 2^(H+W) mod 998244353.
        n = 500
        stdin = "1\n%d %d\n" % (n, n) + ("A" * n + "\n") * n
        run_case(self, stdin=stdin, expected=str(pow(2, 2 * n, MOD)))

    def test_large_all_a_odd_width(self):
        # Parity argument of test_all_a_odd_width_is_zero: W = 499 gives 0.
        h, w = 500, 499
        stdin = "1\n%d %d\n" % (h, w) + ("A" * w + "\n") * h
        run_case(self, stdin=stdin, expected="0")

    def test_many_small_cases(self):
        # 1000 copies of the 2x2 all-B grid, each answer 2.
        t = 1000
        stdin = "%d\n" % t + "2 2\nBB\nBB\n" * t
        run_case(self, stdin=stdin, expected="\n".join(["2"] * t))


if __name__ == "__main__":
    unittest.main()
