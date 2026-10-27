import unittest

from src.solution import find_zero


# As in the public suite, a result counts as a zero when it is within 0.005
# of a true real root (the docstring rounds to 2 decimals). Unless a comment
# says otherwise, every polynomial here has only simple real roots, so a
# result that makes poly(x) close to 0 is also close to a root.


def _horner(xs, x):
    result = 0.0
    for coeff in reversed(xs):
        result = result * x + coeff
    return result


def _bisect(xs, lo, hi):
    # Plain bisection on a bracket whose endpoint signs differ (checked).
    flo, fhi = _horner(xs, lo), _horner(xs, hi)
    assert flo * fhi < 0, (lo, hi, flo, fhi)
    for _ in range(200):
        mid = (lo + hi) / 2
        fmid = _horner(xs, mid)
        if (fmid < 0) == (flo < 0):
            lo, flo = mid, fmid
        else:
            hi = mid
    return (lo + hi) / 2


class TestFindZeroPrivate(unittest.TestCase):
    def assertNearOneOf(self, value, roots, tol=0.005):
        self.assertTrue(
            any(abs(value - r) < tol for r in roots),
            f"{value!r} is not within {tol} of any root in {roots!r}",
        )

    # Extends test_example_linear: other linear polynomials.

    def test_linear_negative_leading(self):
        # 6 - 4x = 0 -> x = 6 / 4 = 1.5.
        self.assertAlmostEqual(find_zero([6, -4]), 1.5, places=2)

    def test_linear_non_terminating_root(self):
        # 1 + 3x = 0 -> x = -1/3.
        self.assertAlmostEqual(find_zero([1, 3]), -1 / 3, places=2)

    def test_linear_float_coefficients(self):
        # 0.5 - 0.25x = 0 -> x = 0.5 / 0.25 = 2.
        self.assertAlmostEqual(find_zero([0.5, -0.25]), 2.0, places=2)

    def test_linear_duplicate_coefficients(self):
        # 2 + 2x = 0 -> x = -1.
        self.assertAlmostEqual(find_zero([2, 2]), -1.0, places=2)

    def test_linear_root_at_origin_negative_slope(self):
        # 0 - 7x = 0 -> x = 0.
        self.assertAlmostEqual(find_zero([0, -7]), 0.0, places=2)

    # Extends test_even_length_two_minimum: roots far from the origin, which
    # a search confined to a fixed small interval never reaches.

    def test_linear_far_positive_root(self):
        # -20000 + x = 0 -> x = 20000.
        self.assertAlmostEqual(find_zero([-20000, 1]), 20000.0, places=2)

    def test_linear_far_negative_root(self):
        # 5000 + x = 0 -> x = -5000.
        self.assertAlmostEqual(find_zero([5000, 1]), -5000.0, places=2)

    def test_linear_small_leading_coefficient(self):
        # 3 - 0.01x = 0 -> x = 3 / 0.01 = 300.
        self.assertAlmostEqual(find_zero([3, -0.01]), 300.0, places=2)

    # Extends test_example_cubic_three_roots: another cubic with three real
    # roots, none of them 1, 2 or 3.

    def test_cubic_three_roots_other_values(self):
        # (x - 5)(x + 3)(x - 7) = x^3 - 9x^2 - x + 105 -> [105, -1, -9, 1];
        # check: x=5: 125-225-5+105=0, x=-3: -27-81+3+105=0,
        # x=7: 343-441-7+105=0.
        self.assertNearOneOf(find_zero([105, -1, -9, 1]), [5.0, -3.0, 7.0])

    def test_cubic_three_roots_scaled_example(self):
        # 2 * (x - 1)(x - 2)(x - 3) has the same roots as the docstring cubic.
        self.assertNearOneOf(find_zero([-12, 22, -12, 2]), [1.0, 2.0, 3.0])

    # Extends test_zero_cubic_single_real_root: cubics whose single real
    # root is far from the origin.

    def test_cubic_single_root_far_positive(self):
        # (x - 100)(x^2 + 1) = x^3 - 100x^2 + x - 100 -> [-100, 1, -100, 1];
        # x^2 + 1 > 0, so the only real root is 100.
        self.assertAlmostEqual(find_zero([-100, 1, -100, 1]), 100.0, places=2)

    def test_cubic_single_root_far_negative(self):
        # (x + 60)(x^2 + 4) = x^3 + 60x^2 + 4x + 240 -> [240, 4, 60, 1];
        # x^2 + 4 > 0, so the only real root is -60.
        self.assertAlmostEqual(find_zero([240, 4, 60, 1]), -60.0, places=2)

    def test_cubic_small_leading_coefficient(self):
        # -1 + 0.001x^3 = 0 -> x^3 = 1000 -> x = 10 (x^3 is increasing).
        self.assertAlmostEqual(find_zero([-1, 0, 0, 0.001]), 10.0, places=2)

    def test_cubic_duplicate_coefficients(self):
        # 1 + x + x^2 + x^3 = (1 + x)(1 + x^2): only real root is -1.
        self.assertAlmostEqual(find_zero([1, 1, 1, 1]), -1.0, places=2)

    def test_cubic_root_exactly_one(self):
        # -1 + x^3: x^3 is increasing, so the only real root is 1.
        self.assertAlmostEqual(find_zero([-1, 0, 0, 1]), 1.0, places=2)

    # Newton's method from a fixed start point can cycle forever.

    def test_cubic_newton_cycle_from_zero(self):
        # x^3 - 2x + 2: Newton from 0 goes 0 -> 1 -> 0 -> ...
        # Discriminant -4(-2)^3 - 27(2)^2 = 32 - 108 < 0: one real root.
        # p(-2) = -2 < 0 < 3 = p(-1), so the root is bisected in [-2, -1].
        xs = [2, -2, 0, 1]
        root = _bisect(xs, -2.0, -1.0)
        self.assertAlmostEqual(find_zero(xs), root, places=2)

    def test_cubic_newton_cycle_from_one(self):
        # p(x) = q(x - 1) with q(t) = t^3 - 2t + 2, i.e.
        # x^3 - 3x^2 + x + 3 -> [3, 1, -3, 1]. Newton from 1 goes
        # 1 -> 2 -> 1 -> ... (p(1)=2, p'(1)=-2; p(2)=1, p'(2)=1).
        # One real root (a shift of q's); p(-1) = -2 < 0 < 3 = p(0).
        xs = [3, 1, -3, 1]
        root = _bisect(xs, -1.0, 0.0)
        self.assertAlmostEqual(find_zero(xs), root, places=2)

    def test_cubic_all_coefficients_nonzero_float_root(self):
        # 1 + 2x + 3x^2 + 4x^3: derivative 2 + 6x + 12x^2 has discriminant
        # 36 - 96 < 0, so p is increasing with one real root;
        # p(-1) = -2 < 0 < 1 = p(0), so the root is bisected in [-1, 0].
        xs = [1, 2, 3, 4]
        root = _bisect(xs, -1.0, 0.0)
        self.assertAlmostEqual(find_zero(xs), root, places=2)

    # Extends test_zero_root_at_origin: root at the origin at higher degree.

    def test_root_at_origin_degree_five(self):
        # 2x + 3x^5 = x(2 + 3x^4); 2 + 3x^4 > 0, so the only real root is 0.
        self.assertAlmostEqual(find_zero([0, 2, 0, 0, 0, 3]), 0.0, places=2)

    # Extends test_one_zero_of_three_distinct_roots: repeated roots.

    def test_double_root_and_simple_root(self):
        # (x - 1)^2 (x + 2) = x^3 - 3x + 2 -> [2, -3, 0, 1]; check: x=1:
        # 1-3+2=0, x=-2: -8+6+2=0. Near the double root p is about
        # 3(x - 1)^2, so 0.05 is allowed there (|p| < 0.0075 at worst).
        result = find_zero([2, -3, 0, 1])
        self.assertTrue(
            abs(result - (-2.0)) < 0.005 or abs(result - 1.0) < 0.05,
            f"{result!r} is not a zero of (x - 1)^2 (x + 2)",
        )

    def test_triple_root(self):
        # (x - 2)^3 = x^3 - 6x^2 + 12x - 8 -> [-8, 12, -6, 1]; only real root
        # is 2. p = (x - 2)^3 is flat there, so 0.05 is allowed
        # (|p| < 1.25e-4 at worst).
        self.assertNearOneOf(find_zero([-8, 12, -6, 1]), [2.0], tol=0.05)

    # Extends test_one_zero_when_degree_many_roots: degree 7, seven roots.

    def test_one_zero_degree_seven_seven_roots(self):
        # x(x^2 - 1)(x^2 - 4)(x^2 - 9) = x^7 - 14x^5 + 49x^3 - 36x
        # -> [0, -36, 0, 49, 0, -14, 0, 1]; check x=3:
        # 2187 - 3402 + 1323 - 108 = 0.
        result = find_zero([0, -36, 0, 49, 0, -14, 0, 1])
        self.assertNearOneOf(result, [-3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 3.0])

    # Extends test_even_length_six: longer lists.

    def test_even_length_eight(self):
        # -128 + x^7: x^7 is increasing, root 128 ** (1/7) = 2.
        self.assertAlmostEqual(find_zero([-128, 0, 0, 0, 0, 0, 0, 1]), 2.0, places=2)

    def test_even_length_ten_negative_root(self):
        # 1 + x^9: x^9 is increasing, root -1.
        self.assertAlmostEqual(find_zero([1] + [0] * 8 + [1]), -1.0, places=2)

    def test_even_length_twelve(self):
        # -2048 + x^11: x^11 is increasing, root 2048 ** (1/11) = 2.
        self.assertAlmostEqual(find_zero([-2048] + [0] * 10 + [1]), 2.0, places=2)

    def test_even_length_six_all_terms_monotone(self):
        # 3 + x + x^3 + x^5: derivative 1 + 3x^2 + 5x^4 > 0, so one real
        # root; x=-1: 3 - 1 - 1 - 1 = 0.
        self.assertAlmostEqual(find_zero([3, 1, 0, 1, 0, 1]), -1.0, places=2)

    # Extends test_leading_coefficient_not_one / _negative.

    def test_leading_negative_degree_five_negative_root(self):
        # -32 - x^5 = -(x^5 + 32): decreasing, root -2 ((-2)^5 = -32).
        self.assertAlmostEqual(find_zero([-32, 0, 0, 0, 0, -1]), -2.0, places=2)

    def test_leading_negative_degree_seven(self):
        # 128 - x^7: decreasing, root 2.
        self.assertAlmostEqual(find_zero([128, 0, 0, 0, 0, 0, 0, -1]), 2.0, places=2)

    def test_leading_negative_three_roots(self):
        # -(x - 5)(x + 3)(x - 7) -> [-105, 1, 9, -1].
        self.assertNearOneOf(find_zero([-105, 1, 9, -1]), [5.0, -3.0, 7.0])

    def test_leading_large_cubic(self):
        # 5 + 10x^3 = 5(1 + 2x^3): increasing, root -(1/2) ** (1/3).
        self.assertAlmostEqual(find_zero([5, 0, 0, 10]), -(0.5 ** (1 / 3)), places=2)


if __name__ == "__main__":
    unittest.main()
