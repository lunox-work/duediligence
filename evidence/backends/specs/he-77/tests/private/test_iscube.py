import unittest

from src.solution import iscube


class TestIsCubePrivate(unittest.TestCase):
    # Extends test_example_one: accept cubes beyond the example constants.
    def test_fifth_integer_cubed(self):
        # 5 * 5 * 5 = 125.
        self.assertIs(iscube(125), True)

    # Extends test_example_two: rejecting only the listed noncubes is insufficient.
    def test_three_is_not_a_cube(self):
        # 1**3 < 3 < 2**3.
        self.assertIs(iscube(3), False)

    # Extends test_example_negative_one: negative cubes are not limited to -1/-27.
    def test_negative_even_root(self):
        # (-2) * (-2) * (-2) = -8.
        self.assertIs(iscube(-8), True)

    # Extends test_example_sixty_four: accept another even root, not just powers of 2.
    def test_sixth_integer_cubed(self):
        # 6 * 6 * 6 = 216.
        self.assertIs(iscube(216), True)

    # Extends test_example_zero: decimal zero digits do not prevent a nonzero cube.
    def test_cube_with_trailing_zeroes(self):
        # 10 * 10 * 10 = 1000.
        self.assertIs(iscube(1000), True)

    # Extends test_example_one_hundred_eighty: a square need not be a cube.
    def test_positive_square_without_integer_cube_root(self):
        # 6**3 = 216 < 225 = 15**2 < 343 = 7**3.
        self.assertIs(iscube(225), False)

    # Extends test_positive_cube: an odd cube with a different last digit.
    def test_seventh_integer_cubed(self):
        # 7 * 7 * 7 = 343.
        self.assertIs(iscube(343), True)

    # Extends test_negative_cube: recognize a further negative odd cube.
    def test_negative_ninth_integer_cubed(self):
        # (-9) * (-9) * (-9) = -729.
        self.assertIs(iscube(-729), True)

    # Extends test_one_below_positive_cube: do not round a root up to 5.
    def test_one_below_fifth_integer_cubed(self):
        # 4**3 = 64 < 124 < 125 = 5**3.
        self.assertIs(iscube(124), False)

    # Extends test_one_above_positive_cube: do not round a root down to 5.
    def test_one_above_fifth_integer_cubed(self):
        # 5**3 = 125 < 126 < 216 = 6**3.
        self.assertIs(iscube(126), False)

    # Extends test_one_below_negative_cube: check the negative boundary at -125.
    def test_one_below_negative_fifth_integer_cubed(self):
        # (-6)**3 = -216 < -126 < -125 = (-5)**3.
        self.assertIs(iscube(-126), False)

    # Extends test_one_above_negative_cube: truncation toward zero is insufficient.
    def test_one_above_negative_fifth_integer_cubed(self):
        # (-5)**3 = -125 < -124 < -64 = (-4)**3.
        self.assertIs(iscube(-124), False)

    # Extends test_large_integer_cube: the root itself exceeds float precision.
    def test_cube_of_root_beyond_exact_float_integers(self):
        # Construct the exact cube with integer arithmetic.
        root = 2**53 + 1
        self.assertIs(iscube(root**3), True)

    # Extends test_one_above_large_integer_cube: float rounding loses this offset.
    def test_one_above_cube_of_large_odd_root(self):
        root = 2**53 + 1
        # root**3 < root**3 + 1 < (root + 1)**3 for root >= 1.
        self.assertIs(iscube(root**3 + 1), False)

    def test_smallest_positive_cube_above_one(self):
        # 2 * 2 * 2 = 8.
        self.assertIs(iscube(8), True)

    def test_small_negative_noncube(self):
        # (-2)**3 = -8 < -2 < -1 = (-1)**3.
        self.assertIs(iscube(-2), False)

    def test_negative_integer_just_above_minus_eight(self):
        # (-2)**3 = -8 < -7 < -1 = (-1)**3.
        self.assertIs(iscube(-7), False)

    def test_negative_integer_just_below_minus_eight(self):
        # (-3)**3 = -27 < -9 < -8 = (-2)**3.
        self.assertIs(iscube(-9), False)

    def test_positive_integer_just_below_eight(self):
        # 1**3 = 1 < 7 < 8 = 2**3.
        self.assertIs(iscube(7), False)

    def test_positive_integer_just_above_eight(self):
        # 2**3 = 8 < 9 < 27 = 3**3.
        self.assertIs(iscube(9), False)

    def test_power_of_two_that_is_not_a_cube(self):
        # 2**3 = 8 < 16 < 27 = 3**3.
        self.assertIs(iscube(16), False)

    def test_integer_that_is_both_square_and_cube(self):
        # 16 * 16 * 16 = 4096 = 64**2.
        self.assertIs(iscube(4096), True)

    def test_cube_of_composite_root(self):
        # 12 * 12 * 12 = 1728.
        self.assertIs(iscube(1728), True)

    def test_negative_cube_with_trailing_zeroes(self):
        # (-10) * (-10) * (-10) = -1000.
        self.assertIs(iscube(-1000), True)

    def test_noncube_with_possible_cube_last_digit(self):
        # 3**3 = 27 < 47 < 64 = 4**3; last-digit filters are insufficient.
        self.assertIs(iscube(47), False)

    def test_negative_square_magnitude_without_cube_root(self):
        # (-7)**3 = -343 < -225 < -216 = (-6)**3.
        self.assertIs(iscube(-225), False)

    def test_one_below_cube_of_large_odd_root(self):
        root = 2**53 + 1
        # (root - 1)**3 < root**3 - 1 < root**3 for root >= 2.
        self.assertIs(iscube(root**3 - 1), False)

    def test_large_negative_cube(self):
        # Exact integer construction gives a negative integer's cube.
        root = -(2**53 + 1)
        self.assertIs(iscube(root**3), True)

    def test_one_below_large_negative_cube(self):
        root = -(2**53 + 1)
        # (root - 1)**3 < root**3 - 1 < root**3 for this negative root.
        self.assertIs(iscube(root**3 - 1), False)

    def test_one_above_large_negative_cube(self):
        root = -(2**53 + 1)
        # root**3 < root**3 + 1 < (root + 1)**3 for root <= -2.
        self.assertIs(iscube(root**3 + 1), False)

    def test_cube_larger_than_finite_float_range(self):
        # Integers have no stated size bound; 10**400 cubed is 10**1200.
        self.assertIs(iscube((10**400)**3), True)

    def test_noncube_larger_than_finite_float_range(self):
        root = 10**400
        # root**3 < root**3 + 1 < (root + 1)**3.
        self.assertIs(iscube(root**3 + 1), False)

    def test_negative_cube_larger_than_finite_float_range(self):
        # The exact integer cube of -(10**400 + 7) is negative.
        root = -(10**400 + 7)
        self.assertIs(iscube(root**3), True)

    def test_negative_noncube_larger_than_finite_float_range(self):
        root = -(10**400 + 7)
        # (root - 1)**3 < root**3 - 1 < root**3.
        self.assertIs(iscube(root**3 - 1), False)
