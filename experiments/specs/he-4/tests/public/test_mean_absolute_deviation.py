import unittest

from src.solution import mean_absolute_deviation


class TestMeanAbsoluteDeviation(unittest.TestCase):
    # Docstring example.
    def test_docstring_example(self):
        self.assertAlmostEqual(mean_absolute_deviation([1.0, 2.0, 3.0, 4.0]), 1.0)

    # Rule: the centerpoint is the mean.
    # Typical: [1, 2, 3, 10] has mean 16/4 = 4; deviations 3, 2, 1, 6 sum
    # to 12; 12/4 = 3.0. (Around the median 2.5 it would be 10/4 = 2.5.)
    def test_centerpoint_is_mean_skewed_data(self):
        self.assertAlmostEqual(mean_absolute_deviation([1.0, 2.0, 3.0, 10.0]), 3.0)

    # Boundary: a single element is its own mean, so its deviation is 0.
    def test_single_element_is_zero(self):
        self.assertAlmostEqual(mean_absolute_deviation([5.0]), 0.0)

    # Rule: absolute differences are averaged (divide by the count n).
    # Typical: [1, 3] has mean 2; deviations 1, 1 sum to 2; 2/2 = 1.0.
    # (Dividing by n-1 would give 2.0.)
    def test_average_divides_by_count(self):
        self.assertAlmostEqual(mean_absolute_deviation([1.0, 3.0]), 1.0)

    # Boundary: all elements equal the mean, so every |x - mean| is 0.
    def test_all_equal_is_zero(self):
        self.assertAlmostEqual(mean_absolute_deviation([2.5, 2.5, 2.5]), 0.0)

    # Rule: differences are taken in absolute value.
    # Typical: [-2, -1, 0, 7] has mean 4/4 = 1; deviations 3, 2, 1, 6 sum
    # to 12; 12/4 = 3.0. (Signed differences would sum to 0.)
    def test_absolute_value_with_negatives(self):
        self.assertAlmostEqual(mean_absolute_deviation([-2.0, -1.0, 0.0, 7.0]), 3.0)

    # Boundary: two elements symmetric about 0: [-4, 4] has mean 0;
    # deviations 4, 4 sum to 8; 8/2 = 4.0. (Signed would give 0.)
    def test_absolute_value_symmetric_pair(self):
        self.assertAlmostEqual(mean_absolute_deviation([-4.0, 4.0]), 4.0)


if __name__ == "__main__":
    unittest.main()
