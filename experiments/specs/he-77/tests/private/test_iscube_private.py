import unittest

from src.solution import iscube


class TestIscubePrivate(unittest.TestCase):
    # Extends test_example_one / test_example_negative_one / test_example_zero:
    # every integer in [-2000, 2000], checked against the set of cubes of
    # integers in [-13, 13] (13 ** 3 == 2197 > 2000, so the set holds every
    # cube in range).

    def test_exhaustive_small_range(self):
        cubes = {k ** 3 for k in range(-13, 14)}
        for a in range(-2000, 2001):
            with self.subTest(a=a):
                self.assertIs(iscube(a), a in cubes)

    # Extends test_example_sixty_four: cubes where a float cube root falls
    # just below the integer (64 ** (1/3) == 3.9999999999999996, and the same
    # happens for 125, 1000, ...), so truncating with int() is wrong.

    def test_cubes_where_float_root_is_below_integer(self):
        for k in (5, 10, 25, 50, 100, 1000):
            with self.subTest(k=k):
                self.assertIs(iscube(k ** 3), True)
                self.assertIs(iscube(-(k ** 3)), True)

    # Extends test_positive_cube_typical: every cube k ** 3 for k in
    # 1..3000, each built by multiplication so it is a cube by construction.

    def test_many_positive_cubes(self):
        for k in range(1, 3001):
            with self.subTest(k=k):
                self.assertIs(iscube(k * k * k), True)

    # Extends test_negative_cube_typical: every cube (-k) ** 3 for k in
    # 1..3000.

    def test_many_negative_cubes(self):
        for k in range(1, 3001):
            with self.subTest(k=k):
                self.assertIs(iscube(-(k * k * k)), True)

    # Extends test_positive_non_cube_just_below_cube /
    # test_positive_non_cube_just_above_cube: k ** 3 - 1 and k ** 3 + 1 lie
    # strictly between (k - 1) ** 3 and (k + 1) ** 3 for k >= 2, and differ
    # from k ** 3, so neither is a cube.

    def test_neighbours_of_cubes_are_not_cubes(self):
        for k in range(2, 3001):
            c = k * k * k
            with self.subTest(k=k):
                self.assertIs(iscube(c - 1), False)
                self.assertIs(iscube(c + 1), False)
                self.assertIs(iscube(-c - 1), False)
                self.assertIs(iscube(-c + 1), False)

    # Extends test_positive_cube_large: a cube whose root (10 ** 18 + 1) is
    # not representable as a float, so a float cube root rounds to the wrong
    # integer.

    def test_huge_positive_cube_root_not_float_exact(self):
        self.assertIs(iscube((10 ** 18 + 1) ** 3), True)

    def test_huge_cube_odd_root(self):
        # (2 ** 61 - 1) ** 3, a cube by construction.
        self.assertIs(iscube((2 ** 61 - 1) ** 3), True)

    def test_very_huge_cube(self):
        # (10 ** 40 + 7) ** 3, a cube by construction.
        self.assertIs(iscube((10 ** 40 + 7) ** 3), True)

    # Extends test_negative_cube_large: negative counterparts of the huge
    # cubes above.

    def test_huge_negative_cube_root_not_float_exact(self):
        self.assertIs(iscube(-((10 ** 18 + 1) ** 3)), True)

    def test_very_huge_negative_cube(self):
        self.assertIs(iscube(-((10 ** 40 + 7) ** 3)), True)

    # Extends test_positive_non_cube_next_to_large_cube: neighbours of large
    # cubes. For k >= 2, k ** 3 +/- 1 lies strictly between (k - 1) ** 3 and
    # (k + 1) ** 3 and differs from k ** 3, so it is no cube. A float check
    # with a tolerance accepts these.

    def test_cube_of_million_plus_one_is_not_cube(self):
        # (10 ** 6) ** 3 + 1 == 10 ** 18 + 1.
        self.assertIs(iscube(10 ** 18 + 1), False)

    def test_cube_of_million_minus_one_is_not_cube(self):
        self.assertIs(iscube(10 ** 18 - 1), False)

    def test_huge_cube_plus_one_is_not_cube(self):
        self.assertIs(iscube((10 ** 18 + 1) ** 3 + 1), False)

    def test_huge_cube_minus_one_is_not_cube(self):
        self.assertIs(iscube((10 ** 18 + 1) ** 3 - 1), False)

    def test_very_huge_cube_plus_one_is_not_cube(self):
        self.assertIs(iscube((10 ** 40 + 7) ** 3 + 1), False)

    # Extends test_negative_non_cube_typical /
    # test_negative_non_cube_just_beside_cube: large negative non-cubes.

    def test_negative_huge_cube_neighbour_is_not_cube(self):
        self.assertIs(iscube(-((10 ** 18 + 1) ** 3) + 1), False)
        self.assertIs(iscube(-((10 ** 18 + 1) ** 3) - 1), False)

    def test_negative_million_cube_neighbour_is_not_cube(self):
        self.assertIs(iscube(-(10 ** 18) + 1), False)
        self.assertIs(iscube(-(10 ** 18) - 1), False)

    # Extends test_example_two / test_example_one_hundred_eighty: perfect
    # squares and other powers that are not cubes. 4 lies between 1 and 8;
    # 16, 25 between 8 and 27; 32 between 27 and 64; 128 between 125 and 216;
    # 2 ** 31 = 2147483648 between 1290 ** 3 = 2146689000 and
    # 1291 ** 3 = 2151685171.

    def test_non_cube_powers(self):
        for a in (4, 16, 25, 32, 128, 2 ** 31):
            with self.subTest(a=a):
                self.assertIs(iscube(a), False)
                self.assertIs(iscube(-a), False)

    # Residue shortcut: every cube is 0, 1 or 8 mod 9, but not conversely.
    # 10 (== 1 mod 9) and 26 (== 8 mod 9) lie between 8 and 27; 63
    # (== 0 mod 9) between 27 and 64; 999 (== 0 mod 9) between 729 and 1000.

    def test_non_cubes_with_cube_residues_mod_nine(self):
        for a in (10, 26, 63, 999):
            with self.subTest(a=a):
                self.assertIs(iscube(a), False)
                self.assertIs(iscube(-a), False)


if __name__ == "__main__":
    unittest.main()
