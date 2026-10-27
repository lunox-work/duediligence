import unittest
from fractions import Fraction

from src.solution import mean_absolute_deviation


class TestMeanAbsoluteDeviationPrivate(unittest.TestCase):
    # Extends test_docstring_example: a shuffled six-element progression.
    def test_shuffled_six_element_progression(self):
        # Mean = 11; absolute deviations sum to 18, so MAD = 3.
        self.assertAlmostEqual(
            mean_absolute_deviation([14.0, 8.0, 12.0, 10.0, 16.0, 6.0]), 3.0
        )

    # Extends test_docstring_example: odd length and different spacing.
    def test_shuffled_odd_progression(self):
        # Mean = 9; deviations are 6, 6, 0, 3, 3, totaling 18.
        self.assertAlmostEqual(
            mean_absolute_deviation([15.0, 3.0, 9.0, 6.0, 12.0]), 18.0 / 5.0
        )

    # Extends test_skewed_data_uses_arithmetic_mean: a negative low outlier.
    def test_negative_low_outlier(self):
        # Mean = -5.6; deviations total 14.4 + 4 * 3.6 = 28.8.
        self.assertAlmostEqual(
            mean_absolute_deviation([-20.0, -2.0, -2.0, -2.0, -2.0]), 5.76
        )

    # Extends test_skewed_data_uses_arithmetic_mean: the mean is an input value.
    def test_skewed_data_contains_mean(self):
        # Mean = 4; deviations are 3, 3, 3, 0, 9, totaling 18.
        self.assertAlmostEqual(
            mean_absolute_deviation([1.0, 1.0, 1.0, 4.0, 13.0]), 18.0 / 5.0
        )

    # Extends test_single_element: a negative fractional singleton.
    def test_negative_singleton(self):
        # A singleton equals its mean, so its deviation is zero.
        self.assertAlmostEqual(mean_absolute_deviation([-17.25]), 0.0)

    # Extends test_single_element: zero is also a valid singleton.
    def test_zero_singleton(self):
        # The mean and the sole element are both zero.
        self.assertAlmostEqual(mean_absolute_deviation([0.0]), 0.0)

    # Extends test_single_element: a much larger finite value.
    def test_large_singleton(self):
        # The sole element still equals the mean.
        self.assertAlmostEqual(mean_absolute_deviation([1_000_000_000_000.0]), 0.0)

    # Extends test_identical_elements: positive values and a longer list.
    def test_identical_positive_elements(self):
        # All eleven deviations from 7.25 are zero.
        self.assertAlmostEqual(mean_absolute_deviation([7.25] * 11), 0.0)

    # Extends test_identical_elements: an even-length all-zero dataset.
    def test_identical_zero_elements(self):
        # Every element and the arithmetic mean equal zero.
        self.assertAlmostEqual(mean_absolute_deviation([0.0] * 12), 0.0)

    # Extends test_mixed_sign_values: balanced signs, zero mean, and a zero.
    def test_balanced_signs_with_zero(self):
        # Mean = 0; absolute values total 7 + 7 + 2 + 2 = 18.
        self.assertAlmostEqual(
            mean_absolute_deviation([-7.0, 7.0, -2.0, 2.0, 0.0]), 18.0 / 5.0
        )

    # Extends test_mixed_sign_values: unsorted odd length with a nonzero mean.
    def test_unsorted_mixed_signs_with_zero(self):
        # Mean = 1; deviations are 7, 5, 1, 2, 1, totaling 16.
        self.assertAlmostEqual(
            mean_absolute_deviation([8.0, -4.0, 0.0, -1.0, 2.0]), 16.0 / 5.0
        )

    # Extends test_all_negative_values: four values, including the mean.
    def test_unsorted_all_negative_values(self):
        # Mean = -8; deviations are 11, 7, 4, 0, totaling 22.
        self.assertAlmostEqual(
            mean_absolute_deviation([-19.0, -1.0, -4.0, -8.0]), 5.5
        )

    # Extends test_two_fractional_values: a fractional pair crossing zero.
    def test_fractional_pair_crossing_zero(self):
        # Mean = -0.75; both absolute deviations equal 2.
        self.assertAlmostEqual(mean_absolute_deviation([-2.75, 1.25]), 2.0)

    # Extends test_two_fractional_values: descending, entirely negative pair.
    def test_descending_negative_fractional_pair(self):
        # Mean = -0.375; both absolute deviations equal 0.25.
        self.assertAlmostEqual(mean_absolute_deviation([-0.125, -0.625]), 0.25)

    # Extends test_fractional_mean_and_deviation: two unequal duplicate counts.
    def test_fractional_values_with_unequal_multiplicities(self):
        # Mean = 2.15; deviations total 2 * 0.9 + 3 * 0.6 = 3.6.
        self.assertAlmostEqual(
            mean_absolute_deviation([1.25, 1.25, 2.75, 2.75, 2.75]), 0.72
        )

    # Extends test_fractional_mean_and_deviation: a nonterminating mean, 15/7.
    def test_seven_values_with_nonterminating_mean(self):
        # Deviations have numerators 15, 8, 8, 8, 8, 6, 41 over 7.
        # Averaging their sum gives 94/49.
        self.assertAlmostEqual(
            mean_absolute_deviation([0.0, 1.0, 1.0, 1.0, 1.0, 3.0, 8.0]),
            94.0 / 49.0,
        )

    # Extends test_identical_elements: one differing element must not be ignored.
    def test_almost_identical_elements(self):
        # Mean = 25/8; deviations total 7 * (1/8) + 7/8 = 7/4.
        self.assertAlmostEqual(mean_absolute_deviation([3.0] * 7 + [4.0]), 7.0 / 32.0)

    # Extends test_docstring_example: small deviations around a large baseline.
    def test_large_baseline_with_fractional_spread(self):
        # Mean = baseline + 0.5; deviations total 0.5 + 0.25 + 0.25 + 0.5.
        baseline = 1_000_000_000_000.0
        self.assertAlmostEqual(
            mean_absolute_deviation(
                [baseline, baseline + 0.25, baseline + 0.75, baseline + 1.0]
            ),
            0.375,
        )

    # Extends test_two_fractional_values: tiny values with unequal deviations.
    def test_small_fractional_scale(self):
        # Mean = 1.5e-6; deviations total 5e-6, giving MAD = 1.25e-6.
        self.assertAlmostEqual(
            mean_absolute_deviation([0.0, 0.000001, 0.000001, 0.000004]),
            0.00000125,
            places=14,
        )

    # Extends test_mixed_sign_values: 1001 descending values and tied deviations.
    def test_long_symmetric_dataset(self):
        # Mean = 0; sum of absolute values = 2 * (500 * 501 / 2) = 250500.
        numbers = [float(value) for value in range(500, -501, -1)]
        self.assertAlmostEqual(mean_absolute_deviation(numbers), 250500.0 / 1001.0)

    # Extends test_skewed_data_uses_arithmetic_mean: multiplicities must count.
    def test_long_imbalanced_two_value_dataset(self):
        # Mean = 5.4; deviations total 97 * 0.6 + 3 * 19.4 = 116.4.
        self.assertAlmostEqual(
            mean_absolute_deviation([6.0] * 97 + [-14.0] * 3), 1.164
        )

    # Extends test_all_negative_values and test_fractional_mean_and_deviation:
    # many negative fractions in an irregular order, with repetitions.
    def test_irregular_negative_fractions(self):
        # Brute-force exact rational arithmetic: sum all values for the mean,
        # then sum every absolute deviation and divide by the element count.
        exact = [Fraction(-1 - (index * 17) % 53, 8) for index in range(79)]
        center = sum(exact, Fraction(0)) / len(exact)
        expected = sum((abs(value - center) for value in exact), Fraction(0)) / len(exact)
        self.assertAlmostEqual(
            mean_absolute_deviation([float(value) for value in exact]), float(expected)
        )
