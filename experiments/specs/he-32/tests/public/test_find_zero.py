import unittest

from src.solution import find_zero


# The docstring shows results rounded to 2 decimals, so non-example cases
# accept any value within 0.005 of a true root (assertAlmostEqual places=2).
# Every polynomial below has only simple real roots, so a root-finder that
# makes poly(x) close to 0 also puts x close to the root.


class TestFindZero(unittest.TestCase):
    def assertNearOneOf(self, value, roots):
        self.assertTrue(
            any(abs(value - r) < 0.005 for r in roots),
            f"{value!r} is not within 0.005 of any root in {roots!r}",
        )

    # Docstring examples

    def test_example_linear(self):
        self.assertEqual(round(find_zero([1, 2]), 2), -0.5)

    def test_example_cubic_three_roots(self):
        self.assertEqual(round(find_zero([-6, 11, -6, 1]), 2), 1.0)

    # Rule: find_zero finds x such that poly(x) = 0

    def test_zero_cubic_single_real_root(self):
        # -8 + x^3 = (x - 2)(x^2 + 2x + 4); the quadratic factor has
        # discriminant 4 - 16 < 0, so the only real root is x = 2.
        self.assertAlmostEqual(find_zero([-8, 0, 0, 1]), 2.0, places=2)

    def test_zero_root_at_origin(self):
        # x + x^3 = x(1 + x^2); 1 + x^2 > 0, so the only real root is x = 0.
        self.assertAlmostEqual(find_zero([0, 1, 0, 1]), 0.0, places=2)

    # Rule: returns only one zero point, even if there are many

    def test_one_zero_of_three_distinct_roots(self):
        # (x + 1)(x - 2)(x - 4) = x^3 - 5x^2 + 2x + 8 -> [8, 2, -5, 1];
        # check: x=2: 8+4-20+8=0, x=4: 8+8-80+64=0, x=-1: 8-2-5-1=0.
        result = find_zero([8, 2, -5, 1])
        self.assertIsInstance(result, (int, float))
        self.assertNearOneOf(result, [-1.0, 2.0, 4.0])

    def test_one_zero_when_degree_many_roots(self):
        # (x+2)(x+1)x(x-1)(x-2) = x(x^2 - 1)(x^2 - 4) = x^5 - 5x^3 + 4x
        # -> [0, 4, 0, -5, 0, 1]: five real roots, as many as the degree.
        result = find_zero([0, 4, 0, -5, 0, 1])
        self.assertIsInstance(result, (int, float))
        self.assertNearOneOf(result, [-2.0, -1.0, 0.0, 1.0, 2.0])

    # Rule: xs has an even number of coefficients

    def test_even_length_six(self):
        # -32 + x^5: x^5 is strictly increasing, so the only real root is
        # x = 32 ** (1/5) = 2.
        self.assertAlmostEqual(find_zero([-32, 0, 0, 0, 0, 1]), 2.0, places=2)

    def test_even_length_two_minimum(self):
        # -5 + 2x = 0 -> x = 5 / 2 = 2.5.
        self.assertAlmostEqual(find_zero([-5, 2]), 2.5, places=2)

    # Rule: the largest (leading) coefficient is non-zero

    def test_leading_coefficient_not_one(self):
        # -54 + 2x^3 = 2(x^3 - 27) = 2(x - 3)(x^2 + 3x + 9); the quadratic
        # has discriminant 9 - 36 < 0, so the only real root is x = 3.
        self.assertAlmostEqual(find_zero([-54, 0, 0, 2]), 3.0, places=2)

    def test_leading_coefficient_negative(self):
        # 27 - x^3 = -(x - 3)(x^2 + 3x + 9); only real root is x = 3.
        self.assertAlmostEqual(find_zero([27, 0, 0, -1]), 3.0, places=2)


if __name__ == "__main__":
    unittest.main()
