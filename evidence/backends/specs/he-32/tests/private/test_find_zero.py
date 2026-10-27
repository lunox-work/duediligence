import math
import unittest

from src.solution import find_zero


class TestFindZeroHidden(unittest.TestCase):
    # Extends test_docstring_linear_example: a different negative root.
    def test_linear_positive_coefficients(self):
        # 9 + 3x = 0 gives x = -3.
        self.assertAlmostEqual(find_zero([9, 3]), -3.0)

    # Extends test_docstring_linear_example: a positive root outside [-1, 1].
    def test_linear_positive_root(self):
        # -35 + 5x = 0 gives x = 7.
        self.assertAlmostEqual(find_zero([-35, 5]), 7.0)

    # Extends test_minimum_length_with_negative_leading_coefficient.
    def test_linear_both_coefficients_negative(self):
        # -21 - 6x = 0 gives x = -3.5.
        self.assertAlmostEqual(find_zero([-21, -6]), -3.5)

    # Extends test_minimum_length_with_negative_leading_coefficient.
    def test_linear_nonintegral_positive_root(self):
        # 2 - 5x = 0 gives x = 2/5; integer-only searches fail here.
        self.assertAlmostEqual(find_zero([2, -5]), 0.4)

    # Extends test_zero_constant_term_and_unique_zero_root: minimum length.
    def test_linear_zero_constant(self):
        # -7x = 0 has just the root zero.
        self.assertAlmostEqual(find_zero([0, -7]), 0.0)

    # Extends test_docstring_linear_example: coefficient order matters.
    def test_linear_large_positive_root(self):
        # -1500 + 3x = 0 gives x = 500; a small fixed search interval fails.
        self.assertAlmostEqual(find_zero([-1500, 3]), 500.0)

    # Extends test_fractional_coefficients: negative fractional leading term.
    def test_fractional_linear_positive_root(self):
        # 3/8 - (5/8)x = 0 gives x = 3/5.
        self.assertAlmostEqual(find_zero([0.375, -0.625]), 0.6)

    # Extends test_fractional_coefficients: fractional slope, large root.
    def test_fractional_linear_root_outside_unit_interval(self):
        # 2 + x/8 = 0 gives x = -16.
        self.assertAlmostEqual(find_zero([2, 0.125]), -16.0)

    # Extends test_small_nonzero_leading_coefficient: negative linear slope.
    def test_small_negative_slope(self):
        # 3 - 0.0005x = 0 gives x = 6000.
        self.assertAlmostEqual(find_zero([3, -0.0005]), 6000.0)

    # Extends test_docstring_cubic_example: any returned real root is allowed.
    def test_three_nonzero_roots_of_mixed_sign(self):
        # (x + 4)(x + 1)(x - 2) = x^3 + 3x^2 - 6x - 8.
        root = find_zero([-8, -6, 3, 1])
        self.assertAlmostEqual(min(abs(root + 4), abs(root + 1), abs(root - 2)), 0.0)

    # Extends test_docstring_cubic_example: reverse every coefficient's sign.
    def test_three_positive_roots_with_negative_leading_term(self):
        # -(x - 1)(x - 2)(x - 3); changing the sign preserves all roots.
        root = find_zero([6, -11, 6, -1])
        self.assertAlmostEqual(min(abs(root - 1), abs(root - 2), abs(root - 3)), 0.0)

    # Extends test_cubic_with_one_real_root: negative root, all terms nonzero.
    def test_unique_negative_cubic_root(self):
        # (x + 2)(x^2 + 4) = x^3 + 2x^2 + 4x + 8; x^2 + 4 > 0.
        self.assertAlmostEqual(find_zero([8, 4, 2, 1]), -2.0)

    # Extends test_cubic_with_one_real_root: negative highest coefficient.
    def test_unique_positive_cubic_root_with_negative_leading_term(self):
        # -(x - 5)(x^2 + 6) = -x^3 + 5x^2 - 6x + 30.
        self.assertAlmostEqual(find_zero([30, -6, 5, -1]), 5.0)

    # Extends test_cubic_with_one_real_root: root is neither zero nor integer.
    def test_unique_half_integer_cubic_root(self):
        # (2x - 1)(x^2 + 1) = 2x^3 - x^2 + 2x - 1.
        self.assertAlmostEqual(find_zero([-1, 2, -1, 2]), 0.5)

    # Extends test_fractional_coefficients: every cubic coefficient fractional.
    def test_fractional_dense_cubic(self):
        # (1/4)(x + 1/2)(x^2 + 3), with positive quadratic factor.
        self.assertAlmostEqual(find_zero([0.375, 0.75, 0.125, 0.25]), -0.5)

    # Extends test_small_nonzero_leading_coefficient: a different negative root.
    def test_pure_cubic_negative_root(self):
        # x^3 + 27 = 0 has the unique real root -3.
        self.assertAlmostEqual(find_zero([27, 0, 0, 1]), -3.0)

    # Extends test_small_nonzero_leading_coefficient: root inside (0, 1).
    def test_pure_cubic_fractional_root(self):
        # x^3 = 1/64 gives x = 1/4.
        self.assertAlmostEqual(find_zero([-0.015625, 0, 0, 1]), 0.25)

    # Extends test_cubic_with_one_real_root: irrational root prevents rounding.
    def test_irrational_positive_cube_root(self):
        # x^3 = 2 has just the real root 2^(1/3).
        self.assertAlmostEqual(find_zero([-2, 0, 0, 1]), 2 ** (1 / 3))

    # Extends test_cubic_with_one_real_root: irrational negative root.
    def test_irrational_negative_cube_root(self):
        # x^3 = -5 has just the real root -5^(1/3).
        self.assertAlmostEqual(find_zero([5, 0, 0, 1]), -(5 ** (1 / 3)))

    # Extends test_zero_constant_term_and_unique_zero_root: higher degree.
    def test_zero_root_of_seventh_degree_polynomial(self):
        # x(x^2 + 1)^3 = x^7 + 3x^5 + 3x^3 + x; other factor is positive.
        self.assertAlmostEqual(find_zero([0, 1, 0, 3, 0, 3, 0, 1]), 0.0)

    # Extends test_several_distinct_roots_accepts_any_one: asymmetric roots.
    def test_zero_and_two_asymmetric_nonzero_roots(self):
        # x(x - 3)(x + 2) = x^3 - x^2 - 6x.
        root = find_zero([0, -6, -1, 1])
        self.assertAlmostEqual(min(abs(root + 2), abs(root), abs(root - 3)), 0.0)

    # Extends test_several_distinct_roots_accepts_any_one: five real roots.
    def test_five_distinct_real_roots(self):
        # x(x^2 - 1)(x^2 - 9) = x^5 - 10x^3 + 9x.
        root = find_zero([0, 9, 0, -10, 0, 1])
        self.assertAlmostEqual(min(abs(root - r) for r in (-3, -1, 0, 1, 3)), 0.0)

    # Extends test_repeated_root_accepts_either_distinct_zero: no root at zero.
    def test_nonzero_double_root_and_simple_root(self):
        # (x + 3)^2(x - 2) = x^3 + 4x^2 - 3x - 18.
        root = find_zero([-18, -3, 4, 1])
        self.assertAlmostEqual((root + 3) ** 2 * (root - 2), 0.0)

    # Extends test_repeated_root_accepts_either_distinct_zero: triple root.
    def test_negative_triple_root(self):
        # (x + 2)^3 = x^3 + 6x^2 + 12x + 8.
        root = find_zero([8, 12, 6, 1])
        self.assertAlmostEqual((root + 2) ** 3, 0.0)

    # Extends test_repeated_root_accepts_either_distinct_zero: multiplicity five.
    def test_fifth_order_root_with_negative_leading_term(self):
        # -(x - 2)^5 = -x^5 + 10x^4 - 40x^3 + 80x^2 - 80x + 32.
        root = find_zero([32, -80, 80, -40, 10, -1])
        self.assertAlmostEqual(-((root - 2) ** 5), 0.0)

    # Extends test_repeated_root_accepts_either_distinct_zero: both roots repeat.
    def test_double_and_triple_roots_together(self):
        # (x - 2)^2(x + 1)^3 = x^5 - x^4 - 5x^3 + x^2 + 8x + 4.
        root = find_zero([4, 8, 1, -5, -1, 1])
        self.assertAlmostEqual((root - 2) ** 2 * (root + 1) ** 3, 0.0)

    # Extends test_six_coefficients_with_interior_zeros: negative unique root.
    def test_sparse_quintic_negative_root(self):
        # x^5 + x + 246 is strictly increasing and vanishes at -3.
        self.assertAlmostEqual(find_zero([246, 1, 0, 0, 0, 1]), -3.0)

    # Extends test_six_coefficients_with_interior_zeros: negative leading term.
    def test_sparse_quintic_with_negative_leading_term(self):
        # -(x^5 + x + 246) is strictly decreasing and vanishes at -3.
        self.assertAlmostEqual(find_zero([-246, -1, 0, 0, 0, -1]), -3.0)

    # Extends test_six_coefficients_with_interior_zeros: all middle terms zero.
    def test_irrational_fifth_root(self):
        # x^5 = 7 has the unique real solution 7^(1/5).
        self.assertAlmostEqual(find_zero([-7, 0, 0, 0, 0, 1]), 7 ** (1 / 5))

    # Extends test_six_coefficients_with_interior_zeros: eight coefficients.
    def test_sparse_seventh_degree_negative_root(self):
        # x^7 + x + 130 is strictly increasing; (-2)^7 - 2 + 130 = 0.
        self.assertAlmostEqual(find_zero([130, 1, 0, 0, 0, 0, 0, 1]), -2.0)

    # Extends test_six_coefficients_with_interior_zeros: ten coefficients.
    def test_sparse_ninth_degree_positive_root(self):
        # x^9 + x - 19686 is strictly increasing; 3^9 + 3 = 19686.
        self.assertAlmostEqual(find_zero([-19686, 1, 0, 0, 0, 0, 0, 0, 0, 1]), 3.0)

    # Extends test_six_coefficients_with_interior_zeros: sixteen coefficients.
    def test_sparse_fifteenth_degree(self):
        # x^15 + x - 2 is strictly increasing and vanishes at 1.
        self.assertAlmostEqual(find_zero([-2, 1] + [0] * 13 + [1]), 1.0)

    # Extends test_cubic_with_one_real_root: dense polynomial of higher degree.
    def test_dense_eleventh_degree(self):
        # Binomial expansion of (x - 3)(x^2 + 1)^5, whose only real root is 3.
        coefficients = []
        for k in range(6):
            coefficients.extend([-3 * math.comb(5, k), math.comb(5, k)])
        self.assertAlmostEqual(find_zero(coefficients), 3.0)

    # Extends test_small_nonzero_leading_coefficient: uniformly tiny terms.
    def test_uniformly_small_cubic_coefficients(self):
        # Scaling (x + 2)(x^2 + 4) by 2^-20 preserves its unique root -2.
        scale = 2 ** -20
        self.assertAlmostEqual(find_zero([8 * scale, 4 * scale, 2 * scale, scale]), -2.0)

    # Extends test_fractional_coefficients: small coefficients and nonbinary root.
    def test_uniformly_small_fractional_linear_coefficients(self):
        # (3 - 5x)/2^20 = 0 gives x = 3/5 regardless of coefficient scale.
        scale = 2 ** -20
        self.assertAlmostEqual(find_zero([3 * scale, -5 * scale]), 0.6)

    # Extends test_small_nonzero_leading_coefficient: large common scale.
    def test_uniformly_large_cubic_coefficients(self):
        # 10^6 (x + 2)(x^2 + 4) still has just the real root -2.
        self.assertAlmostEqual(find_zero([8000000, 4000000, 2000000, 1000000]), -2.0)
