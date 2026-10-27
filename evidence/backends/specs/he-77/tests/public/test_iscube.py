import unittest

from src.solution import iscube


class TestIsCube(unittest.TestCase):
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

    def test_positive_cube(self):
        # 3 * 3 * 3 = 27.
        self.assertIs(iscube(27), True)

    def test_negative_cube(self):
        # (-3) * (-3) * (-3) = -27.
        self.assertIs(iscube(-27), True)

    def test_one_below_positive_cube(self):
        # 2**3 = 8 < 26 < 27 = 3**3; there is no integer root between 2 and 3.
        self.assertIs(iscube(26), False)

    def test_one_above_positive_cube(self):
        # 3**3 = 27 < 28 < 64 = 4**3; there is no integer root between 3 and 4.
        self.assertIs(iscube(28), False)

    def test_one_below_negative_cube(self):
        # (-4)**3 = -64 < -28 < -27 = (-3)**3.
        self.assertIs(iscube(-28), False)

    def test_one_above_negative_cube(self):
        # (-3)**3 = -27 < -26 < -8 = (-2)**3.
        self.assertIs(iscube(-26), False)

    def test_large_integer_cube(self):
        # (10**6 + 1)**3 = 10**18 + 3*10**12 + 3*10**6 + 1.
        self.assertIs(iscube(1000003000003000001), True)

    def test_one_above_large_integer_cube(self):
        # This is (10**6 + 1)**3 + 1, strictly below (10**6 + 2)**3.
        self.assertIs(iscube(1000003000003000002), False)
