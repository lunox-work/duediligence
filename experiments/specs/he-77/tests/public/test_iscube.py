import unittest

from src.solution import iscube


class TestIscube(unittest.TestCase):
    # Docstring examples, one test each.

    def test_example_one(self):
        self.assertIs(iscube(1), True)

    def test_example_two(self):
        self.assertIs(iscube(2), False)

    def test_example_negative_one(self):
        self.assertIs(iscube(-1), True)

    def test_example_sixty_four(self):
        self.assertIs(iscube(64), True)

    def test_example_zero(self):
        self.assertIs(iscube(0), True)

    def test_example_one_hundred_eighty(self):
        self.assertIs(iscube(180), False)

    # Rule: a positive cube of an integer returns True.

    def test_positive_cube_typical(self):
        # 3 ** 3 == 27.
        self.assertIs(iscube(27), True)

    def test_positive_cube_large(self):
        # 100 ** 3 == 1000000; a large exact cube, where a float cube root
        # is not exact.
        self.assertIs(iscube(1000000), True)

    # Rule: a negative integer is a cube when it is the cube of a negative
    # integer, so it returns True.

    def test_negative_cube_typical(self):
        # (-3) ** 3 == -27.
        self.assertIs(iscube(-27), True)

    def test_negative_cube_large(self):
        # (-100) ** 3 == -1000000.
        self.assertIs(iscube(-1000000), True)

    # Rule: an integer that is no integer's cube returns False.

    def test_positive_non_cube_typical(self):
        # 4 ** 3 == 64 < 100 < 125 == 5 ** 3, so no integer cubes to 100.
        self.assertIs(iscube(100), False)

    def test_positive_non_cube_just_below_cube(self):
        # 3 ** 3 == 27 < 63 < 64 == 4 ** 3, so no integer cubes to 63.
        self.assertIs(iscube(63), False)

    def test_positive_non_cube_just_above_cube(self):
        # 4 ** 3 == 64 < 65 < 125 == 5 ** 3, so no integer cubes to 65.
        self.assertIs(iscube(65), False)

    def test_positive_non_cube_next_to_large_cube(self):
        # 99 ** 3 == 970299 < 999999 < 1000000 == 100 ** 3.
        self.assertIs(iscube(999999), False)

    def test_negative_non_cube_typical(self):
        # (-5) ** 3 == -125 < -100 < -64 == (-4) ** 3, so no integer cubes
        # to -100 (and a positive integer's cube is positive).
        self.assertIs(iscube(-100), False)

    def test_negative_non_cube_just_beside_cube(self):
        # (-3) ** 3 == -27 < -26 < -8 == (-2) ** 3, so no integer cubes
        # to -26.
        self.assertIs(iscube(-26), False)


if __name__ == "__main__":
    unittest.main()
