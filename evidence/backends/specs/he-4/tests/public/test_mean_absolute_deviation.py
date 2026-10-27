import unittest

from src.solution import mean_absolute_deviation


class TestMeanAbsoluteDeviation(unittest.TestCase):
    def test_docstring_example(self):
        self.assertAlmostEqual(
            mean_absolute_deviation([1.0, 2.0, 3.0, 4.0]), 1.0
        )

    def test_skewed_data_uses_arithmetic_mean(self):
        # Mean = 3; absolute deviations = 3, 3, 6; MAD = 12 / 3 = 4.
        self.assertAlmostEqual(mean_absolute_deviation([0.0, 0.0, 9.0]), 4.0)

    def test_single_element(self):
        # The mean equals the sole element, so its absolute deviation is zero.
        self.assertAlmostEqual(mean_absolute_deviation([5.5]), 0.0)

    def test_identical_elements(self):
        # Mean = -2.5; every absolute deviation is zero, so their average is zero.
        self.assertAlmostEqual(
            mean_absolute_deviation([-2.5, -2.5, -2.5]), 0.0
        )

    def test_mixed_sign_values(self):
        # Mean = 1; absolute deviations = 4, 2, 1, 5; MAD = 12 / 4 = 3.
        self.assertAlmostEqual(
            mean_absolute_deviation([-3.0, -1.0, 2.0, 6.0]), 3.0
        )

    def test_all_negative_values(self):
        # Mean = -5; absolute deviations = 3, 1, 2; MAD = 6 / 3 = 2.
        self.assertAlmostEqual(
            mean_absolute_deviation([-8.0, -4.0, -3.0]), 2.0
        )

    def test_two_fractional_values(self):
        # Mean = 0.5; both absolute deviations are 0.25, so MAD = 0.25.
        self.assertAlmostEqual(mean_absolute_deviation([0.25, 0.75]), 0.25)

    def test_fractional_mean_and_deviation(self):
        # Mean = 5/3; absolute deviations = 2/3, 1/3, 1/3.
        # Their average is (4/3) / 3 = 4/9.
        self.assertAlmostEqual(
            mean_absolute_deviation([1.0, 2.0, 2.0]), 4.0 / 9.0
        )


if __name__ == "__main__":
    unittest.main()
