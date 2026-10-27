import unittest

from src.solution import find_zero


class TestFindZero(unittest.TestCase):
    def test_docstring_linear_example(self):
        self.assertAlmostEqual(round(find_zero([1, 2]), 2), -0.5)

    def test_docstring_cubic_example(self):
        self.assertAlmostEqual(round(find_zero([-6, 11, -6, 1]), 2), 1.0)

    def test_minimum_length_with_negative_leading_coefficient(self):
        # Two coefficients is the minimum allowed length; 6 - 3x = 0 at x = 2.
        self.assertAlmostEqual(find_zero([6, -3]), 2.0)

    def test_cubic_with_one_real_root(self):
        # x^3 + x - 2 = (x - 1)(x^2 + x + 2).
        # The quadratic has discriminant -7, so the only real root is 1.
        self.assertAlmostEqual(find_zero([-2, 1, 0, 1]), 1.0)

    def test_zero_constant_term_and_unique_zero_root(self):
        # x^3 + x = x(x^2 + 1), whose only real root is zero.
        self.assertAlmostEqual(find_zero([0, 1, 0, 1]), 0.0)

    def test_several_distinct_roots_accepts_any_one(self):
        # x^3 - x = x(x - 1)(x + 1); any of -1, 0, 1 is allowed.
        root = find_zero([0, -1, 0, 1])
        self.assertAlmostEqual(min(abs(root + 1), abs(root), abs(root - 1)), 0.0)

    def test_repeated_root_accepts_either_distinct_zero(self):
        # x^3 - x^2 = x^2(x - 1), so a returned zero may be 0 or 1.
        # Check the polynomial itself to allow approximation at the double root.
        root = find_zero([0, 0, -1, 1])
        self.assertAlmostEqual(root * root * (root - 1), 0.0)

    def test_six_coefficients_with_interior_zeros(self):
        # 2^5 + 2 - 34 = 0. The derivative 5x^4 + 1 is positive,
        # so x^5 + x - 34 has exactly one real root, namely 2.
        self.assertAlmostEqual(find_zero([-34, 1, 0, 0, 0, 1]), 2.0)

    def test_fractional_coefficients(self):
        # 0.75 + 1.5x = 0 gives x = -0.75 / 1.5 = -0.5.
        self.assertAlmostEqual(find_zero([0.75, 1.5]), -0.5)

    def test_small_nonzero_leading_coefficient(self):
        # 1 + x^3 / 8 = 0 gives x^3 = -8 and the unique real root -2.
        self.assertAlmostEqual(find_zero([1, 0, 0, 0.125]), -2.0)
